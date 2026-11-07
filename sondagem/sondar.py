#!/usr/bin/env python3
"""Sondagem temporária: onde o portal Fiorilli guarda verbas e descontos da folha e o detalhe de empenhos."""
import json, re, urllib.request, time
UA = {"User-Agent": "prefita-sondagem/1.0 (+https://github.com/Paul0Gustav0/prefita)"}
R = "https://fiorilli.itabera.online/transparencia"
B = R + "/VersaoJson"
def get(url, n=None):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), str(e)
def j(path, **q):
    q = {"ConectarExercicio": q.get("Ano", 2026), "Empresa": 1, "MostraDadosConsolidado": "False", **q}
    url = f"{B}/{path}/?" + "&".join(f"{k}={v}" for k, v in q.items())
    st, t = get(url)
    try: d = json.loads(t)
    except Exception: d = None
    print(f"\n### {st} {url}\n" + (f"{len(d)} itens" if isinstance(d, list) else t[:300]))
    return d if isinstance(d, list) else []

# 1) rotas que o próprio portal usa
seen = set()
for path in ["/", "/Pessoal/", "/pessoal", "/Pessoal/?Listagem=Servidores", "/VersaoJson/DadosAbertos/"]:
    st, html = get(R + path)
    print(f"\n=== {st} {R+path} ({len(html)} chars)")
    for m in sorted(set(re.findall(r"Listagem=\w+", html))): print("  ", m)
    for s in re.findall(r'src="([^"]+\.js[^"]*)"', html):
        u = s if s.startswith("http") else (R + "/" + s.lstrip("/") if not s.startswith("/") else "https://fiorilli.itabera.online" + s)
        if u in seen: continue
        seen.add(u)
        st2, js = get(u)
        hits = sorted(set(re.findall(r"Listagem=\w+|Listagem\W{1,4}\w+|VersaoJson/\w+", js)))
        if hits: print(f"  js {u}: {hits[:80]}")
    for m in sorted(set(re.findall(r'href="([^"]*(?:Pessoal|Servidor|Folha|Holerite|Verba)[^"]*)"', html, re.I))): print("  link", m)

# 2) registro completo de um servidor
s = j("Pessoal", Listagem="Servidores", Ano=2026, MesFinalPeriodo=10)
if s:
    x = max(s, key=lambda r: len(r))
    print("CHAVES SERVIDOR:", json.dumps(s[0], ensure_ascii=False)[:2500])
    reg = s[0]
    ids = {k: v for k, v in reg.items() if re.search(r"REG|MATR|PK|ID|COD|CONTRATO|REFER", k, re.I)}
    print("IDS:", ids)
    # 3) candidatos de detalhe
    for lst in ["ServidoresDetalhado", "ServidorDetalhado", "ProventosDescontos", "ProventosEDescontos", "Verbas", "VerbasServidor", "Holerite", "Eventos", "EventosServidor", "FolhaDetalhada", "Remuneracao", "RemuneracaoDetalhada", "DetalhesServidor", "Detalhamento", "ServidoresVerbas", "Lancamentos"]:
        d = j("Pessoal", Listagem=lst, Ano=2026, MesFinalPeriodo=10, **{k: v for k, v in list(ids.items())[:4]})
        if d: print("  AMOSTRA:", json.dumps(d[:2], ensure_ascii=False)[:1500])

# 4) empenho detalhado
P = dict(MostrarFornecedor="True", UFParaFiltroCOVID="", MostrarCNPJFornecedor="True", ApenasIDEmpenho="False")
d = j("Despesas", Listagem="DespesasGerais", DiaInicioPeriodo=5, MesInicialPeriodo=11, DiaFinalPeriodo=5, MesFinalPeriodo=11, Ano=2026, **P)
if d:
    print("CHAVES EMPENHO:", json.dumps(d[0], ensure_ascii=False)[:2500])
    pk = d[0].get("PKEMP")
    for lst in ["Liquidacoes", "Pagamentos", "ItensEmpenho", "EmpenhoItens", "DetalhesEmpenho", "EmpenhoDetalhado", "NotasFiscais", "Historico", "Movimentacao"]:
        dd = j("Despesas", Listagem=lst, PKEMP=pk, Ano=2026, DiaInicioPeriodo=1, MesInicialPeriodo=1, DiaFinalPeriodo=31, MesFinalPeriodo=12, **P)
        if dd: print("  AMOSTRA:", json.dumps(dd[:2], ensure_ascii=False)[:1500])
