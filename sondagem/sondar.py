#!/usr/bin/env python3
"""Sondagem 4: estrutura dos dados do Fiorilli para montar o coletor."""
import json, urllib.request, urllib.error, collections, time
UA = {"User-Agent": "prefita-sondagem/1.0 (+https://github.com/Paul0Gustav0/prefita)"}
B = "https://fiorilli.itabera.online/transparencia/VersaoJson"

def j(path, **q):
    q = {"ConectarExercicio": q.get("Ano", 2026), "Empresa": 1, "MostraDadosConsolidado": "False", **q}
    url = f"{B}/{path}/?" + "&".join(f"{k}={v}" for k, v in q.items())
    t0 = time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
            d = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"\n### {url}\nERRO {e}"); return []
    print(f"\n### {url}\n{len(d) if isinstance(d, list) else type(d)} registros em {time.time()-t0:.1f}s")
    return d if isinstance(d, list) else []

def show(d, n=1):
    for x in d[:n]: print(json.dumps(x, ensure_ascii=False)[:3000])

P = dict(MostrarFornecedor="True", UFParaFiltroCOVID="", MostrarCNPJFornecedor="True", ApenasIDEmpenho="False")
d = j("Despesas", Listagem="DespesasGerais", DiaInicioPeriodo=5, MesInicialPeriodo=11, DiaFinalPeriodo=5, MesFinalPeriodo=11, Ano=2026, **P)
show(d, 2)
for k in ["TPEM", "DATAE", "NOMEEMPRESA"]:
    print(k, collections.Counter(x.get(k, "")[:10] for x in d).most_common(8))
print("chaves com valor:", [k for k in (d[0] if d else {}) if any(k.upper().startswith(p) for p in ("VAL", "VL", "EMP", "LIQ", "PAG", "ANU"))])
d = j("Despesas", Listagem="DespesasGerais", DiaInicioPeriodo=3, MesInicialPeriodo=11, DiaFinalPeriodo=3, MesFinalPeriodo=11, Ano=2026, **{**P, "ApenasIDEmpenho": "True"})
show(d, 2)
d = j("Despesas", Listagem="DespesasGerais", DiaInicioPeriodo=1, MesInicialPeriodo=1, DiaFinalPeriodo=31, MesFinalPeriodo=1, Ano=2023, **P)
print("datas jan/2023:", collections.Counter(x.get("DATAE", "")[3:10] for x in d).most_common(5))
s = j("Pessoal", Listagem="Servidores", Ano=2023, MesFinalPeriodo=1)
s = j("Pessoal", Listagem="Servidores", Ano=2021, MesFinalPeriodo=1)
s = j("Pessoal", Listagem="Servidores", Ano=2026, MesFinalPeriodo=10)
show(s, 1)
for k in ["VINCULO", "SITUACAOFUNCIONAL", "DIVISAO", "REFERENCIA_NOME", "EMPRESA"]:
    print(k, collections.Counter(x.get(k, "") for x in s).most_common(12))
print("proventos total", sum(float(x["PROVENTOS"].replace(".", "").replace(",", ".") or 0) for x in s))
for n in ["Diarias"]:
    show(j("Despesas", Listagem=n, DiaInicioPeriodo=1, MesInicialPeriodo=10, DiaFinalPeriodo=31, MesFinalPeriodo=10, Ano=2026), 1)
l = j("LicitacoesEContratos", Listagem="Licitacoes", Ano=2026)
show(l, 2)
print("licitações distintas:", len({(x.get("PROCLICITACAO"), x.get("NUMERO")) for x in l}), collections.Counter(x.get("LICIT") for x in l).most_common(8), collections.Counter(x.get("SITUACAO") for x in l).most_common(8))
c = j("LicitacoesEContratos", Listagem="Contratos", Ano=2026, ContratosApenasPublicados="False")
show(c, 1)
c = j("LicitacoesEContratos", Listagem="Contratos", Ano=2023, ContratosApenasPublicados="False")
for n in ["ReceitaOrcamentaria", "ReceitaUniao"]:
    show(j("Receitas", Listagem=n, DiaInicioPeriodo=1, MesInicialPeriodo=1, DiaFinalPeriodo=31, MesFinalPeriodo=10, Ano=2026), 3)
show(j("Transferencias", Listagem="EmendasImpositivasArt166A"), 2)
show(j("Transferencias", Listagem="CadEmendasImpositivas"), 2)
show(j("Despesas", Listagem="DespesasPorFornecedor", DiaInicioPeriodo=1, MesInicialPeriodo=1, DiaFinalPeriodo=31, MesFinalPeriodo=10, Ano=2026, MostrarFornecedor="True"), 2)
