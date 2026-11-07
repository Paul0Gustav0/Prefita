#!/usr/bin/env python3
"""Sondagem temporária 5: callback do DevExpress que mostra proventos e descontos de um servidor."""
import re, time, urllib.request, urllib.parse, http.cookiejar, concurrent.futures as cf
UA = {"User-Agent": "prefita-sondagem/1.0 (+https://github.com/Paul0Gustav0/prefita)"}
R = "https://fiorilli.itabera.online/transparencia"
cj = http.cookiejar.CookieJar()
op = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))
def req(url, data=None):
    try:
        r = op.open(urllib.request.Request(url, data=urllib.parse.urlencode(data).encode() if data else None, headers=UA), timeout=180)
        return r.status, r.read().decode("utf-8", "replace")
    except Exception as e:
        return getattr(e, "code", 0), str(e)
op.open(urllib.request.Request(R + "/", headers=UA), timeout=120).read()
st, h = req(R + "/Servidores.aspx")
print("GET", st, len(h))
hid = dict(re.findall(r'<input type="hidden" name="([^"]+)" id="[^"]*" value="([^"]*)"', h))
print("HIDDEN", {k: len(v) for k, v in hid.items()})
keys = re.findall(r"dxo\.keys=\[([^\]]*)\]", h)
print("KEYS", keys[:1][0][:200] if keys else None)
cb = sorted(set(re.findall(r"'(pcDetalhe[^']*callbackPanel[^']*)'|\"(pcDetalhe[^\"]*callbackPanel[^\"]*)\"", h)))
print("CB IDS", cb[:10])
for m in list(re.finditer(r"OnMoreInfoClick|onCustomButtonClick", h))[:4]:
    print("CTX", re.sub(r"\s+", " ", h[m.start()-200:m.end()+600]))
key = "001|002664|952"
for cid in ["pcDetalhe$callbackPanel", "pcDetalhe_callbackPanel"]:
    for par in [key, "c0:" + key, f"c0:{len(key)}|{key}"]:
        d = {k: v for k, v in hid.items()}
        d.update({"__CALLBACKID": cid, "__CALLBACKPARAM": par, "__EVENTTARGET": "", "__EVENTARGUMENT": ""})
        st, t = req(R + "/Servidores.aspx", d)
        txt = re.sub(r"<[^>]+>", " ", t); txt = re.sub(r"\s+", " ", txt)
        print(f"\n### {cid} | {par} -> {st} {len(t)} :: {txt[:1500]}")
B = R + "/VersaoJson/Despesas/?ConectarExercicio=2026&Empresa=1&Listagem=ItensEmpenhoPorNumeroEmpenho&strTipoEmpenho=OR&intNumeroEmpenho="
t0 = time.time()
with cf.ThreadPoolExecutor(6) as ex: res = list(ex.map(lambda n: urllib.request.urlopen(urllib.request.Request(B + str(n), headers=UA), timeout=120).status, range(2200, 2260)))
print("60 chamadas em 6 threads:", round(time.time() - t0, 1), "s", set(res))
