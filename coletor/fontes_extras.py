"""Fontes extras do painel: portal Fiorilli da Prefeitura, SICONFI (Tesouro) e Transferegov.

Portal Fiorilli (dados abertos em JSON, sem chave):
  https://fiorilli.itabera.online/transparencia/versaoJson/DadosAbertos/
  - Despesas/DespesasGerais: todos os empenhos do ano, com secretaria, área, fonte e
    valores acumulados de empenhado, liquidado e pago.
  - Pessoal/Servidores: folha nome a nome do mês (o CPF já vem mascarado e não é guardado).
  - Despesas/Diarias, LicitacoesEContratos/Licitacoes e Contratos, Receitas/*, Transferencias/*.
SICONFI: Relatório de Gestão Fiscal (despesa com pessoal x limite da LRF).
Transferegov: emendas parlamentares "Pix" recebidas pelo município.

Cada função escreve arquivos prontos para o painel em site/data/ e devolve um resumo.
"""
from __future__ import annotations

import datetime as dt
import json
import time
import urllib.parse

from coletar import CNPJ_PREFEITURA, DADOS, SITE_DATA, get_json, hoje, log, salvar, valor

FIORILLI = "https://fiorilli.itabera.online/transparencia/VersaoJson"
IBGE_ITABERA = 3521705
ANO_INICIAL_FIORILLI = 2024


def fiorilli(caminho: str, ano: int, **params):
    q = {"ConectarExercicio": ano, "Empresa": 1, "MostraDadosConsolidado": "False", **params}
    url = f"{FIORILLI}/{caminho}/?" + urllib.parse.urlencode(q)
    status, dados = get_json(url, timeout=600)
    time.sleep(0.5)
    return dados if isinstance(dados, list) else []


def periodo_ano(ano: int) -> dict:
    return {"DiaInicioPeriodo": "01", "MesInicialPeriodo": "01", "DiaFinalPeriodo": "31",
            "MesFinalPeriodo": "12", "Ano": ano}


def data_br(s) -> str:
    """'14/04/2026 00:00:00' -> '2026-04-14' (vazio se não houver)."""
    s = str(s or "").strip()[:10]
    if len(s) == 10 and s[2] == "/" and s[5] == "/":
        return f"{s[6:10]}-{s[3:5]}-{s[0:2]}"
    return ""


def texto(s, n: int | None = None) -> str:
    t = " ".join(str(s or "").split())
    return t[:n] + "…" if n and len(t) > n else t


def anos_para_atualizar(arquivo_existe) -> list[int]:
    """Ano corrente sempre; ano anterior até março (restos a pagar) ou se ainda não existir; demais só se faltarem."""
    anos = []
    for a in range(ANO_INICIAL_FIORILLI, hoje.year + 1):
        if a == hoje.year or (a == hoje.year - 1 and hoje.month <= 3) or not arquivo_existe(a):
            anos.append(a)
    return anos


class Tabela:
    """Transforma textos repetidos em índices para deixar os arquivos do painel pequenos."""

    def __init__(self):
        self.itens: list[str] = []
        self.idx: dict[str, int] = {}

    def __call__(self, s) -> int:
        s = texto(s) or "Não informado"
        if s not in self.idx:
            self.idx[s] = len(self.itens)
            self.itens.append(s)
        return self.idx[s]


# ---------------------------------------------------------------- despesas (empenhos do portal)

