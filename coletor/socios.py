"""Quadro societário (QSA) dos fornecedores e cruzamento com a folha de pagamento.

Duas saídas, com cuidados diferentes:

1. site/data/socios.json (público). Para cada fornecedor com CNPJ: razão social, abertura,
   situação, cidade e sócios (nome, qualificação, data de entrada), como a Receita Federal já
   publica. Mais sinais sobre as empresas: aberta pouco antes do primeiro empenho, situação
   irregular, endereço, telefone ou sócio em comum com outro fornecedor. O CPF mascarado dos
   sócios NÃO vai para o site.

2. site/data/reservado.json (criptografado). Cruzamento de sócios e titulares com os nomes da
   folha. Só é gravado criptografado com a senha do secret PREFITA_SENHA (AES-256-GCM, chave
   derivada por PBKDF2-SHA256). Sem a senha, o arquivo não é gerado e nada aberto é salvo.
   O painel pede a senha na aba "Área reservada" e decifra no navegador.

Fonte do QSA: minhareceita.org (dados abertos do CNPJ da Receita), com BrasilAPI de reserva.
As respostas ficam em .cache/cnpj/ (fora do repositório; o workflow guarda com actions/cache)
e são renovadas a cada DIAS_VALIDADE dias.

Os logs do Actions são públicos neste repositório: aqui só se imprime contagem, nunca nomes.
"""
from __future__ import annotations

import base64
import datetime as dt
import json
import os
import re
import secrets
import time
import unicodedata
from collections import defaultdict
from pathlib import Path

from coletar import CNPJ_PREFEITURA, RAIZ, SITE_DATA, get_json, hoje, log, salvar

CACHE = Path(os.environ.get("PREFITA_CACHE_CNPJ", RAIZ / ".cache" / "cnpj"))
DIAS_VALIDADE = 60
MAX_CONSULTAS = int(os.environ.get("PREFITA_MAX_CNPJ", "1200"))  # por execução; o resto fica para o dia seguinte
PAUSA = 0.5
ITERACOES_PBKDF2 = 600_000
DIAS_ABERTURA_RECENTE = 180

# ---------------------------------------------------------------- utilidades

PARTICULAS = {"DA", "DE", "DO", "DAS", "DOS", "E"}
SOBRENOMES_COMUNS = {  # coincidência com esses quase sempre é acaso
    "SILVA", "SANTOS", "OLIVEIRA", "SOUZA", "SOUSA", "LIMA", "PEREIRA", "FERREIRA", "COSTA", "RODRIGUES",
    "ALMEIDA", "NASCIMENTO", "CARVALHO", "GOMES", "MARTINS", "ARAUJO", "RIBEIRO", "ALVES", "BARBOSA",
    "ROCHA", "DIAS", "MOREIRA", "CARDOSO", "MENDES", "FERNANDES", "MORAES", "MORAIS", "LOPES", "SOARES",
    "VIEIRA", "CAMARGO", "MACHADO", "GONCALVES", "PINTO", "JUNIOR", "FILHO", "NETO", "SOBRINHO",
}


def so_digitos(s) -> str:
    return re.sub(r"\D", "", str(s or ""))


def normalizar(nome) -> str:
    t = unicodedata.normalize("NFKD", str(nome or "")).encode("ascii", "ignore").decode()
    t = re.sub(r"[^A-Z ]", " ", t.upper())
    return " ".join(t.split())


def sobrenomes(nome_norm: str) -> list[str]:
    partes = [p for p in nome_norm.split() if p not in PARTICULAS]
    return partes[1:] if len(partes) > 1 else []


def nome_titular(razao: str) -> str:
    """Empresário individual / MEI: a razão social costuma ser '12.345.678 FULANO DE TAL'."""
    return normalizar(re.sub(r"^[\d.\-/ ]+", "", razao or ""))


def cpf_confere(mascara_portal: str, mascara_receita: str) -> bool | None:
    """O portal mostra os 3 primeiros e os 2 últimos dígitos (123.XXX.XXX-45); a Receita mostra
    os 6 do meio (***456789**). Juntando os 9 primeiros, os 2 dígitos verificadores calculados
    precisam bater com os do portal. Erro de homônimo: ~1 em 100. O CPF montado só existe aqui,
    na memória, para essa conta; não é gravado nem impresso.
    Devolve None quando falta uma das máscaras."""
    p, r = so_digitos(mascara_portal), str(mascara_receita or "")
    m = re.fullmatch(r"\*{3}(\d{6})\*{2}", r.strip())
    if len(p) != 5 or not m or m.group(1) == "000000":
        return None
    nove = [int(c) for c in p[:3] + m.group(1)]
    d1 = sum(d * (10 - i) for i, d in enumerate(nove)) * 10 % 11 % 10
    d2 = sum(d * (11 - i) for i, d in enumerate(nove + [d1])) * 10 % 11 % 10
    return f"{d1}{d2}" == p[3:]


