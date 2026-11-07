/* Prefita · busca única: procura uma pessoa ou empresa em todas as abas ao mesmo tempo.
   Abre pelo botão "Buscar em tudo" do topo ou pela tecla "/". Cada resultado leva para a aba já filtrada. */
(function () {
  "use strict";
  const P = window.Prefita, { esc, compact, num, brl } = P.fmt;
  const cnpjFmt = (c) => String(c || "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

  // Agrupa linhas por nome: [{nome, txt, valor, n, sub}]
  function agrupar(linhas, nome, valor, extra) {
    const m = new Map();
    for (const l of linhas) {
      const k = nome(l); if (!k) continue;
      const g = m.get(k) || m.set(k, { nome: k, valor: 0, n: 0, txt: k, sub: "" }).get(k);
      g.valor += valor(l) || 0; g.n++;
      if (extra && !g.extraFeito) { extra(g, l); g.extraFeito = true; }
    }
    return [...m.values()].map((g) => ({ ...g, norm: P.norm(g.txt) }));
  }
  async function anoPortal() { const r = await P.json("data/resumo.json"); return Math.max(...(r.anos_portal || [new Date().getFullYear()])); }

  const FONTES = [
    { id: "folha", titulo: "Folha de pagamento", icone: "users", async carregar() {
        const meses = [...(await P.json("data/folha-meses.json"))].sort();
        const m = meses[meses.length - 1];
        const j = await P.json(`data/folha-${m}.json`);
        this.quando = P.fmt.mes(m);
        return j.r.map((r) => ({ nome: r[0], txt: r[0], sub: `${j.cargo[r[1]]} · ${j.sec[r[2]]}`, valor: r[6], unidade: "salário bruto", det: ["servidor", { nome: r[0], mes: m }], norm: P.norm(r[0] + " " + j.cargo[r[1]]) }));
      } },
    { id: "gastos-do-dia", titulo: "Gastos do dia (empenhos da Prefeitura)", icone: "clock", async carregar() {
        const ano = await anoPortal();
        const j = await P.json(`data/despesas-${ano}.json`);
        this.quando = String(ano);
        return agrupar(j.r, (r) => j.forn[r[3]], (r) => r[10], (g, r) => { g.txt += " " + j.doc[r[4]]; g.sub = j.doc[r[4]] || ""; g.doc = j.doc[r[4]]; }).map((g) => ({ ...g, det: ["fornecedor", { nome: g.nome, doc: g.doc }], sub: `${g.sub ? g.sub + " · " : ""}${num(g.n)} empenhos`, unidade: "empenhado" }));
      } },
    { id: "contratos", titulo: "Contratos no PNCP", icone: "doc", async carregar() {
        const c = await P.tce.carregarContratos();
        this.quando = "2023 em diante";
        return agrupar(c, (x) => x.forn, (x) => +x.valor, (g, x) => { g.txt += " " + (x.doc || ""); g.sub = cnpjFmt(x.doc); g.doc = x.doc; }).map((g) => ({ ...g, det: ["fornecedor", { nome: g.nome, doc: g.doc }], sub: `${g.sub ? g.sub + " · " : ""}${num(g.n)} contrato${g.n > 1 ? "s" : ""}`, unidade: "contratado" }));
      } },
    { id: "licitacoes", titulo: "Licitações e contratos (portal da Prefeitura)", icone: "gavel", async carregar() {
        const ano = await anoPortal();
        const c = await P.json(`data/contratos-${ano}.json`);
        this.quando = String(ano);
        return agrupar(c.filter((x) => !x.anulado), (x) => x.forn, (x) => x.valor + (x.aditado || 0), (g, x) => { g.txt += " " + (x.doc || ""); g.sub = x.doc || ""; g.doc = x.doc; }).map((g) => ({ ...g, det: ["fornecedor", { nome: g.nome, doc: g.doc }], sub: `${g.sub ? g.sub + " · " : ""}${num(g.n)} contrato${g.n > 1 ? "s" : ""}`, unidade: "contratado" }));
      } },
    { id: "diarias", titulo: "Diárias e viagens", icone: "plane", async carregar() {
        const ano = await anoPortal();
        const d = await P.json(`data/diarias-${ano}.json`);
        this.quando = String(ano);
        return agrupar(d, (x) => x.fav, (x) => x.valor, (g, x) => { g.sub = x.cargo || x.orgao || ""; }).map((g) => ({ ...g, det: ["pessoa", { nome: g.nome }], sub: `${g.sub ? g.sub + " · " : ""}${num(g.n)} lançamento${g.n > 1 ? "s" : ""}`, unidade: "recebido" }));
      } },
    { id: "empenhos", titulo: "Empenhos no Tribunal de Contas", icone: "list", async carregar() {
        const ano = P.anos[0];
        const d = await P.tce.ano(ano);
        this.quando = String(ano);
        return agrupar(d.filter((x) => x.ev === "E"), (x) => x.forn, (x) => x.liq, (g, x) => { g.sub = P.tce.tipoCredor(x); }).map((g) => ({ ...g, det: ["pessoa", { nome: g.nome }], sub: `${g.sub} · ${num(g.n)} empenhos`, unidade: "empenhado" }));
      } },
    { id: "socios", titulo: "Sócios dos fornecedores", icone: "network", async carregar() {
        const d = await P.json("data/socios.json");
        this.quando = "cadastro da Receita";
        return (d.empresas || []).map((e) => ({ nome: e.nome, txt: e.nome, valor: e.valor, unidade: "empenhado", det: ["fornecedor", { nome: e.nome, doc: e.cnpj }],
          sub: `${cnpjFmt(e.cnpj)}${e.socios.length ? " · sócios: " + e.socios.map((s) => s[0]).slice(0, 3).join(", ") : ""}`,
          norm: P.norm([e.nome, e.fantasia, e.cnpj, ...e.socios.map((s) => s[0])].join(" ")) }));
      } },
  ];

  let carregadas = null;
  const carregar = () => (carregadas ||= Promise.all(FONTES.map(async (f) => { try { f.itens = await f.carregar(); } catch (e) { f.itens = []; } return f; })));

  function dialogo() {
    let d = document.getElementById("dlgBusca");
    if (d) return d;
    d = document.createElement("dialog");
    d.id = "dlgBusca"; d.className = "dlg dlg-busca";
    d.innerHTML = `<div class="dlg-search"><label class="field grow">${P.ico("search")}<span class="sr">Buscar em todo o painel</span><input type="search" id="bgInput" placeholder="Nome de uma pessoa, empresa ou CNPJ" autocomplete="off"></label><button class="btn sm ghost" type="button" data-fechar>Fechar</button></div>
      <div class="dlg-bd" id="bgRes"></div>`;
    document.body.append(d);
    d.querySelector("[data-fechar]").onclick = () => d.close();
    d.addEventListener("click", (e) => { if (e.target === d) d.close(); if (e.target.closest("a.res, a[data-ver]")) d.close(); });
    const inp = d.querySelector("#bgInput");
    let t;
    inp.oninput = () => { clearTimeout(t); t = setTimeout(() => mostrar(inp.value), 150); };
    inp.onkeydown = (e) => { if (e.key === "Enter") { e.preventDefault(); const a = d.querySelector("a.res"); if (a) a.click(); } };
    return d;
  }

  const DICA = `<div class="bg-dica">${P.ico("info")}<div><b>Procure em todas as abas de uma vez.</b><br>Digite o nome de um servidor, de uma empresa, de um sócio ou um CNPJ. Não precisa de acento nem do nome completo: "maria silva" encontra "MARIA APARECIDA DA SILVA". Toque num resultado para ver a ficha completa.</div></div>`;

  async function mostrar(termo) {
    const res = document.getElementById("bgRes");
    termo = termo.trim();
    if (P.norm(termo).replace(/\s/g, "").length < 3) { res.innerHTML = DICA; return; }
    if (!carregadas || !FONTES.every((f) => f.itens)) res.innerHTML = `<div class="empty">${P.ico("search")}<span>Carregando os dados de todas as abas…</span></div>`;
    await carregar();
    if (document.getElementById("bgInput").value.trim() !== termo) return;
    const ws = P.norm(termo).split(/\s+/).filter(Boolean);
    const grupos = FONTES.map((f) => {
      const achados = f.itens.filter((i) => ws.every((w) => (i.norm || P.norm(i.txt)).includes(w))).sort((a, b) => (b.valor || 0) - (a.valor || 0));
      return { f, achados };
    }).filter((g) => g.achados.length);
    if (!grupos.length) { res.innerHTML = `<div class="empty">${P.ico("search")}<span>Nada encontrado para “${esc(termo)}” em nenhuma aba.</span><span class="faint">Confira a grafia ou tente só o sobrenome.</span></div>`; return; }
    const dets = [];
    const total = grupos.reduce((s, g) => s + g.achados.length, 0);
    res.innerHTML = `<div class="bg-resumo">${num(total)} resultado${total > 1 ? "s" : ""} em ${grupos.length} aba${grupos.length > 1 ? "s" : ""}</div>` + grupos.map(({ f, achados }) => `
      <section class="bg-grupo">
        <div class="bg-hd"><span>${P.ico(f.icone)}<b>${esc(f.titulo)}</b><small>${esc(f.quando || "")}</small></span><a data-ver href="#/${f.id}?busca=${encodeURIComponent(termo)}">Ver ${achados.length > 1 ? `os ${num(achados.length)}` : ""} na aba ${P.ico("right")}</a></div>
        ${achados.slice(0, 5).map((i) => `<a class="res" href="#/${f.id}?busca=${encodeURIComponent(i.nome)}" ${i.det ? `data-det-i="${dets.push(i.det) - 1}" title="Ver a ficha completa"` : ""}><span class="res-t"><b>${esc(i.nome)}</b><small>${esc(i.sub || "")}</small></span>${i.valor ? `<span class="res-v"><b>${compact(i.valor)}</b><small>${esc(i.unidade || "")}</small></span>` : ""}</a>`).join("")}
        ${achados.length > 5 ? `<div class="bg-mais faint">e mais ${num(achados.length - 5)}</div>` : ""}
      </section>`).join("");
    res.querySelectorAll("[data-det-i]").forEach((a) => (a.onclick = (e) => { e.preventDefault(); const [t, x] = dets[+a.dataset.detI]; document.getElementById("dlgBusca").close(); P.detalhe(t, x); }));
  }

  P.abrirBusca = (termo = "") => {
    const d = dialogo();
    d.showModal();
    const inp = d.querySelector("#bgInput");
    if (termo) inp.value = termo;
    inp.focus(); inp.select();
    mostrar(inp.value);
    carregar();
  };

  document.addEventListener("DOMContentLoaded", () => {
    const b = document.getElementById("buscaGlobal"); if (b) b.onclick = () => P.abrirBusca();
    const a = document.getElementById("ajuda"); if (a) a.onclick = () => P.abrirGlossario();
  });
  addEventListener("keydown", (e) => {
    if (e.key !== "/" || e.ctrlKey || e.metaKey || /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement?.tagName) || document.querySelector("dialog[open]")) return;
    e.preventDefault(); P.abrirBusca();
  });
})();
