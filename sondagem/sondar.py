#!/usr/bin/env python3
"""Sondagem temporária 2: parâmetros das listagens PorNumeroEmpenho e páginas de folha detalhada."""
import json, re, urllib.request, urllib.parse
UA = {"User-Agent": "prefita-sondagem/1.0 (+https://github.com/Paul0Gustav0/prefita)"}
R = "https://fiorilli.itabera.online/transparencia"
def get(url):
    try:
        with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=180) as r:
            return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), str(e)

st, html = get(R + "/VersaoJson/DadosAbertos/")
txt = re.sub(r"<[^>]+>", " ", html)
for h in sorted(set(re.findall(r'(?:href|value|onclick)=["\']([^"\']*Listagem=[^"\']*)', html))): print("HREF", h[:400])
for m in re.finditer(r"PorNumeroEmpenho|Servidores", html):
    print("CTX", re.sub(r"\s+", " ", html[max(0, m.start()-500): m.end()+700]))
    print("----")

st, main = get(R + "/")
for k in ["Provent", "Verba", "Holerit", "Evento", "Contracheque", "Remunera", "Pessoal"]:
    for m in list(re.finditer(k, main, re.I))[:6]:
        print("MAIN", k, re.sub(r"\s+", " ", main[max(0, m.start()-200): m.end()+200]))
for s in set(re.findall(r'(?:src|href)="([^"]+)"', main)):
    if any(w in s.lower() for w in ["pessoal", "servidor", "folha", ".js"]): print("LINK", s)