def coletar_despesas() -> dict:
    """Gera site/data/despesas-{ano}.json e o histórico de pagamentos detectados dia a dia.

    {"forn": [...], "doc": [...], "sec": [...], "area": [...], "nat": [...], "mod": [...],
     "r": [[id, numero, "AAAA-MM-DD", forn, doc, sec, area, nat, mod, descricao, empenhado, liquidado, pago]]}
    """
    out = {}
    for ano in anos_para_atualizar(lambda a: (SITE_DATA / f"despesas-{a}.json").exists()):
        dados = fiorilli("Despesas", ano, Listagem="DespesasGerais", MostrarFornecedor="True",
                         UFParaFiltroCOVID="", MostrarCNPJFornecedor="True", ApenasIDEmpenho="False",
                         **periodo_ano(ano))
        if not dados:
            log(f"  Fiorilli despesas {ano}: vazio")
            continue
        forn, doc, sec, area, nat, mod = Tabela(), Tabela(), Tabela(), Tabela(), Tabela(), Tabela()
        regs, vistos = [], set()
        for d in dados:
            pk = str(d.get("PKEMP") or "")
            if not pk or pk in vistos:
                continue
            vistos.add(pk)
            emp = round(valor(d.get("EMPENHADO")), 2)
            regs.append([
                pk, f"{d.get('CODIGO') or ''}/{ano}", data_br(d.get("DATAE")),
                forn(d.get("NOMEFOR")), doc(d.get("CPFFORMATADO")), sec(d.get("NOMELOCAL")),
                area(d.get("FUNCAONOME")), nat(d.get("NATUREZA")),
                mod(d.get("DESCLICIT_DETALHESEMPENHO") or d.get("LICIT")),
                texto(d.get("PRODU"), 220), emp,
                round(valor(d.get("LIQUIDADO")), 2), round(valor(d.get("PAGO")), 2),
            ])
        regs.sort(key=lambda r: (r[2], int(r[0]) if r[0].isdigit() else 0), reverse=True)
        salvar(SITE_DATA / f"despesas-{ano}.json", {
            "forn": forn.itens, "doc": doc.itens, "sec": sec.itens, "area": area.itens,
            "nat": nat.itens, "mod": mod.itens, "r": regs})
        detectar_pagamentos(ano, regs, forn.itens, sec.itens)
        out[ano] = len(regs)
        log(f"  Fiorilli despesas {ano}: {len(regs)} empenhos")
    return {"anos": out}


def detectar_pagamentos(ano: int, regs: list, fornecedores: list, secretarias: list) -> None:
    """Compara o valor pago de cada empenho com o da coleta anterior.

    O portal só informa o total pago até hoje; a diferença entre uma coleta e outra
    é o que foi pago desde a última coleta. Fica em site/data/pagamentos-recentes.json (últimos 120 dias).
    """
    snap = DADOS / "fiorilli" / f"pago-{ano}.json"
    antes = json.loads(snap.read_text(encoding="utf-8")) if snap.exists() else None
    agora = {r[0]: r[12] for r in regs}
    salvar(snap, agora)
    arq = SITE_DATA / "pagamentos-recentes.json"
    hist = json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else []
    if antes is None:
        return  # primeira coleta do ano: ainda não há com o que comparar
    dia = hoje.isoformat()
    hist = [h for h in hist if not (h["dia"] == dia and h["ano"] == ano)]  # rodar duas vezes no dia não duplica
    por_pk = {r[0]: r for r in regs}
    for pk, pago in agora.items():
        dif = round(pago - antes.get(pk, 0.0), 2)
        if abs(dif) >= 0.01:
            r = por_pk[pk]
            hist.append({"dia": dia, "ano": ano, "id": pk, "num": r[1], "forn": fornecedores[r[3]],
                         "sec": secretarias[r[5]], "desc": texto(r[9], 140), "valor": dif})
    limite = (hoje - dt.timedelta(days=120)).isoformat()
    hist = sorted((h for h in hist if h["dia"] >= limite), key=lambda h: (h["dia"], h["valor"]), reverse=True)
    salvar(arq, hist)


# ---------------------------------------------------------------- folha de pagamento

