/* Base mínima do painel: abas de seções e helpers compartilhados.
   Cada seção fica em js/secoes/<nome>.js e chama Prefita.registrarSecao({id, titulo, render(el)}).
   render(el) roda na primeira vez que a aba é aberta e pode ser async. */
(function () {
  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });
  const BRL0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const NUM = new Intl.NumberFormat("pt-BR");
  const MESES = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

  const fmt = {
    brl: v => BRL.format(+v || 0),
    brl0: v => BRL0.format(+v || 0),
    num: v => NUM.format(+v || 0),
    compact(v) {
      v = +v || 0;
      if (Math.abs(v) >= 1e6) return "R$ " + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " mi";
      if (Math.abs(v) >= 1e3) return "R$ " + (v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
      return BRL0.format(v);
    },
    pct: v => (+v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%",
    esc: s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])),
    /** "2026-04-14" -> "14/04/2026" */
    data(iso) { if (!iso) return "–"; const [a, m, d] = String(iso).slice(0, 10).split("-"); return d ? `${d}/${m}/${a}` : iso; },
    mes(chave) { const [a, m] = String(chave).split("-"); return `${MESES[+m - 1]} de ${a}`; },
    MESES,
  };

  const cacheJson = {};
  function json(caminho) {
    if (!cacheJson[caminho]) {
      cacheJson[caminho] = fetch(caminho, { cache: "no-cache" }).then(r => { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); });
      cacheJson[caminho].catch(() => delete cacheJson[caminho]);
    }
    return cacheJson[caminho];
  }

  function kpis(lista) {
    return `<section class="kpis">${lista.map(([rotulo, valor, sub]) =>
      `<div class="kpi"><div class="eyebrow">${rotulo}</div><div class="v">${valor}</div><div class="s">${sub || ""}</div></div>`).join("")}</section>`;
  }

  /** Barras horizontais. itens: [[rótulo, valor]]; onClick(rótulo) opcional. */
  function barras(el, itens, { total, onClick, formato = fmt.compact } = {}) {
    if (!itens.length) { el.innerHTML = `<div class="empty">Sem dados com esses filtros.</div>`; return; }
    const max = Math.max(...itens.map(i => i[1]), 1);
    total = total ?? itens.reduce((s, i) => s + i[1], 0);
    el.innerHTML = itens.map(([k, v], i) => `<button class="hbar" type="button" data-i="${i}" ${onClick ? "" : "style=\"cursor:default\""}>
      <span class="n" title="${fmt.esc(k)}">${fmt.esc(k)}</span>
      <span class="a">${formato(v)} <span class="muted" style="font-weight:400">${total ? Math.round(v / total * 100) : 0}%</span></span>
      <span class="track"><span class="fill" style="width:${Math.max(1, v / max * 100)}%;display:block"></span></span></button>`).join("");
    if (onClick) el.querySelectorAll(".hbar").forEach(b => b.onclick = () => onClick(itens[+b.dataset.i][0]));
  }

  /** Tabela ordenável e paginada.
      colunas: [{t: título, k: chave|fn(linha), r: alinhado à direita, f: formatação(valor, linha), mono}] */
  function tabela(el, colunas, linhas, { porPagina = 25, ordem = 0, dir = -1, vazio = "Nada encontrado com esses filtros." } = {}) {
    const st = { ordem, dir, pag: 0 };
    const val = (c, l) => typeof c.k === "function" ? c.k(l) : l[c.k];
    function desenhar() {
      const c = colunas[st.ordem];
      const ord = [...linhas].sort((a, b) => { const x = val(c, a), y = val(c, b); return (x > y ? 1 : x < y ? -1 : 0) * st.dir; });
      const pags = Math.max(1, Math.ceil(ord.length / porPagina));
      st.pag = Math.min(st.pag, pags - 1);
      const pg = ord.slice(st.pag * porPagina, (st.pag + 1) * porPagina);
      el.innerHTML = `<div class="tablewrap"><table><thead><tr>${colunas.map((c, i) =>
        `<th data-i="${i}" class="${c.r ? "r" : ""}">${c.t}${i === st.ordem ? (st.dir > 0 ? " ▲" : " ▼") : ""}</th>`).join("")}</tr></thead>
        <tbody>${pg.length ? pg.map(l => `<tr>${colunas.map(c => {
          const v = val(c, l); return `<td class="${c.r ? "r num" : ""}${c.mono ? " mono" : ""}">${c.f ? c.f(v, l) : fmt.esc(v)}</td>`;
        }).join("")}</tr>`).join("") : `<tr><td colspan="${colunas.length}" class="empty">${vazio}</td></tr>`}</tbody></table></div>
        <div class="pager"><span>${fmt.num(ord.length)} registros · página ${st.pag + 1} de ${pags}</span>
        <button class="btn" type="button" data-p="-1" ${st.pag === 0 ? "disabled" : ""}>Anterior</button>
        <button class="btn" type="button" data-p="1" ${st.pag >= pags - 1 ? "disabled" : ""}>Próxima</button></div>`;
      el.querySelectorAll("th").forEach(th => th.onclick = () => {
        const i = +th.dataset.i; st.dir = st.ordem === i ? -st.dir : (colunas[i].r ? -1 : 1); st.ordem = i; st.pag = 0; desenhar();
      });
      el.querySelectorAll("[data-p]").forEach(b => b.onclick = () => { st.pag += +b.dataset.p; desenhar(); });
    }
    desenhar();
  }

  /** Agrupa e soma: retorna [[chave, soma]] em ordem decrescente. */
  function somarPor(linhas, chave, valor) {
    const m = new Map();
    for (const l of linhas) { const k = chave(l) || "Não informado"; m.set(k, (m.get(k) || 0) + valor(l)); }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }

  const secoes = [];
  function registrarSecao(s) { secoes.push(s); if (document.readyState !== "loading") montarAbas(); }

  function montarAbas() {
    const nav = document.getElementById("abas"), box = document.getElementById("secoes");
    if (!nav || !box) return;
    const todas = [{ id: "geral", titulo: "Visão geral" }, ...secoes];
    nav.innerHTML = todas.map(s => `<button type="button" role="tab" class="aba" data-id="${s.id}">${fmt.esc(s.titulo)}</button>`).join("");
    for (const s of secoes) {
      if (!document.getElementById("secao-" + s.id)) {
        const el = document.createElement("div"); el.id = "secao-" + s.id; el.hidden = true; el.className = "secao"; box.append(el);
      }
    }
    nav.querySelectorAll(".aba").forEach(b => b.onclick = () => abrir(b.dataset.id, true));
    abrir((location.hash || "").slice(1) || "geral", false);
  }

  async function abrir(id, push) {
    if (id !== "geral" && !secoes.some(s => s.id === id)) id = "geral";
    document.querySelectorAll("#abas .aba").forEach(b => b.setAttribute("aria-selected", b.dataset.id === id));
    document.getElementById("secao-geral").hidden = id !== "geral";
    for (const s of secoes) {
      const el = document.getElementById("secao-" + s.id);
      el.hidden = s.id !== id;
      if (s.id === id && !s._feito) {
        s._feito = true;
        el.innerHTML = `<div class="loading">Carregando…</div>`;
        try { await s.render(el); } catch (e) {
          s._feito = false;
          el.innerHTML = `<div class="loading">Ainda não há dados desta seção. A coleta roda todo dia às 6h15; volte mais tarde.</div>`;
          console.error(e);
        }
      }
    }
    if (push) history.replaceState(null, "", id === "geral" ? location.pathname : "#" + id);
  }

  document.addEventListener("DOMContentLoaded", montarAbas);
  addEventListener("hashchange", () => abrir((location.hash || "").slice(1) || "geral", false));
  window.Prefita = Object.assign(window.Prefita || {}, { registrarSecao, fmt, json, kpis, barras, tabela, somarPor });
})();
