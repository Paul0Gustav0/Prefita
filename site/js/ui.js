/* Prefita · núcleo do painel
   Expõe window.Prefita com:
     registrarSecao({id, titulo, icone?, ordem?, descricao?, filtros?, render(el, ctx)})
        render é chamado na primeira abertura da aba (pode ser async).
        Se a seção declarar filtros (true ou lista ["ano","mes","orgao","busca"]),
        render é chamado de novo sempre que um filtro muda; ctx.filtros traz o estado.
     fmt   { brl, brl0, compact, num, pct, data, esc }
     esc   (atalho de fmt.esc)
     ico(nome)                 ícone SVG em linha
     json(caminho)             fetch com cache em memória
     ui    { tile, tiles, sparkline, hbars, colunas, segbar, vazio, carregando, tabela }
     filtros                   estado global (ano, mes, orgao, busca, forn)
     setFiltro(obj)            muda filtros e re-renderiza a seção ativa
     setAtualizado(texto, ok)  selo "Atualizado em ..." no topo
*/
(function () {
  "use strict";
  const P = (window.Prefita = window.Prefita || {});

  /* ---------- formatação ---------- */
  const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2, minimumFractionDigits: 2 });
  const BRL0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
  const NUM = new Intl.NumberFormat("pt-BR");
  const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function compact(v, semMoeda) {
    const p = semMoeda ? "" : "R$ ";
    const a = Math.abs(v);
    if (a >= 1e9) return p + (v / 1e9).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + " bi";
    if (a >= 1e6) return p + (v / 1e6).toLocaleString("pt-BR", { maximumFractionDigits: a >= 1e8 ? 0 : 1 }) + " mi";
    if (a >= 1e3) return p + (v / 1e3).toLocaleString("pt-BR", { maximumFractionDigits: 0 }) + " mil";
    return semMoeda ? NUM.format(Math.round(v)) : BRL0.format(v);
  }
  function data(s) {
    if (!s) return "–";
    if (s instanceof Date) return s.toLocaleDateString("pt-BR");
    const m = String(s).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}/${m[2]}/${m[1]}` : String(s);
  }
  // pctF recebe uma fração (0,25 -> "25,0%"); pct recebe o número já em porcentagem (25 -> "25%").
  const pct = (v, casas = 1) => (v * 100).toLocaleString("pt-BR", { maximumFractionDigits: casas, minimumFractionDigits: casas }) + "%";
  const MESES_ = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
  P.fmt = {
    brl: (v) => BRL.format(+v || 0), brl0: (v) => BRL0.format(+v || 0), compact: (v, s) => compact(+v || 0, s), num: (v) => NUM.format(+v || 0),
    pct: (v) => (+v || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) + "%", pctF: pct, data, esc,
    mes: (chave) => { const [a, m] = String(chave).split("-"); return `${MESES_[+m - 1]} de ${a}`; }, MESES: MESES_,
  };
  P.esc = esc;
  P.MESES = MESES_;
  P.MES_ABBR = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

  /* ---------- ícones (traço 1.8, estilo lucide) ---------- */
  const ICONES = {
    home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/><path d="M10 21v-6h4v6"/>',
    doc: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><path d="M14 3v6h6"/><path d="M8 13h8M8 17h5"/>',
    list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3.5" cy="6" r=".5"/><circle cx="3.5" cy="12" r=".5"/><circle cx="3.5" cy="18" r=".5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    plane: '<path d="M10.5 13.5 3 11l1.5-1.5 7 1L16 6c1-1 3-1.5 3.5-1s0 2.5-1 3.5l-4.5 4.5 1 7L13.5 21 11 13.5"/>',
    coins: '<ellipse cx="9" cy="7" rx="6" ry="3"/><path d="M3 7v5c0 1.7 2.7 3 6 3s6-1.3 6-3V7"/><path d="M15 10.5c3 .3 6 1.5 6 3V18c0 1.7-2.7 3-6 3-2 0-3.8-.5-4.9-1.3"/>',
    gavel: '<path d="m14 13-7.5 7.5a2.1 2.1 0 0 1-3-3L11 10"/><path d="m16 16 6-6M8 8l6-6M9 7l8 8M21 11l-8-8"/>',
    gift: '<rect x="3" y="8" width="18" height="4" rx="1"/><path d="M12 8v13M19 12v9H5v-9"/><path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8s1-5 4.5-5a2.5 2.5 0 0 1 0 5"/>',
    scale: '<path d="M12 3v18M7 21h10M3 7h18"/><path d="m6 7-3 7a3 3 0 0 0 6 0zM18 7l-3 7a3 3 0 0 0 6 0z"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
    up: '<path d="M7 17 17 7M8 7h9v9"/>',
    down: '<path d="M7 7l10 10M17 8v9H8"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/>',
    ext: '<path d="M14 4h6v6M20 4l-9 9"/><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chart: '<path d="M3 3v18h18"/><path d="M7 15v2M11 11v6M15 8v9M19 5v12"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
    left: '<path d="m15 18-6-6 6-6"/>',
    right: '<path d="m9 18 6-6-6-6"/>',
    lock: '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    network: '<circle cx="12" cy="5" r="2.5"/><circle cx="5" cy="19" r="2.5"/><circle cx="19" cy="19" r="2.5"/><path d="M12 7.5v4M12 11.5 6.5 17M12 11.5l5.5 5.5"/>',
    download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 17v3h16v-3"/>',
    building: '<rect x="4" y="3" width="16" height="18" rx="1"/><path d="M9 7h1M14 7h1M9 11h1M14 11h1M9 15h1M14 15h1M10 21v-3h4v3"/>',
  };
  P.ico = (n, cls = "") => `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true">${ICONES[n] || ICONES.doc}</svg>`;

  /* ---------- dados ---------- */
  const jcache = {};
  P.json = (caminho, opts) => (jcache[caminho] ||= fetch(caminho, opts).then((r) => { if (!r.ok) throw new Error("HTTP " + r.status + " em " + caminho); return r.json(); }).catch((e) => { delete jcache[caminho]; throw e; }));

  /* ---------- componentes ---------- */
  const ui = (P.ui = {});
  ui.vazio = (msg = "Nada encontrado com esses filtros.") => `<div class="empty">${P.ico("search")}<span>${esc(msg)}</span></div>`;
  ui.carregando = (linhas = 3) => `<div style="display:flex;flex-direction:column;gap:10px">${Array.from({ length: linhas }, (_, i) => `<div class="skel" style="height:${i ? 14 : 22}px;width:${[60, 92, 78, 85, 70][i % 5]}%"></div>`).join("")}</div>`;

  // Sparkline: 12 pontos em tom neutro, ponto final em azul.
  ui.sparkline = (vals) => {
    const v = (vals || []).map((x) => +x || 0);
    if (v.length < 2 || !v.some((x) => x)) return "";
    const W = 200, H = 28, max = Math.max(...v), min = Math.min(0, ...v);
    const x = (i) => 3 + (i / (v.length - 1)) * (W - 6), y = (n) => H - 3 - ((n - min) / (max - min || 1)) * (H - 6);
    let last = v.length - 1;
    while (last > 0 && !v[last]) last--;
    const pts = v.slice(0, last + 1).map((n, i) => `${x(i).toFixed(1)},${y(n).toFixed(1)}`);
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true"><path class="a" d="M${pts[0].split(",")[0]},${H} L${pts.join(" L")} L${x(last).toFixed(1)},${H} Z"/><path class="l" vector-effect="non-scaling-stroke" d="M${pts.join(" L")}"/></svg>`;
  };

  // Indicador: {label, value, note, spark:[...], delta:{v, bomQuandoSobe, texto}}
  ui.tile = (t) => {
    let d = "";
    if (t.delta && isFinite(t.delta.v)) {
      const sobe = t.delta.v > 0, cls = Math.abs(t.delta.v) < 0.005 ? "" : sobe === !!t.delta.bomQuandoSobe ? "down" : "up";
      d = `<span class="delta ${cls}" title="${esc(t.delta.texto || "")}">${P.ico(sobe ? "up" : "down")}${pct(Math.abs(t.delta.v))}</span>`;
    }
    return `<div class="tile"><div class="tile-top"><span class="tile-label">${esc(t.label)}</span>${d}</div><div class="tile-value" title="${esc(t.title || "")}">${t.value}</div>${t.note ? `<div class="tile-note">${t.note}</div>` : ""}${t.spark ? ui.sparkline(t.spark) : ""}</div>`;
  };
  ui.tiles = (lista) => `<div class="tiles">${lista.map(ui.tile).join("")}</div>`;

  // Ranking: items [{k, v, sub?}], opts {total, onClick(k), formato}
  ui.hbars = (el, items, opts = {}) => {
    if (!items.length) { el.innerHTML = ui.vazio(); return; }
    const max = Math.max(...items.map((i) => i.v)) || 1, f = opts.formato || compact;
    el.classList.add("hbars");
    el.innerHTML = items.map((it, i) => `<button class="hbar" type="button" data-i="${i}" title="${esc(it.k)}"><span class="rk">${i + 1}</span><span class="n">${esc(it.k)}</span><span class="a">${f(it.v)}${opts.total ? `<small>${pct(it.v / opts.total, 1)}</small>` : ""}</span><span class="track"><span class="fill" style="width:${Math.max(0.8, (it.v / max) * 100)}%;animation-delay:${i * 30}ms"></span></span></button>`).join("");
    if (opts.onClick) el.querySelectorAll(".hbar").forEach((b) => (b.onclick = () => opts.onClick(items[+b.dataset.i].k)));
    else el.querySelectorAll(".hbar").forEach((b) => (b.style.cursor = "default"));
  };

  // Barra segmentada: partes [{k, v, cor}]
  ui.segbar = (partes) => {
    const tot = partes.reduce((s, p) => s + Math.max(0, p.v), 0) || 1;
    const vis = partes.filter((p) => p.v > 0);
    return `<div class="segbar" role="img" aria-label="${esc(vis.map((p) => `${p.k}: ${pct(p.v / tot)}`).join(", "))}">${vis.map((p) => `<span style="flex:${p.v / tot} 1 0;background:${p.cor}" title="${esc(p.k)}: ${compact(p.v)} (${pct(p.v / tot)})"></span>`).join("")}</div>
      <div class="seglegend">${partes.map((p) => `<div><span><i style="background:${p.cor}"></i>${esc(p.k)}</span><b>${compact(p.v)}</b><span class="faint">${pct(Math.max(0, p.v) / tot)}</span></div>`).join("")}</div>`;
  };

  /* Colunas por categoria (ex.: meses) com linha opcional no mesmo eixo.
     opts: {rotulos, rotulosLongos, a, b, nomeA, nomeB, sel (índice|-1), onClick(i), aria, altura} */
  ui.colunas = (el, o) => {
    const n = o.rotulos.length, H = o.altura || 260, W = Math.max(300, el.clientWidth || 600);
    const P_ = { l: 52, r: 8, t: 14, b: 28 };
    const vals = [...o.a, ...(o.b || [])].map((v) => Math.max(0, +v || 0));
    const max = Math.max(...vals, 1);
    const step = Math.pow(10, Math.floor(Math.log10(max)));
    const nice = [1, 2, 2.5, 5, 10].map((x) => x * step).find((x) => max / x <= 4.5) || step * 10;
    const top = Math.ceil(max / nice) * nice;
    const iw = W - P_.l - P_.r, ih = H - P_.t - P_.b, bw = iw / n, y = (v) => P_.t + ih - (Math.max(0, v) / top) * ih;
    const cw = Math.min(24, bw * 0.56);
    let g = "";
    for (let v = 0; v <= top + 1e-9; v += nice) g += `<line class="${v ? "gl" : "base"}" x1="${P_.l}" x2="${W - P_.r}" y1="${y(v)}" y2="${y(v)}"/><text x="${P_.l - 10}" y="${y(v) + 4}" text-anchor="end">${compact(v, true)}</text>`;
    let cols = "";
    for (let i = 0; i < n; i++) {
      const v = +o.a[i] || 0, cx = P_.l + i * bw + bw / 2, x = cx - cw / 2, h = Math.max(0, P_.t + ih - y(v)), r = Math.min(4, cw / 2, h);
      const dim = o.sel >= 0 && o.sel !== i;
      const bar = v > 0 ? `<path class="bar${dim ? " dim" : ""}" d="M${x},${P_.t + ih} V${y(v) + r} q0,-${r} ${r},-${r} H${x + cw - r} q${r},0 ${r},${r} V${P_.t + ih} Z"/>` : "";
      cols += `<g class="col${o.sel === i ? " sel" : ""}" data-i="${i}"><rect class="band" x="${P_.l + i * bw + 1}" y="${P_.t}" width="${bw - 2}" height="${ih}" rx="6"/>${bar}<text x="${cx}" y="${H - 8}" text-anchor="middle">${esc(bw < 30 ? String(o.rotulos[i]).charAt(0).toUpperCase() : o.rotulos[i])}</text><rect x="${P_.l + i * bw}" y="0" width="${bw}" height="${H}" fill="transparent"/></g>`;
    }
    let line = "";
    if (o.b) {
      const pts = o.b.map((v, i) => [P_.l + i * bw + bw / 2, y(+v || 0), +v || 0]);
      let last = pts.length - 1;
      while (last > 0 && !pts[last][2]) last--;
      const seg = pts.slice(0, last + 1);
      if (seg.some((p) => p[2])) line = `<path class="ln" d="M${seg.map((p) => p[0].toFixed(1) + "," + p[1].toFixed(1)).join(" L")}"/>` + seg.map((p) => `<circle class="dot" cx="${p[0]}" cy="${p[1]}" r="4"/>`).join("");
    }
    el.classList.add("chart");
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" role="img" aria-label="${esc(o.aria || "")}">${g}${cols}<g style="pointer-events:none">${line}</g></svg><div class="tip" hidden></div>`;
    const tip = el.querySelector(".tip");
    el.querySelectorAll(".col").forEach((c) => {
      const i = +c.dataset.i;
      const show = () => {
        el.querySelectorAll(".col.on").forEach((x) => x.classList.remove("on"));
        c.classList.add("on");
        const cx = ((P_.l + i * bw + bw / 2) / W) * el.clientWidth;
        tip.hidden = false;
        tip.style.left = Math.min(Math.max(cx, 100), el.clientWidth - 100) + "px";
        tip.style.top = (y(Math.max(+o.a[i] || 0, +(o.b?.[i]) || 0)) / H) * H + "px";
        const tem = (+o.a[i] || 0) || (+(o.b?.[i]) || 0);
        tip.innerHTML = `<b>${esc((o.rotulosLongos || o.rotulos)[i])}</b>` + (tem ? `<div class="r"><span><i class="sw"></i>${esc(o.nomeA)}</span><b>${BRL0.format(+o.a[i] || 0)}</b></div>` + (o.b ? `<div class="r"><span><i class="sw s2"></i>${esc(o.nomeB)}</span><b>${BRL0.format(+o.b[i] || 0)}</b></div>` : "") : `<div class="r">Ainda sem dados</div>`);
      };
      c.addEventListener("pointerenter", show);
      c.addEventListener("pointerleave", () => { tip.hidden = true; c.classList.remove("on"); });
      if (o.onClick) c.addEventListener("click", () => o.onClick(i));
    });
  };

  /* ---------- busca sem acento ---------- */
  // norm("São JOÃO") -> "sao joao". contem(texto, busca): todas as palavras da busca aparecem no texto.
  P.norm = (s) => String(s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  P.contem = (texto, busca) => { const t = P.norm(Array.isArray(texto) ? texto.join(" ") : texto); return P.norm(busca).split(/\s+/).filter(Boolean).every((w) => t.includes(w)); };

  /* Tabela paginada, ordenável, com busca própria e download em CSV.
     cols: [{k, t, r?(alinha à direita), html(row)?, val(row)?, cls?}]
     opts {porPagina, ordem:{k,dir}, vazio, unidade, busca (true/false; padrão: mais de 10 linhas), arquivo (nome do CSV)} */
  ui.tabela = (el, linhas, cols, opts = {}) => {
    const st = el._st || (el._st = { k: opts.ordem?.k || cols[0].k, dir: opts.ordem?.dir || -1, pg: 0, q: "" });
    if (opts.resetar) st.pg = 0;
    const PG = opts.porPagina || 25;
    const val = (c, r) => (c.val ? c.val(r) : r[c.k]);
    const comBusca = opts.busca ?? linhas.length > 10;
    const unidade = opts.unidade || "linhas";
    const txt = linhas.length && comBusca ? linhas.map((r) => P.norm(cols.map((c) => { const v = val(c, r); return v instanceof Date ? v.toLocaleDateString("pt-BR") : v; }).join(" "))) : [];
    el.innerHTML = `${comBusca || linhas.length ? `<div class="tbl-bar">${comBusca ? `<label class="field grow">${P.ico("search")}<span class="sr">Buscar na tabela</span><input type="search" data-q placeholder="${esc(opts.placeholder || "Buscar nesta lista")}" autocomplete="off"></label>` : "<span></span>"}<button class="btn sm ghost" type="button" data-csv title="Baixar a lista filtrada como planilha (CSV)">${P.ico("download")}Baixar CSV</button></div>` : ""}<div data-corpo></div>`;
    const corpo = el.querySelector("[data-corpo]"), inp = el.querySelector("[data-q]");
    const filtradas = () => { if (!st.q.trim()) return linhas; const ws = P.norm(st.q).split(/\s+/).filter(Boolean); return linhas.filter((_, i) => ws.every((w) => txt[i].includes(w))); };
    const ordenadas = () => { const c0 = cols.find((c) => c.k === st.k) || cols[0]; return [...filtradas()].sort((a, b) => { const x = val(c0, a), y = val(c0, b); return (x > y ? 1 : x < y ? -1 : 0) * st.dir; }); };
    const draw = () => {
      const s = ordenadas();
      const pages = Math.max(1, Math.ceil(s.length / PG));
      st.pg = Math.max(0, Math.min(st.pg, pages - 1));
      const pg = s.slice(st.pg * PG, (st.pg + 1) * PG);
      const vazio = st.q.trim() ? `<div class="empty">${P.ico("search")}<span>Nada encontrado para “${esc(st.q)}”.</span><button class="btn sm" type="button" data-limpar-busca>Limpar busca</button></div>` : ui.vazio(opts.vazio);
      const de = s.length ? st.pg * PG + 1 : 0, ate = st.pg * PG + pg.length;
      corpo.innerHTML = `<div class="table-wrap"><table><thead><tr>${cols.map((c) => `<th data-k="${c.k}" class="${c.r ? "r" : ""}" tabindex="0" ${c.k === st.k ? `aria-sort="${st.dir > 0 ? "ascending" : "descending"}"` : ""}>${esc(c.t)}<span class="ar">${st.dir > 0 ? "↑" : "↓"}</span></th>`).join("")}</tr></thead><tbody>${pg.length ? pg.map((r) => `<tr>${cols.map((c) => `<td data-label="${esc(c.t)}" class="${c.r ? "r num" : ""} ${c.cls || ""}"><div class="cv">${c.html ? c.html(r) : esc(val(c, r))}</div></td>`).join("")}</tr>`).join("") : `<tr><td colspan="${cols.length}">${vazio}</td></tr>`}</tbody></table></div>
        <div class="card-ft tbl-ft"><span>${s.length ? `${NUM.format(de)}–${NUM.format(ate)} de ${NUM.format(s.length)} ${esc(unidade)}` : `0 ${esc(unidade)}`}${st.q.trim() && s.length !== linhas.length ? ` <span class="faint">(de ${NUM.format(linhas.length)})</span>` : ""}</span><span class="pager">${pages > 2 ? `<button class="btn sm ghost" data-ir="0" ${st.pg === 0 ? "disabled" : ""} aria-label="Primeira página">«</button>` : ""}<button class="btn sm" data-p="-1" ${st.pg === 0 ? "disabled" : ""}>${P.ico("left")}<span>Anterior</span></button><span class="pg-n">${st.pg + 1} / ${pages}</span><button class="btn sm" data-p="1" ${st.pg >= pages - 1 ? "disabled" : ""}><span>Próxima</span>${P.ico("right")}</button>${pages > 2 ? `<button class="btn sm ghost" data-ir="${pages - 1}" ${st.pg >= pages - 1 ? "disabled" : ""} aria-label="Última página">»</button>` : ""}</span></div>`;
      const ordenar = (th) => { const k = th.dataset.k; const c = cols.find((x) => x.k === k); st.dir = st.k === k ? -st.dir : c.r || k === "dt" ? -1 : 1; st.k = k; st.pg = 0; draw(); };
      corpo.querySelectorAll("th[data-k]").forEach((th) => { th.onclick = () => ordenar(th); th.onkeydown = (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); ordenar(th); } }; });
      const topo = () => { const r = el.getBoundingClientRect(); if (r.top < 0) window.scrollBy({ top: r.top - 130, behavior: "smooth" }); };
      corpo.querySelectorAll("[data-p]").forEach((b) => (b.onclick = () => { st.pg += +b.dataset.p; draw(); topo(); }));
      corpo.querySelectorAll("[data-ir]").forEach((b) => (b.onclick = () => { st.pg = +b.dataset.ir; draw(); topo(); }));
      const lb = corpo.querySelector("[data-limpar-busca]"); if (lb) lb.onclick = () => { st.q = ""; if (inp) { inp.value = ""; inp.focus(); } draw(); };
    };
    if (inp) { inp.value = st.q; let t; inp.oninput = () => { clearTimeout(t); t = setTimeout(() => { st.q = inp.value; st.pg = 0; draw(); }, 120); }; }
    const csv = el.querySelector("[data-csv]");
    if (csv) csv.onclick = () => {
      const q = (v) => { if (v instanceof Date) v = v.toLocaleDateString("pt-BR"); if (typeof v === "number") v = String(v).replace(".", ","); v = String(v ?? ""); return /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v; };
      const rows = [cols.map((c) => q(c.t)).join(";"), ...ordenadas().map((r) => cols.map((c) => q(val(c, r))).join(";"))];
      const blob = new Blob(["\ufeff" + rows.join("\r\n")], { type: "text/csv;charset=utf-8" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = (opts.arquivo || "prefita-" + (ativa?.id || "lista")) + ".csv";
      document.body.append(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    };
    draw();
  };

  /* ---------- atalhos usados pelas seções do portal da Prefeitura ---------- */
  P.kpis = (lista) => ui.tiles(lista.map(([label, value, note]) => ({ label: String(label).replace(/<[^>]+>/g, ""), value, note })));
  P.barras = (el, itens, o = {}) => ui.hbars(el, itens.map(([k, v]) => ({ k, v })), { total: o.total ?? itens.reduce((s, i) => s + i[1], 0), onClick: o.onClick, formato: o.formato });
  P.somarPor = (linhas, chave, valor) => { const m = new Map(); for (const l of linhas) { const k = chave(l) || "Não informado"; m.set(k, (m.get(k) || 0) + valor(l)); } return [...m.entries()].sort((a, b) => b[1] - a[1]); };
  // colunas: [{t, k: chave|fn(linha), r, f(valor, linha), mono}]; opts {porPagina, ordem (índice), dir, vazio}
  P.tabela = (el, colunas, linhas, o = {}) => {
    const cols = colunas.map((c, i) => ({ k: "c" + i, t: c.t, r: c.r, cls: c.mono ? "mono" : "", val: (l) => (typeof c.k === "function" ? c.k(l) : l[c.k]),
      html: (l) => { const v = typeof c.k === "function" ? c.k(l) : l[c.k]; return c.f ? c.f(v, l) : esc(v); } }));
    // mantém busca e ordenação quando a seção redesenha a mesma tabela (ex.: depois de um filtro)
    if (el._st && el._cols !== colunas.length) el._st = null;
    el._cols = colunas.length;
    if (el._st) el._st.pg = 0;
    ui.tabela(el, linhas, cols, { porPagina: o.porPagina, ordem: { k: "c" + (o.ordem || 0), dir: o.dir || -1 }, vazio: o.vazio, unidade: o.unidade || "registros", busca: o.busca, arquivo: o.arquivo, placeholder: o.placeholder });
  };

  /* ---------- filtros globais ---------- */
  P.filtros = { ano: "", mes: "", orgao: "", busca: "", forn: "" };
  P.anos = [];
  P.setFiltro = (o) => { Object.assign(P.filtros, o); syncToolbar(); salvarUrl(); rerender(); };
  // Filtros ficam no link (#/visao-geral?ano=2025&mes=3), para compartilhar ou voltar depois.
  const CHAVES = ["ano", "mes", "orgao", "busca", "forn"];
  function salvarUrl() {
    if (!ativa) return;
    const f = ativa.filtros === true ? CHAVES.slice(0, 4).concat("forn") : Array.isArray(ativa.filtros) ? ativa.filtros : [];
    const q = new URLSearchParams();
    for (const k of f) { const v = P.filtros[k]; if (v && !(k === "ano" && String(v) === String(P.anos[0]))) q.set(k, v); }
    const h = "#/" + ativa.id + (q.toString() ? "?" + q : "");
    if (location.hash !== h) history.replaceState(null, "", h);
  }
  function lerUrl() {
    const m = location.hash.match(/\?(.*)$/);
    if (!m) return;
    const q = new URLSearchParams(m[1]);
    for (const k of CHAVES) if (q.has(k)) P.filtros[k] = q.get(k);
    if (P.filtros.ano && !P.anos.map(String).includes(String(P.filtros.ano))) P.filtros.ano = String(P.anos[0]);
  }

  /* ---------- seções e navegação ---------- */
  const secoes = [];
  const ORDEM = { "gastos-do-dia": 1.5, folha: 1.6, licitacoes: 2.5, diarias: 2.6, receitas: 2.7, emendas: 2.8 };
  const FONTE_SECAO = { "gastos-do-dia": "Portal da Transparência da Prefeitura", folha: "Portal da Transparência da Prefeitura e SICONFI", diarias: "Portal da Transparência da Prefeitura", licitacoes: "Portal da Transparência da Prefeitura", receitas: "Portal da Transparência da Prefeitura", emendas: "Transferegov" };
  const CURTO = { folha: "Folha", licitacoes: "Licitações", diarias: "Diárias", "empenhos": "Empenhos", contratos: "Contratos" };
  const ICONE_SECAO = { "gastos-do-dia": "clock", folha: "users", diarias: "plane", licitacoes: "gavel", receitas: "coins", emendas: "gift" };
  let ativa = null, booted = false, nOrdem = 10;
  P.registrarSecao = (def) => {
    if (!def || !def.id || secoes.some((s) => s.id === def.id)) return;
    secoes.push({ ordem: def.ordem ?? ORDEM[def.id] ?? nOrdem++, icone: def.icone || ICONE_SECAO[def.id], ...def, _el: null, _feito: false });
    secoes.sort((a, b) => a.ordem - b.ordem);
    if (booted) { montarNav(); if (location.hash.replace(/^#\/?/, "") === def.id) rota(); }
  };
  P.secoes = secoes;

  function montarNav() {
    const nav = document.getElementById("nav");
    nav.innerHTML = secoes.map((s) => `<a href="#/${s.id}" data-id="${s.id}">${P.ico(s.icone || "doc")}<span>${esc(s.tituloCurto || CURTO[s.id] || s.titulo)}</span></a>`).join("");
    marcarNav();
  }
  function marcarNav() {
    document.querySelectorAll("#nav a").forEach((a) => { if (a.dataset.id === ativa?.id) { a.setAttribute("aria-current", "page"); const n = a.parentElement; if (a.offsetLeft < n.scrollLeft || a.offsetLeft + a.offsetWidth > n.scrollLeft + n.clientWidth) n.scrollLeft = a.offsetLeft - 16; } else a.removeAttribute("aria-current"); });
  }

  const FILTROS_TODOS = ["ano", "mes", "orgao", "busca"];
  function toolbar(s) {
    const tb = document.getElementById("toolbar");
    const f = s.filtros === true ? FILTROS_TODOS : Array.isArray(s.filtros) ? s.filtros : [];
    tb.hidden = !f.length;
    if (!f.length) return;
    const has = (k) => f.includes(k);
    tb.innerHTML =
      (has("ano") ? `<label class="field">${P.ico("calendar")}<span class="sr">Ano</span><select id="fAno">${P.anos.map((a) => `<option value="${a}">${a}</option>`).join("")}</select></label>` : "") +
      (has("mes") ? `<label class="field"><span class="sr">Mês</span><select id="fMes"><option value="">Ano inteiro</option>${P.MESES.map((m, i) => `<option value="${i + 1}">${m}</option>`).join("")}</select></label>` : "") +
      (has("orgao") ? `<label class="field">${P.ico("building")}<span class="sr">Órgão</span><select id="fOrgao"><option value="">Prefeitura e Câmara</option><option value="P">Só Prefeitura</option><option value="C">Só Câmara</option></select></label>` : "") +
      (has("busca") ? `<label class="field grow">${P.ico("search")}<span class="sr">Buscar</span><input id="fBusca" type="search" placeholder="${esc(s.placeholder || "Buscar fornecedor, empenho ou contrato")}" autocomplete="off"></label>` : "") +
      `<span id="fChip"></span>`;
    const on = (id, ev, fn) => { const e = document.getElementById(id); if (e) e[ev] = fn; };
    on("fAno", "onchange", (e) => P.setFiltro({ ano: e.target.value, mes: "" }));
    on("fMes", "onchange", (e) => P.setFiltro({ mes: e.target.value }));
    on("fOrgao", "onchange", (e) => P.setFiltro({ orgao: e.target.value }));
    let t;
    on("fBusca", "oninput", (e) => { clearTimeout(t); t = setTimeout(() => P.setFiltro({ busca: e.target.value }), 160); });
    syncToolbar();
  }
  function syncToolbar() {
    const v = (id, x) => { const e = document.getElementById(id); if (e && e.value !== x && document.activeElement !== e) e.value = x; };
    v("fAno", String(P.filtros.ano)); v("fMes", String(P.filtros.mes)); v("fOrgao", P.filtros.orgao); v("fBusca", P.filtros.busca);
    const chip = document.getElementById("fChip");
    if (chip) {
      chip.innerHTML = P.filtros.forn ? `<button class="chip" type="button" aria-label="Remover filtro de fornecedor"><span>${esc(P.filtros.forn)}</span><i>✕</i></button>` : "";
      if (P.filtros.forn) chip.firstChild.onclick = () => P.setFiltro({ forn: "" });
    }
  }

  async function renderSecao(s) {
    try { await s.render(s._el, { filtros: P.filtros, P }); }
    catch (e) { console.error(e); s._feito = false; s._el.innerHTML = `<div class="notice">${P.ico("info")}<span>Ainda não há dados desta seção. A coleta roda todo dia às 6h15; volte mais tarde.</span></div>`; }
  }
  function rerender() { if (ativa && ativa.filtros) renderSecao(ativa); }

  function rota() {
    lerUrl();
    const id = location.hash.replace(/^#\/?/, "").replace(/\?.*$/, "");
    const s = secoes.find((x) => x.id === id || "secao-" + x.id === id) || secoes[0];
    if (!s) return;
    const view = document.getElementById("views");
    if (ativa && ativa._wrap) ativa._wrap.hidden = true;
    ativa = s;
    if (!s._el) {
      const wrap = document.createElement("section"); wrap.className = "view"; wrap.dataset.secao = s.id; view.append(wrap);
      if (s.proprioCabecalho) s._el = s._wrap = wrap;
      else {
        wrap.innerHTML = `<div class="page-head"><div><div class="eyebrow">${esc(s.fonte || FONTE_SECAO[s.id] || "")}</div><h1>${esc(s.titulo)}</h1>${s.descricao ? `<p>${esc(s.descricao)}</p>` : ""}</div></div><div class="view-bd"></div>`;
        s._wrap = wrap; s._el = wrap.lastChild;
      }
    }
    s._wrap.hidden = false;
    s._wrap.style.animation = "none"; void s._wrap.offsetWidth; s._wrap.style.animation = "";
    document.title = (s.id === secoes[0].id ? "" : s.titulo + " · ") + "Prefita · Gastos de Itaberá";
    toolbar(s);
    marcarNav();
    salvarUrl();
    if (!s._feito || s.filtros) { s._feito = true; if (!s.filtros) s._el.innerHTML = ui.carregando(4); renderSecao(s); }
    if (P._rolou) window.scrollTo({ top: 0, behavior: "instant" });
    P._rolou = true;
  }
  P.irPara = (id) => { if (location.hash === "#/" + id) rota(); else location.hash = "#/" + id; };

  P.setAtualizado = (txt, ok = true) => {
    const e = document.getElementById("live");
    e.classList.toggle("off", !ok);
    e.querySelector("span").textContent = txt;
    e.title = txt;
  };

  /* ---------- tema ---------- */
  function tema() {
    const btn = document.getElementById("tema");
    const atual = () => document.documentElement.dataset.theme || (matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light");
    const pinta = () => { btn.innerHTML = P.ico(atual() === "dark" ? "sun" : "moon"); btn.setAttribute("aria-label", atual() === "dark" ? "Usar tema claro" : "Usar tema escuro"); };
    try { const t = localStorage.getItem("prefita-tema"); if (t) document.documentElement.dataset.theme = t; } catch (e) {}
    pinta();
    btn.onclick = () => {
      const t = atual() === "dark" ? "light" : "dark";
      document.documentElement.dataset.theme = t;
      try { localStorage.setItem("prefita-tema", t); } catch (e) {}
      pinta();
      rerender();
    };
  }

  let rt, lastW = innerWidth;
  addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(() => { if (Math.abs(innerWidth - lastW) > 40) { lastW = innerWidth; rerender(); } }, 200); });

  P.iniciar = async () => {
    tema();
    try {
      const r = await P.json("data/resumo.json", { cache: "no-cache" });
      P.resumo = r;
      P.anos = [...(r.anos || [])].sort((a, b) => b - a);
      P.filtros.ano = String(P.anos[0] || new Date().getFullYear());
      const at = new Date(r.atualizado_em);
      P.setAtualizado("Atualizado em " + at.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" }) + ", " + at.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }));
    } catch (e) {
      P.setAtualizado("Sem dados ainda", false);
      P.anos = [new Date().getFullYear()];
      P.filtros.ano = String(P.anos[0]);
    }
    booted = true;
    montarNav();
    addEventListener("hashchange", rota);
    // Atalho: "/" vai para a busca da página
    addEventListener("keydown", (e) => {
      if (e.key !== "/" || e.ctrlKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName)) return;
      const alvo = [...document.querySelectorAll("#toolbar input[type=search], .view:not([hidden]) input[type=search]")].find((i) => i.offsetParent);
      if (alvo) { e.preventDefault(); alvo.focus(); alvo.select(); }
    });
    rota();
  };
})();
