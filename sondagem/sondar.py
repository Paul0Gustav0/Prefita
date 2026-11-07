#!/usr/bin/env python3
"""Sondagem 5: semântica do filtro de período e disponibilidade da folha."""
import json, urllib.request, collections, time
UA = {"User-Agent": "prefita-sondagem/1.0 (+https://github.com/Paul0Gustav0/prefita)"}
B = "https://fiorilli.itabera.online/transparencia/VersaoJson"
def j(path, **q):
    q = {"ConectarExercicio": q.get("Ano", 2026), "Empresa": 1, "MostraDadosConsolidado": "False", **q}
    url = f"{B}/{path}/?" + "&".join(f"{k}={v}" for k, v in q.items())
    t0 = time.time()
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300) as r:
            raw = r.read()
    except Exception as e:
        print("ERRO", url, e); return []
    d = json.loads(raw.decode("utf-8"))
    print(f"\n# {path} {q.get('Listagem')} {q.get('Ano')} {q.get('DiaInicioPeriodo','')}/{q.get('MesInicialPeriodo','')}-{q.get('DiaFinalPeriodo','')}/{q.get('MesFinalPeriodo','')}: {len(d)} reg, {len(raw)/1e6:.1f} MB, {time.time()-t0:.0f}s")
    return d
P = dict(Listagem="DespesasGerais", MostrarFornecedor="True", UFParaFiltroCOVID="", MostrarCNPJFornecedor="True", ApenasIDEmpenho="False")
for (a, d1, m1, d2, m2) in [(2026, 1, 1, 31, 1), (2026, 1, 3, 31, 3), (2026, 4, 11, 4, 11), (2025, 1, 6, 30, 6), (2025, 1, 1, 31, 12)]:
    d = j("Despesas", Ano=a, DiaInicioPeriodo=d1, MesInicialPeriodo=m1, DiaFinalPeriodo=d2, MesFinalPeriodo=m2, **P)
    print("  meses DATAE:", sorted(collections.Counter(x["DATAE"][3:10] for x in d).items())[:14])
    print("  PKEMP únicos:", len({x["PKEMP"] for x in d}), "| (PKEMP,TPEM) únicos:", len({(x["PKEMP"], x["TPEM"]) for x in d}))
    ex = collections.defaultdict(list)
    for x in d: ex[x["PKEMP"]].append(x)
    rep = next((v for v in ex.values() if len(v) > 1), None)
    if rep:
        for x in rep[:3]:
            print("   rep:", {k: x[k] for k in ["PKEMP", "CODIGO", "TPEM", "DATAE", "NOMEFOR", "EMPENHADO", "ANULADO", "REFORCO", "LIQUIDADO", "PAGO", "EMPENHADO_ATE_A_DATA", "PAGO_ATE_A_DATA"]})
    s = lambda k: round(sum(float((x.get(k) or "0").replace(",", ".")) for x in d))
    print("  somas: EMPENHADO", s("EMPENHADO"), "ANULADO", s("ANULADO"), "LIQUIDADO", s("LIQUIDADO"), "PAGO", s("PAGO"), "PAGO_ATE", s("PAGO_ATE_A_DATA"))
for a, m in [(2026, 1), (2025, 12), (2025, 6), (2024, 12), (2024, 1)]:
    j("Pessoal", Listagem="Servidores", Ano=a, MesFinalPeriodo=m)
for a in [2024, 2025]:
    j("Despesas", Listagem="Diarias", Ano=a, DiaInicioPeriodo=1, MesInicialPeriodo=1, DiaFinalPeriodo=31, MesFinalPeriodo=12)