def coletar_folha() -> dict:
    """site/data/folha-AAAA-MM.json (um por mês) e site/data/folha-meses.json (meses disponíveis).

    {"sec": [...], "vinc": [...], "cargo": [...], "local": [...],
     "r": [[nome, cargo, sec, local, vinc, admissao, bruto, descontos, liquido, rescisao(0/1)]]}
    """
    idx_arq = SITE_DATA / "folha-meses.json"
    meses = set(json.loads(idx_arq.read_text(encoding="utf-8"))) if idx_arq.exists() else set()
    novos = 0
    a, m = ANO_INICIAL_FIORILLI, 1
    while (a, m) <= (hoje.year, hoje.month):
        chave = f"{a}-{m:02d}"
        recente = (hoje.year * 12 + hoje.month) - (a * 12 + m) < 3
        if chave not in meses or recente:
            dados = fiorilli("Pessoal", a, Listagem="Servidores", Ano=a, MesFinalPeriodo=f"{m:02d}")
            if dados:
                sec, vinc, cargo, local = Tabela(), Tabela(), Tabela(), Tabela()
                regs = []
                for d in dados:
                    bruto, desc = round(valor(d.get("PROVENTOS")), 2), round(valor(d.get("DESCONTOS")), 2)
                    regs.append([
                        texto(d.get("NOME_SOCIAL") or d.get("NOME")), cargo(d.get("CARGO")), sec(d.get("DIVISAO")),
                        local(d.get("LOCALDETRABALHO") or d.get("UNIDADE")), vinc(d.get("VINCULO")),
                        data_br(d.get("DATAADMISSAO")), bruto, desc, round(bruto - desc, 2),
                        1 if "resc" in str(d.get("REFERENCIA_NOME") or "").lower() else 0,
                    ])
                regs.sort(key=lambda r: -r[6])
                salvar(SITE_DATA / f"folha-{chave}.json", {"sec": sec.itens, "vinc": vinc.itens,
                                                         "cargo": cargo.itens, "local": local.itens, "r": regs})
                meses.add(chave)
                novos += 1
                log(f"  Fiorilli folha {chave}: {len(regs)} pessoas")
        m += 1
        if m > 12:
            a, m = a + 1, 1
    salvar(idx_arq, sorted(meses))
    return {"meses": len(meses), "atualizados": novos}


# ---------------------------------------------------------------- diárias, licitações e contratos

def coletar_diarias() -> dict:
    out = {}
    for ano in anos_para_atualizar(lambda a: (SITE_DATA / f"diarias-{a}.json").exists()):
        dados = fiorilli("Despesas", ano, Listagem="Diarias", **periodo_ano(ano))
        lista = [{
            "dia": data_br(d.get("DATA")), "fav": texto(d.get("FAVORECIDO")), "doc": texto(d.get("CPFFORMATADO")),
            "cargo": texto(d.get("CARGO")), "orgao": texto(d.get("NOMEORGAO")), "tipo": texto(d.get("NOME_ELEMENTO")),
            "desc": texto(d.get("DESCRICAO"), 260), "valor": round(valor(d.get("VALOR")) - valor(d.get("VALORANULADO")), 2),
            "emp": texto(d.get("NEMPG")),
        } for d in dados]
        lista.sort(key=lambda x: x["dia"], reverse=True)
        salvar(SITE_DATA / f"diarias-{ano}.json", lista)
        out[ano] = len(lista)
        log(f"  Fiorilli diárias {ano}: {len(lista)}")
    return {"anos": out}


