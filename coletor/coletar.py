#!/usr/bin/env python3
"""Coletor de dados de gastos de Itaberá (SP).

Roda todo dia no GitHub Actions. Fontes:
  1. TCE-SP (Audesp): empenhos mês a mês.
     https://transparencia.tce.sp.gov.br/api/json/despesas/itabera/{ano}/{mes}
  2. PNCP: contratos publicados pela Prefeitura (CNPJ 46.634.374/0001-60).
     https://pncp.gov.br/api/consulta/v1/contratos

Os dados brutos ficam em dados/ (versionados, servem de histórico).
O painel lê os arquivos já tratados em site/data/.

Só usa a biblioteca padrão do Python.
"""
from __future__ import annotations

import datetime as dt
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "dados"
SITE_DATA = RAIZ / "site" / "data"

MUNICIPIO_TCE = "itabera"
CNPJ_PREFEITURA = "46634374000160"
ANO_INICIAL_TCE = int(os.environ.get("ANO_INICIAL_TCE", "2021"))
ANO_INICIAL_PNCP = int(os.environ.get("ANO_INICIAL_PNCP", "2023"))
# Meses recentes são baixados de novo todo dia, porque o município pode reenviar ou corrigir.
MESES_RECENTES = 3

UA = {"User-Agent": "prefita-coletor/1.0 (+https://github.com/Paul0Gustav0/prefita)"}

hoje = dt.date.today()


def log(msg: str) -> None:
    print(msg, flush=True)


def get_json(url: str, tentativas: int = 5):
    """GET com novas tentativas. Devolve (status, json|None)."""
    for i in range(tentativas):
        try:
            req = urllib.request.Request(url, headers=UA)
            with urllib.request.urlopen(req, timeout=120) as r:
                corpo = r.read().decode("utf-8")
                if r.status == 204 or not corpo.strip():
                    return r.status, None
                return r.status, json.loads(corpo)
        except urllib.error.HTTPError as e:
            if e.code in (400, 404, 422):
                return e.code, None
            erro = f"HTTP {e.code}"
        except (urllib.error.URLError, TimeoutError, ConnectionError, json.JSONDecodeError) as e:
            erro = str(e)
        espera = 2 ** (i + 1)
        log(f"    falhou ({erro}); nova tentativa em {espera}s")
        time.sleep(espera)
    raise RuntimeError(f"não consegui baixar {url}")


def meses(ano_ini: int):
    a, m = ano_ini, 1
    while (a, m) <= (hoje.year, hoje.month):
        yield a, m
        m += 1
        if m > 12:
            a, m = a + 1, 1


def recente(a: int, m: int) -> bool:
    return (hoje.year * 12 + hoje.month) - (a * 12 + m) < MESES_RECENTES


def salvar(caminho: Path, obj) -> None:
    caminho.parent.mkdir(parents=True, exist_ok=True)
    caminho.write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")


# ---------------------------------------------------------------- TCE-SP

def coletar_tce() -> dict:
    novos = 0
    for a, m in meses(ANO_INICIAL_TCE):
        arq = DADOS / "tce" / str(a) / f"{m:02d}.json"
        if arq.exists() and not recente(a, m):
            continue
        url = f"https://transparencia.tce.sp.gov.br/api/json/despesas/{MUNICIPIO_TCE}/{a}/{m}"
        status, dados = get_json(url)
        dados = dados if isinstance(dados, list) else []
        if not dados and not arq.exists() and recente(a, m):
            log(f"  TCE {a}/{m:02d}: ainda sem dados")
            continue
        salvar(arq, dados)
        novos += 1
        log(f"  TCE {a}/{m:02d}: {len(dados)} lançamentos")
        time.sleep(0.4)
    return {"arquivos_atualizados": novos}


def valor(x) -> float:
    if isinstance(x, (int, float)):
        return float(x)
    t = str(x or "0").strip().replace(".", "").replace(",", ".")
    try:
        return float(t)
    except ValueError:
        return 0.0


