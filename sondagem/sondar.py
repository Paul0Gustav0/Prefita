#!/usr/bin/env python3
"""Sondagem temporária 4: página Servidores.aspx (detalhe por servidor?) e tempo de resposta do detalhe de empenho."""
import re, time, urllib.request
UA = {"User-Agent": "prefita-sondagem/1.0 (+https://github.com/Paul0Gustav0/prefita)"}
R = "https://fiorilli.itabera.online/transparencia"
def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), str(e)
for pg in ["Servidores.aspx", "ServidoresRelatorios.aspx"]:
    st, h = get(R + "/" + pg)
    print("=====", pg, st, len(h))
    for k in ["Provento", "Verba", "Holerite", "Contracheque", "Detalh", "Evento", "WebMethod", "PageMethods", "\\.aspx", "ajax", "url:"]:
        for m in list(re.finditer(k, h, re.I))[:8]:
            print(k, "::", re.sub(r"\s+", " ", h[max(0, m.start()-250): m.end()+350]))
    for s in sorted(set(re.findall(r'src="([^"]+\.js[^"]*)"', h))):
        u = R + "/" + s.lstrip("./")
        st2, js = get(u)
        hits = sorted(set(re.findall(r"[\w/]+\.aspx[\w/?=&]*|url\s*:\s*['\"][^'\"]+", js)))
        print("JS", u, st2, hits[:60])
B = R + "/VersaoJson/Despesas/?ConectarExercicio=2026&Empresa=1"
t0 = time.time()
for n in range(2100, 2120):
    get(f"{B}&Listagem=ItensEmpenhoPorNumeroEmpenho&intNumeroEmpenho={n}&strTipoEmpenho=OR")
print("20 chamadas em", round(time.time() - t0, 1), "s")