def coletar_licitacoes_contratos() -> dict:
    out = {}
    for ano in anos_para_atualizar(lambda a: (SITE_DATA / f"licitacoes-{a}.json").exists()):
        yy = f"{ano % 100:02d}"
        lic = {}
        for d in fiorilli("LicitacoesEContratos", ano, Listagem="Licitacoes", Ano=ano):
            if str(d.get("ANO") or "").strip() != yy:
                continue  # o portal devolve também processos antigos ainda ativos
            chave = d.get("PROCLIC") or d.get("NLICITACAO")
            item = {
                "proc": texto(d.get("PROCLIC")), "mod": texto(d.get("LICIT")).title(),
                "abertura": data_br(d.get("DATAE")), "envio": data_br(d.get("DTENV")),
                "objeto": texto(d.get("DISCR"), 300), "situacao": texto(d.get("SITUACAO")) or "Sem situação",
                "valor": round(valor(d.get("VALOR")), 2), "srp": d.get("REGISTROPRECO") == "S",
            }
            atual = lic.get(chave)
            if not atual or (item["situacao"] != "Sem situação" and atual["situacao"] == "Sem situação") or item["valor"] > atual["valor"]:
                lic[chave] = item
        lista = sorted(lic.values(), key=lambda x: (x["abertura"], x["proc"]), reverse=True)
        salvar(SITE_DATA / f"licitacoes-{ano}.json", lista)

        cts = [{
            "num": texto(d.get("CONTRATONUM") or d.get("CODIGO")), "mod": texto(d.get("MODALI")).title(),
            "proc": texto(d.get("PROCLIC")), "forn": texto(d.get("FORNECEDOR")), "doc": texto(d.get("INSMF")),
            "objeto": texto(d.get("OBJETO_COMPLETO") or d.get("OBJETO"), 300),
            "valor": round(valor(d.get("VALCON")), 2), "aditado": round(valor(d.get("ADITADO")), 2),
            "empenhado": round(valor(d.get("EMPENHADO")) + valor(d.get("EMPENHADOANT")), 2),
            "liquidado": round(valor(d.get("LIQUIDADO")) + valor(d.get("LIQUIDADOANT")), 2),
            "assinatura": data_br(d.get("DTASSI")), "inicio": data_br(d.get("VIGENI")),
            "fim": data_br(d.get("VENCIMENTO_ATUAL") or d.get("VIGENF")),
            "anulado": bool(str(d.get("DTANULA") or "").strip()),
        } for d in fiorilli("LicitacoesEContratos", ano, Listagem="Contratos", Ano=ano, ContratosApenasPublicados="False")]
        cts.sort(key=lambda x: x["assinatura"], reverse=True)
        salvar(SITE_DATA / f"contratos-{ano}.json", cts)
        out[ano] = {"licitacoes": len(lista), "contratos": len(cts)}
        log(f"  Fiorilli {ano}: {len(lista)} licitações, {len(cts)} contratos")
    return {"anos": out}


# ---------------------------------------------------------------- receitas

def coletar_receitas() -> dict:
    """site/data/receitas-{ano}.json: receita orçamentária (árvore por código) e transferências da União e do Estado."""
    out = {}
    for ano in anos_para_atualizar(lambda a: (SITE_DATA / f"receitas-{a}.json").exists()):
        res = {}
        for nome in ("ReceitaOrcamentaria", "ReceitaUniao", "ReceitaEstado"):
            res[nome] = [{
                "cod": texto(d.get("CODIGO")), "nome": texto(d.get("NOME")),
                "previsto": round(valor(d.get("PREVISAO_ATUALIZADA")), 2),
                "arrecadado": round(valor(d.get("ARRECADADO_TOTAL")), 2),
            } for d in fiorilli("Receitas", ano, Listagem=nome, **periodo_ano(ano))]
        if not res["ReceitaOrcamentaria"]:
            continue
        salvar(SITE_DATA / f"receitas-{ano}.json",
               {"orcamentaria": res["ReceitaOrcamentaria"], "uniao": res["ReceitaUniao"], "estado": res["ReceitaEstado"]})
        out[ano] = len(res["ReceitaOrcamentaria"])
        log(f"  Fiorilli receitas {ano}: {out[ano]} linhas")
    return {"anos": out}


# ---------------------------------------------------------------- emendas

