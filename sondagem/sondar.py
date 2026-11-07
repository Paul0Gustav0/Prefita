#!/usr/bin/env python3
"""Sondagem temporária 3: CORS, detalhe de empenho e rotas de folha no Default.js."""
import json, re, urllib.request
UA = {"User-Agent": "prefita-sondagem/1.0 (+https://github.com/Paul0Gustav0/prefita)", "Origin": "https://paul0gustav0.github.io"}
R = "https://fiorilli.itabera.online/transparencia"
def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
            return r.status, r.read().decode("utf-8", "replace"), dict(r.headers)
    except Exception as e:
        return getattr(e, "code", 0), str(e), dict(getattr(e, "headers", {}) or {})

st, js, _ = get(R + "/ScriptsJS/Default.js")
print("DEFAULT.JS", st, len(js))
for k in ["LnkServidores", "Servidor", "Pessoal", "Holerite", "Provento", "Verba", "Detalhe"]:
    for m in list(re.finditer(k, js))[:5]:
        print("JS", k, "::", re.sub(r"\s+", " ", js[max(0, m.start()-300): m.end()+500]))
for k in ["LnkServidores"]:
    st, main, _ = get(R + "/")
    for m in re.finditer(k, main): print("MAINCTX", re.sub(r"\s+", " ", main[m.start()-100:m.end()+1500]))

B = R + "/VersaoJson/Despesas/?ConectarExercicio=2026&Empresa=1"
st, t, h = get(B + "&MostraDadosConsolidado=False&Listagem=DespesasGerais&DiaInicioPeriodo=3&MesInicialPeriodo=11&DiaFinalPeriodo=5&MesFinalPeriodo=11&Ano=2026&MostrarFornecedor=True&UFParaFiltroCOVID=&MostrarCNPJFornecedor=True&ApenasIDEmpenho=False")
print("CORS HEADERS", {k: v for k, v in h.items() if "access" in k.lower() or "content-type" in k.lower()})
d = json.loads(t)
ex = [x for x in d if x.get("TPEM") != "AN" and float(str(x.get("PAGO") or 0).replace(",", ".")) > 0][:2] + [x for x in d if x.get("TPEM") == "OR"][:1]
for e in ex:
    n, tp = e["CODIGO"], e["TPEM"]
    print("\n######## EMPENHO", n, tp, e.get("NOMEFOR"), e.get("EMPENHADO"), e.get("PAGO"))
    for lst, extra in [("DetalhesEmpenhoPorNumeroEmpenho", "&bolMostrarFornecedor=True"), ("ItensEmpenhoPorNumeroEmpenho", ""),
                       ("Empenhos_Pago_ComOrdemPagto_PorNumeroEmpenho", ""),
                       ("EmpenhosDespesas_Liquidado_PorNumeroEmpenho", "&DiaInicioPeriodo=01&MesInicialPeriodo=01&DiaFinalPeriodo=31&MesFinalPeriodo=12&Ano=2026&IDButton=lnkDespesasPor_NotaEmpenho&MostrarFornecedor=True&MostraDadosConsolidado=False"),
                       ("EmpenhosDespesas_Pago_PorNumeroEmpenho", "&DiaInicioPeriodo=01&MesInicialPeriodo=01&DiaFinalPeriodo=31&MesFinalPeriodo=12&Ano=2026&IDButton=lnkDespesasPor_NotaEmpenho&MostrarFornecedor=True&MostraDadosConsolidado=False")]:
        st, t, h = get(f"{B}&Listagem={lst}&intNumeroEmpenho={n}&strTipoEmpenho={tp}{extra}")
        print(f"--- {lst} {st} ACAO={h.get('Access-Control-Allow-Origin')} :: {t[:1800]}")
    st, t, h = get(f"{B}&Listagem=NotasEmpenhoLiquidacao_PorNumeroEmpenho&intNumeroEmpenho={n}&strTipoEmpenho={tp}&strNumeroLiquidacao=1")
    print(f"--- NotasLiq {st} :: {t[:1200]}")