# ---------------------------------------------------------------- fornecedores já coletados

def fornecedores() -> dict[str, dict]:
    """CNPJ -> {nome, valor, primeiro, ultimo, fontes}. Junta portal da Prefeitura, TCE e PNCP."""
    f: dict[str, dict] = {}

    def add(cnpj, nome, valor, data):
        if len(cnpj) != 14 or cnpj == CNPJ_PREFEITURA:
            return
        x = f.setdefault(cnpj, {"nome": nome, "valor": 0.0, "primeiro": "", "ultimo": ""})
        x["valor"] += valor or 0.0
        if data:
            x["primeiro"] = min(x["primeiro"] or data, data)
            x["ultimo"] = max(x["ultimo"], data)

    for arq in sorted(SITE_DATA.glob("despesas-*.json")):
        d = json.loads(arq.read_text(encoding="utf-8"))
        for r in d["r"]:
            add(so_digitos(d["doc"][r[4]]), d["forn"][r[3]], r[10], r[2])
    anos_portal = {int(a.stem.split("-")[1]) for a in SITE_DATA.glob("despesas-*.json")}
    for arq in sorted(SITE_DATA.glob("empenhos-*.json")):
        ano = int(arq.stem.split("-")[1])
        d = json.loads(arq.read_text(encoding="utf-8"))
        for r in d["r"]:
            ident = d["i"][r[5]]
            if "JUR" not in ident.upper():
                continue
            data = f"{ano}-{int(r[1]):02d}-01"
            # anos que o portal já cobre entram só para data; valor vem do portal (evita somar duas vezes)
            add(so_digitos(ident), d["f"][r[4]], r[6] if (r[7] == "E" and ano not in anos_portal) else 0.0, data)
    arq = SITE_DATA / "contratos.json"
    if arq.exists():
        for c in json.loads(arq.read_text(encoding="utf-8")):
            add(so_digitos(c.get("doc")), c.get("forn"), 0.0, (c.get("assinatura") or "")[:10])
    return f


# Pagamentos a pessoa física que são normais para servidor (diária, sentença, restituição, auxílio).
NATUREZAS_PF_IGNORADAS = ("DIÁRIAS", "SENTENÇAS", "INDENIZAÇÕES", "AUXÍLIO", "VENCIMENTOS", "OBRIGAÇÕES", "RESSARCIMENTO")


def fornecedores_pf() -> list[dict]:
    """Pessoas físicas pagas como fornecedor no portal (nome + CPF mascarado no mesmo formato da folha),
    só em despesas de compra, serviço ou aluguel."""
    m: dict[tuple, dict] = {}
    for arq in sorted(SITE_DATA.glob("despesas-*.json")):
        d = json.loads(arq.read_text(encoding="utf-8"))
        for r in d["r"]:
            doc, nat = d["doc"][r[4]], d["nat"][r[7]]
            if len(so_digitos(doc)) != 5 or any(x in nat.upper() for x in NATUREZAS_PF_IGNORADAS):
                continue
            k = (normalizar(d["forn"][r[3]]), so_digitos(doc))
            x = m.setdefault(k, {"nome": d["forn"][r[3]], "mask": doc, "valor": 0.0, "n": 0, "ultimo": "", "nat": set()})
            x["valor"] += r[10]
            x["n"] += 1
            x["ultimo"] = max(x["ultimo"], r[2])
            x["nat"].add(nat.title())
    return list(m.values())


# ---------------------------------------------------------------- consulta à Receita

def consultar(cnpj: str) -> dict | None:
    for url in (f"https://minhareceita.org/{cnpj}", f"https://brasilapi.com.br/api/cnpj/v1/{cnpj}"):
        try:
            status, d = get_json(url, tentativas=3, timeout=60)
        except RuntimeError:
            continue
        if isinstance(d, dict) and d.get("cnpj"):
            return d
        if status == 404:
            return {"cnpj": cnpj, "_nao_encontrado": True}
    return None