def montar_empenhos() -> list[int]:
    """Gera site/data/empenhos-{ano}.json com registros enxutos."""
    anos = []
    for pasta in sorted((DADOS / "tce").glob("*")):
        if not pasta.is_dir():
            continue
        ano = int(pasta.name)
        regs = []
        for arq in sorted(pasta.glob("*.json")):
            mes = int(arq.stem)
            for d in json.loads(arq.read_text(encoding="utf-8")):
                data = str(d.get("dt_emissao_despesa") or "")
                regs.append({
                    "o": "C" if "CÂMARA" in str(d.get("orgao", "")).upper() or "CAMARA" in str(d.get("orgao", "")).upper() else "P",
                    "m": mes,
                    "d": data,
                    "n": d.get("nr_empenho") or "",
                    "i": d.get("id_fornecedor") or "",
                    "f": (d.get("nm_fornecedor") or "Não informado").strip(),
                    "v": round(valor(d.get("vl_despesa")), 2),
                    "e": d.get("evento") or "Empenhado",
                })
        if regs:
            salvar(SITE_DATA / f"empenhos-{ano}.json", regs)
            anos.append(ano)
            log(f"  painel: {ano} com {len(regs)} empenhos")
    return anos


# ---------------------------------------------------------------- PNCP

def coletar_pncp() -> dict:
    novos = 0
    for a, m in meses(ANO_INICIAL_PNCP):
        arq = DADOS / "pncp" / "contratos" / f"{a}-{m:02d}.json"
        if arq.exists() and not recente(a, m):
            continue
        ini = dt.date(a, m, 1)
        fim = (dt.date(a + (m // 12), m % 12 + 1, 1) - dt.timedelta(days=1))
        fim = min(fim, hoje)
        todos, pagina = [], 1
        while True:
            q = urllib.parse.urlencode({
                "dataInicial": ini.strftime("%Y%m%d"), "dataFinal": fim.strftime("%Y%m%d"),
                "cnpjOrgao": CNPJ_PREFEITURA, "pagina": pagina, "tamanhoPagina": 500,
            })
            status, r = get_json(f"https://pncp.gov.br/api/consulta/v1/contratos?{q}")
            if not r:
                break
            todos.extend(r.get("data") or [])
            if pagina >= int(r.get("totalPaginas") or 1):
                break
            pagina += 1
        enx = [{
            "id": c.get("numeroControlePNCP"),
            "ano": c.get("anoContrato"),
            "seq": c.get("sequencialContrato"),
            "num": c.get("numeroContratoEmpenho"),
            "forn": c.get("nomeRazaoSocialFornecedor"),
            "doc": c.get("niFornecedor"),
            "objeto": (c.get("objetoContrato") or "").strip(),
            "valor": c.get("valorGlobal") or c.get("valorInicial") or 0,
            "assinatura": c.get("dataAssinatura"),
            "inicio": c.get("dataVigenciaInicio"),
            "fim": c.get("dataVigenciaFim"),
            "publicado": c.get("dataPublicacaoPncp"),
            "categoria": (c.get("categoriaProcesso") or {}).get("nome"),
            "tipo": (c.get("tipoContrato") or {}).get("nome"),
            "processo": c.get("processo"),
        } for c in todos]
        salvar(arq, enx)
        novos += 1
        log(f"  PNCP {a}/{m:02d}: {len(enx)} contratos")
        time.sleep(0.4)
    return {"arquivos_atualizados": novos}


def montar_contratos() -> int:
    vistos, lista = set(), []
    for arq in sorted((DADOS / "pncp" / "contratos").glob("*.json")):
        for c in json.loads(arq.read_text(encoding="utf-8")):
            if c["id"] in vistos:
                continue
            vistos.add(c["id"])
            lista.append(c)
    lista.sort(key=lambda c: c.get("publicado") or "", reverse=True)
    salvar(SITE_DATA / "contratos.json", lista)
    log(f"  painel: {len(lista)} contratos")
    return len(lista)


# ---------------------------------------------------------------- main

def tentar(nome, fn):
    try:
        return {"ok": True, **(fn() or {})}
    except Exception as e:  # uma fonte fora do ar não derruba as outras
        log(f"!! {nome} falhou: {e}")
        return {"ok": False, "erro": str(e)}


def main() -> int:
    log("== TCE-SP")
    tce = tentar("TCE-SP", coletar_tce)
    log("== PNCP")
    pncp = tentar("PNCP", coletar_pncp)
    log("== Montando dados do painel")
    anos = montar_empenhos()
    n_contratos = montar_contratos()
    resumo = {
        "atualizado_em": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
        "anos": anos,
        "contratos": n_contratos,
        "fontes": {"tce": tce, "pncp": pncp},
    }
    salvar(SITE_DATA / "resumo.json", resumo)
    log(json.dumps(resumo, ensure_ascii=False, indent=2))
    return 0 if (tce["ok"] or pncp["ok"]) else 1


if __name__ == "__main__":
    sys.exit(main())
