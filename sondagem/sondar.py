#!/usr/bin/env python3
"""Sondagem temporária 6: conteúdo do detalhamento de proventos/descontos (callback c0:EMPRESA|REGISTRO|REFERENCIA)."""
import json, re, urllib.request, urllib.parse, http.cookiejar, html as H
UA = {"User-Agent": "prefita-sondagem/1.0 (+https://github.com/Paul0Gustav0/prefita)"}
R = "https://fiorilli.itabera.online/transparencia"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def req(url, data=None):
    r = op.open(urllib.request.Request(url, data=urllib.parse.urlencode(data).encode() if data else None, headers=UA), timeout=180)
    return r.read().decode("utf-8", "replace")
op.open(urllib.request.Request(R + "/", headers=UA), timeout=120).read()
h = req(R + "/Servidores.aspx")
hid = dict(re.findall(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', h))
def detalhe(key):
    d = dict(hid); d.update({"__CALLBACKID": "pcDetalhe$callbackPanel", "__CALLBACKPARAM": "c0:" + key, "__EVENTTARGET": "", "__EVENTARGUMENT": ""})
    t = req(R + "/Servidores.aspx", d)
    i = t.find("/*DX*/(")
    return t[i + 7:-1] if i >= 0 else t
def linhas(res):
    m = re.search(r"'result':'(.*)'\}\s*$", res, re.S)
    body = m.group(1) if m else res
    body = body.encode().decode("unicode_escape", "ignore") if "\\r\\n" in body else body
    rows = re.findall(r"<tr[^>]*>(.*?)</tr>", body, re.S)
    out = []
    for r in rows:
        cs = [H.unescape(re.sub(r"\s+", " ", re.sub(r"<[^>]+>", " ", c))).strip() for c in re.findall(r"<td[^>]*>(.*?)</td>", r, re.S)]
        cs = [c for c in cs if c]
        if cs and len(cs) <= 8: out.append(cs)
    return out, re.sub(r"\s+", " ", H.unescape(re.sub(r"<[^>]+>", " ", body)))
r = detalhe("001|002664|952")
ls, txt = linhas(r)
print("TEXTO:", txt[:3000])
print("LINHAS:"); [print("  ", l) for l in ls[:60]]
print("ERRO?", "'error'" in r[:200])
# outro mês e outro ano
for ano, mes in [(2026, 10), (2026, 9)]:
    url = f"{R}/VersaoJson/Pessoal/?ConectarExercicio={ano}&Empresa=1&MostraDadosConsolidado=False&Listagem=Servidores&Ano={ano}&MesFinalPeriodo={mes:02d}"
    d = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=300).read().decode())
    for x in sorted(d, key=lambda z: -float(str(z.get("PROVENTOS") or 0).replace(".", "").replace(",", ".")))[:3] + d[100:102]:
        key = f"{x['EMPRESA']}|{x['REGISTRO']}|{x['REFERENCIA']}"
        r = detalhe(key)
        ls, txt = linhas(r)
        print("LINHAS", ls[:40])
        print(f"\n#### {ano}-{mes:02d} key={key} {x['NOME']} prov={x['PROVENTOS']} desc={x['DESCONTOS']} refs={sorted(set(z['REFERENCIA'] + ':' + z['REFERENCIA_NOME'] for z in d))[:6]} erro={'error' in r[:200]}")
        print("TEXTO:", txt[:2500])