def enxugar(d: dict) -> dict:
    if d.get("_nao_encontrado"):
        return {"nao_encontrado": True}
    tel = so_digitos(d.get("ddd_telefone_1"))
    end = " ".join(str(d.get(k) or "") for k in ("descricao_tipo_de_logradouro", "logradouro", "numero", "complemento")).strip()
    return {
        "razao": d.get("razao_social") or "",
        "fantasia": d.get("nome_fantasia") or "",
        "abertura": d.get("data_inicio_atividade") or "",
        "situacao": (d.get("descricao_situacao_cadastral") or "").upper(),
        "natureza": d.get("natureza_juridica") or "",
        "cod_natureza": d.get("codigo_natureza_juridica"),
        "porte": d.get("porte") or "",
        "mei": bool(d.get("opcao_pelo_mei")),
        "cnae": d.get("cnae_fiscal_descricao") or "",
        "endereco": " ".join(end.split()),
        "bairro": d.get("bairro") or "",
        "cep": so_digitos(d.get("cep")),
        "municipio": (d.get("municipio") or "").upper(),
        "uf": d.get("uf") or "",
        "telefone": tel,
        "capital": d.get("capital_social"),
        "socios": [{
            "nome": s.get("nome_socio") or "",
            "doc": s.get("cnpj_cpf_do_socio") or "",  # mascarado pela Receita; fica só no cache
            "qualif": s.get("qualificacao_socio") or "",
            "entrada": s.get("data_entrada_sociedade") or "",
            "faixa": s.get("faixa_etaria") or "",
        } for s in (d.get("qsa") or [])],
    }


def carregar_cadastros(cnpjs: list[str]) -> dict[str, dict]:
    CACHE.mkdir(parents=True, exist_ok=True)
    limite = (hoje - dt.timedelta(days=DIAS_VALIDADE)).isoformat()
    out, faltam = {}, []
    for c in cnpjs:
        arq = CACHE / f"{c}.json"
        if arq.exists():
            x = json.loads(arq.read_text(encoding="utf-8"))
            out[c] = x
            if x.get("_consultado", "") < limite:
                faltam.append(c)
        else:
            faltam.append(c)
    faltam.sort(key=lambda c: c in out)  # primeiro os que nunca foram consultados
    feitos = 0
    for c in faltam[:MAX_CONSULTAS]:
        d = consultar(c)
        time.sleep(PAUSA)
        if d is None:
            continue
        x = {**enxugar(d), "_consultado": hoje.isoformat()}
        (CACHE / f"{c}.json").write_text(json.dumps(x, ensure_ascii=False), encoding="utf-8")
        out[c] = x
        feitos += 1
    log(f"  QSA: {sum(1 for x in out.values() if not x.get('nao_encontrado'))} CNPJs com cadastro, {feitos} consultados agora, {max(0, len(faltam) - MAX_CONSULTAS)} para o próximo dia")
    return out


# ---------------------------------------------------------------- saída pública

def sinais_empresas(forn: dict, cad: dict) -> dict[str, list[dict]]:
    sinais: dict[str, list[dict]] = defaultdict(list)
    grupos = {"endereco": defaultdict(set), "telefone": defaultdict(set), "socio": defaultdict(set)}
    for c, x in cad.items():
        if x.get("nao_encontrado"):
            continue
        if x["endereco"] and x["cep"]:
            grupos["endereco"][(normalizar(x["endereco"]), x["cep"])].add(c)
        if len(x["telefone"]) >= 10:
            grupos["telefone"][x["telefone"]].add(c)
        for s in x["socios"]:
            if s["nome"] and s["doc"]:
                grupos["socio"][(normalizar(s["nome"]), s["doc"])].add(c)
        if x["abertura"] and forn[c]["primeiro"]:
            dias = (dt.date.fromisoformat(forn[c]["primeiro"][:10]) - dt.date.fromisoformat(x["abertura"][:10])).days
            if 0 <= dias <= DIAS_ABERTURA_RECENTE:
                sinais[c].append({"t": "aberta_recente", "dias": dias})
        if x["situacao"] and x["situacao"] != "ATIVA":
            sinais[c].append({"t": "situacao", "v": x["situacao"].title()})
    rot = {"endereco": "mesmo_endereco", "telefone": "mesmo_telefone", "socio": "socio_em_comum"}
    for tipo, g in grupos.items():
        for chave, cs in g.items():
            if len(cs) < 2:
                continue
            for c in cs:
                outros = sorted(cs - {c})
                s = {"t": rot[tipo], "com": outros}
                if tipo == "socio":
                    s["nome"] = next(so["nome"] for so in cad[c]["socios"] if (normalizar(so["nome"]), so["doc"]) == chave)
                sinais[c].append(s)
    return sinais