def coletar_emendas() -> dict:
    pix = []
    q = urllib.parse.urlencode({"cnpj_beneficiario_plano_acao": f"eq.{CNPJ_PREFEITURA}", "order": "ano_plano_acao.desc"})
    status, dados = get_json(f"https://api.transferegov.gestao.gov.br/transferenciasespeciais/plano_acao_especial?{q}")
    for d in dados or []:
        pix.append({
            "ano": d.get("ano_plano_acao"), "parlamentar": texto(d.get("nome_parlamentar_emenda_plano_acao")),
            "emenda": texto(d.get("numero_emenda_parlamentar_plano_acao") or d.get("codigo_emenda_plano_acao")),
            "custeio": round(valor(d.get("valor_custeio_plano_acao")), 2),
            "investimento": round(valor(d.get("valor_investimento_plano_acao")), 2),
            "situacao": texto(d.get("situacao_plano_acao")), "codigo": texto(d.get("codigo_plano_acao")),
        })
    impositivas = []
    for ano in range(ANO_INICIAL_FIORILLI, hoje.year + 1):
        for d in fiorilli("Transferencias", ano, Listagem="EmendasImpositivasArt166A"):
            impositivas.append({"ano": ano, "tipo": texto(d.get("TIPOTRANSF")), "recebido": round(valor(d.get("RECTRANSF")), 2),
                                "empenhado": round(valor(d.get("EMPENHADO")), 2), "liquidado": round(valor(d.get("LIQUIDADO")), 2),
                                "pago": round(valor(d.get("PAGO")), 2)})
    salvar(SITE_DATA / "emendas.json", {"pix": pix, "impositivas": impositivas})
    log(f"  emendas: {len(pix)} Pix, {len(impositivas)} linhas de impositivas")
    return {"pix": len(pix), "impositivas": len(impositivas)}


# ---------------------------------------------------------------- LRF (SICONFI)

def coletar_lrf() -> dict:
    """Despesa com pessoal do Executivo x Receita Corrente Líquida, por quadrimestre (RGF Anexo 01)."""
    arq = SITE_DATA / "lrf.json"
    hist = {h["periodo"]: h for h in (json.loads(arq.read_text(encoding="utf-8")) if arq.exists() else [])}
    base = "https://apidatalake.tesouro.gov.br/ords/siconfi/tt/rgf"
    for ano in range(2021, hoje.year + 1):
        for q in (1, 2, 3):
            chave = f"{ano}-Q{q}"
            if chave in hist and ano < hoje.year - 1:
                continue
            params = urllib.parse.urlencode({
                "an_exercicio": ano, "in_periodicidade": "Q", "nr_periodo": q, "co_tipo_demonstrativo": "RGF",
                "no_anexo": "RGF-Anexo 01", "co_esfera": "M", "co_poder": "E", "id_ente": IBGE_ITABERA})
            status, r = get_json(f"{base}?{params}")
            itens = (r or {}).get("items") or []
            if not itens:
                continue
            linhas = [{"conta": texto(i.get("conta")), "coluna": texto(i.get("coluna")), "valor": i.get("valor")}
                      for i in itens if not str(i.get("coluna") or "").startswith("<MR")]
            meses = {}
            for i in itens:  # despesa bruta com pessoal mês a mês (<MR-11> ... <MR>)
                col = str(i.get("coluna") or "")
                if col.startswith("<MR") and "BRUTA COM PESSOAL" in str(i.get("conta") or "").upper():
                    n = 0 if col == "<MR>" else int(col[4:-1])
                    meses[n] = i.get("valor")
            fim_mes = {1: 4, 2: 8, 3: 12}[q]
            mensal = []
            for n, v in sorted(meses.items(), reverse=True):
                d = dt.date(ano, fim_mes, 1)
                mm = d.year * 12 + d.month - 1 - n
                mensal.append({"mes": f"{mm // 12}-{mm % 12 + 1:02d}", "valor": v})
            hist[chave] = {"periodo": chave, "ano": ano, "quadrimestre": q, "linhas": linhas, "pessoal_mensal": mensal}
            log(f"  SICONFI RGF {chave}: {len(linhas)} linhas")
            time.sleep(1)
    salvar(arq, sorted(hist.values(), key=lambda h: h["periodo"]))
    return {"periodos": len(hist)}