def montar_publico(forn: dict, cad: dict) -> list[dict]:
    sinais = sinais_empresas(forn, cad)
    lista = []
    for c, f in forn.items():
        x = cad.get(c)
        if not x or x.get("nao_encontrado"):
            continue
        if str(x.get("cod_natureza") or "").startswith("1"):  # órgãos públicos
            continue
        lista.append({
            "cnpj": c, "nome": x["razao"] or f["nome"], "fantasia": x["fantasia"], "abertura": x["abertura"],
            "situacao": x["situacao"].title(), "natureza": x["natureza"], "porte": x["porte"], "mei": x["mei"],
            "cnae": x["cnae"], "cidade": f"{x['municipio'].title()}/{x['uf']}" if x["municipio"] else "",
            "valor": round(f["valor"], 2), "primeiro": f["primeiro"], "ultimo": f["ultimo"],
            "socios": [[s["nome"], s["qualif"], s["entrada"]] for s in x["socios"]],
            "sinais": sinais.get(c, []),
        })
    lista.sort(key=lambda e: -e["valor"])
    return lista


# ---------------------------------------------------------------- cruzamento (só criptografado)

def servidores_folha(cpfs_recentes: dict[str, set[str]]) -> dict[str, dict]:
    """Nome normalizado -> dados do servidor no mês mais recente em que aparece (2024 em diante).
    cpfs_recentes vem da coleta da folha deste dia (só em memória)."""
    idx = SITE_DATA / "folha-meses.json"
    meses = sorted(json.loads(idx.read_text(encoding="utf-8"))) if idx.exists() else []
    serv: dict[str, dict] = {}
    for mes in meses:
        arq = SITE_DATA / f"folha-{mes}.json"
        if not arq.exists():
            continue
        d = json.loads(arq.read_text(encoding="utf-8"))
        for r in d["r"]:
            n = normalizar(r[0])
            serv[n] = {"nome": r[0], "cargo": d["cargo"][r[1]], "sec": d["sec"][r[2]], "vinc": d["vinc"][r[4]],
                       "admissao": r[5], "mes": mes, "bruto": r[6]}
    masks = defaultdict(set)
    for nome, ms in cpfs_recentes.items():
        masks[normalizar(nome)] |= set(ms)
    for n, s in serv.items():
        s["masks"] = sorted(masks.get(n, ()))
    return serv


def cruzar(forn: dict, cad: dict, serv: dict, pf: list[dict]) -> list[dict]:
    achados = []
    ult_mes = max((s["mes"] for s in serv.values()), default="")
    freq_sobrenome = defaultdict(int)
    for n in serv:
        for sn in set(sobrenomes(n)):
            freq_sobrenome[sn] += 1
    por_sobrenome = defaultdict(list)
    for n in serv:
        sb = sobrenomes(n)
        if len(sb) >= 2:
            por_sobrenome[tuple(sb[-2:])].append(n)

    def base(c, pessoa, papel, s):
        f, x = forn[c], cad[c]
        return {"cnpj": c, "empresa": x["razao"] or f["nome"], "cidade": f"{x['municipio'].title()}/{x['uf']}",
                "valor": round(f["valor"], 2), "primeiro": f["primeiro"], "ultimo": f["ultimo"],
                "pessoa": pessoa, "papel": papel, "servidor": s["nome"], "cargo": s["cargo"], "sec": s["sec"],
                "vinc": s["vinc"], "admissao": s["admissao"], "mes": s["mes"], "ativo": s["mes"] == ult_mes}

    for c, x in cad.items():
        if x.get("nao_encontrado") or c not in forn or str(x.get("cod_natureza") or "").startswith("1"):
            continue
        pessoas = [(s["nome"], s["qualif"] or "Sócio", s["doc"]) for s in x["socios"]]
        if not pessoas and (x["mei"] or str(x.get("cod_natureza")) in ("2135", "2305", "2313")):
            pessoas = [(nome_titular(x["razao"]), "Titular (empresário individual/MEI)", "")]
        em_itabera = x["municipio"] == "ITABERA"
        for nome, papel, doc in pessoas:
            n = normalizar(nome)
            if not n:
                continue
            s = serv.get(n)
            if s:
                confs = [cpf_confere(m, doc) for m in s["masks"]]
                if True in confs:
                    nivel, motivo = "forte", "Nome completo igual e os dígitos do CPF que a Receita e o portal mostram são compatíveis."
                elif confs and all(v is False for v in confs):
                    continue  # CPF incompatível: homônimo
                else:
                    nivel, motivo = "medio", "Nome completo igual, mas não deu para conferir o CPF (pode ser homônimo)."
                achados.append({**base(c, nome, papel, s), "nivel": nivel, "tipo": "socio_servidor", "motivo": motivo})
                continue
            sb = sobrenomes(n)
            if em_itabera and len(sb) >= 2:
                chave = tuple(sb[-2:])
                if all(p in SOBRENOMES_COMUNS for p in chave):
                    continue
                parentes = [m for m in por_sobrenome.get(chave, []) if m != n][:6]
                for m in parentes:
                    achados.append({**base(c, nome, papel, serv[m]), "nivel": "fraco", "tipo": "sobrenome",
                                    "motivo": f"Empresa de Itaberá; o sócio e o servidor têm os mesmos dois últimos sobrenomes ({' '.join(chave).title()}). Pode ser só coincidência."})
    for p in pf:
        n = normalizar(p["nome"])
        s = serv.get(n)
        if not s:
            continue
        if s["masks"] and so_digitos(p["mask"]) not in {so_digitos(m) for m in s["masks"]}:
            continue
        nivel = "forte" if s["masks"] else "medio"
        achados.append({"cnpj": "", "empresa": "Pessoa física (CPF " + p["mask"] + ")", "cidade": "", "valor": round(p["valor"], 2),
                        "primeiro": "", "ultimo": p["ultimo"], "pessoa": p["nome"], "papel": "Fornecedor pessoa física",
                        "servidor": s["nome"], "cargo": s["cargo"], "sec": s["sec"], "vinc": s["vinc"], "admissao": s["admissao"],
                        "mes": s["mes"], "ativo": s["mes"] == ult_mes, "nivel": nivel, "tipo": "pf_servidor",
                        "motivo": f"Servidor que também recebeu como fornecedor pessoa física, fora da folha ({p['n']} empenhos: {', '.join(sorted(p['nat']))[:160]}). Pode ser legítimo, como aluguel ou serviço eventual."})
    ordem = {"forte": 0, "medio": 1, "fraco": 2}
    achados.sort(key=lambda a: (ordem[a["nivel"]], -a["valor"]))
    return achados


def criptografar(obj, senha: str) -> dict:
    from cryptography.hazmat.primitives import hashes
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

    sal, iv = secrets.token_bytes(16), secrets.token_bytes(12)
    chave = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=sal, iterations=ITERACOES_PBKDF2).derive(senha.encode("utf-8"))
    ct = AESGCM(chave).encrypt(iv, json.dumps(obj, ensure_ascii=False, separators=(",", ":")).encode("utf-8"), None)
    b64 = lambda b: base64.b64encode(b).decode()
    return {"v": 1, "alg": "AES-256-GCM", "kdf": "PBKDF2-SHA256", "iter": ITERACOES_PBKDF2,
            "sal": b64(sal), "iv": b64(iv), "dados": b64(ct)}


# ---------------------------------------------------------------- principal

def coletar_socios(cpfs_folha: dict[str, set[str]] | None = None) -> dict:
    forn = fornecedores()
    cad = carregar_cadastros(sorted(forn))
    empresas = montar_publico(forn, cad)
    salvar(SITE_DATA / "socios.json", {"gerado": hoje.isoformat(), "total_cnpj": len(forn), "empresas": empresas})
    res = {"fornecedores_cnpj": len(forn), "com_cadastro": len(empresas),
           "com_sinais": sum(1 for e in empresas if e["sinais"])}

    senha = os.environ.get("PREFITA_SENHA", "")
    if not senha:
        log("  área reservada: secret PREFITA_SENHA não configurado; cruzamento não gerado")
        return {**res, "reservado": False}
    serv = servidores_folha(cpfs_folha or {})
    achados = cruzar(forn, {c: x for c, x in cad.items() if c in forn}, serv, fornecedores_pf())
    pacote = {"gerado": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
              "servidores": len(serv), "empresas": len(empresas),
              "conferiu_cpf": sum(1 for s in serv.values() if s["masks"]), "achados": achados}
    salvar(SITE_DATA / "reservado.json", criptografar(pacote, senha))
    log(f"  área reservada: arquivo criptografado gerado")  # contagens não vão para o log público
    return {**res, "reservado": True}
