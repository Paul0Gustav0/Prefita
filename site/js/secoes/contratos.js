/* Seção: Contratos (PNCP) */
(function () {
  "use strict";
  const P = window.Prefita, T = P.tce, { compact, num, esc, data, brl } = P.fmt;
  let ordem = "recentes", mostrar = 12, cat = "";

  P.registrarSecao({
    id: "contratos", titulo: "Contratos PNCP", proprioCabecalho: true, icone: "doc", ordem: 2, filtros: ["ano", "busca"],
    placeholder: "Buscar empresa, objeto ou número do contrato",
    async render(el) {
      const f = P.filtros;
      if (!el.innerHTML) el.innerHTML = P.ui.carregando(5);
      const todos = await T.carregarContratos();
      const b = (f.busca || "").trim().toLowerCase();
      const hoje = new Date().toISOString().slice(0, 10), em60 = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);
      const doAno = todos.filter((c) => String(c.assinatura || c.publicado || "").startsWith(f.ano) && (!b || [c.forn, c.objeto, c.num].some((x) => String(x || "").toLowerCase().includes(b))));
      const l = doAno.filter((c) => !cat || c.categoria === cat);
      const tot = l.reduce((s, c) => s + (+c.valor || 0), 0);
      const vencendo = todos.filter((c) => c.fim && c.fim >= hoje && c.fim <= em60);
      const maior = [...l].sort((a, b) => (+b.valor || 0) - (+a.valor || 0))[0];
      const cats = new Map();
      for (const c of doAno) cats.set(c.categoria || "Outros", (cats.get(c.categoria || "Outros") || 0) + (+c.valor || 0));

      const sorters = { recentes: (a, b) => String(b.assinatura || "").localeCompare(String(a.assinatura || "")), valor: (a, b) => (+b.valor || 0) - (+a.valor || 0), vencendo: (a, b) => String(a.fim || "9").localeCompare(String(b.fim || "9")) };
      let lista = [...l];
      if (ordem === "vencendo") lista = lista.filter((c) => c.fim && c.fim >= hoje);
      lista.sort(sorters[ordem]);

      el.innerHTML = `
        <div class="page-head"><div><div class="eyebrow">Portal Nacional de Contratações Públicas</div><h1>Contratos da Prefeitura</h1><p>Todo contrato assinado pela Prefeitura precisa ser publicado no PNCP. Aqui estão os de ${esc(f.ano)}, com valor, vigência e o link para o documento original.</p></div></div>
        ${+f.ano < 2023 ? `<div class="notice">${P.ico("info")}<span>O PNCP só passou a ser obrigatório em 2023, por isso há poucos ou nenhum contrato antes disso.</span></div>` : ""}
        ${P.ui.tiles([
          { label: "Contratos", value: num(l.length), note: cat ? `na categoria ${esc(cat)}` : `assinados em ${esc(f.ano)}` },
          { label: "Valor total", value: compact(tot), note: "soma do valor inicial dos contratos", title: brl(tot) },
          { label: "Vencem em 60 dias", value: num(vencendo.length), note: vencendo.length ? "de qualquer ano, ainda vigentes" : "nenhum contrato perto do fim" },
          { label: "Maior contrato", value: maior ? compact(+maior.valor || 0) : "–", note: maior ? esc(maior.forn) : "sem dados" },
        ])}
        <div class="bento">
          <section class="card span-4" style="align-self:start">
            <div class="card-hd"><div><h2>Por categoria</h2><div class="sub">Toque para filtrar a lista</div></div>${cat ? `<button class="chip" type="button" id="ctCatX"><span>${esc(cat)}</span><i>✕</i></button>` : ""}</div>
            <div class="card-bd"><div id="ctCats"></div></div>
          </section>
          <section class="card span-8">
            <div class="card-hd"><div><h2>Lista de contratos</h2><div class="sub">${num(lista.length)} contratos</div></div>
              <div class="seg" role="group" aria-label="Ordenar">${[["recentes", "Recentes"], ["valor", "Maior valor"], ["vencendo", "Vencendo"]].map(([k, t]) => `<button type="button" data-o="${k}" aria-pressed="${ordem === k}">${t}</button>`).join("")}</div></div>
            <div class="card-bd"><div class="list" id="ctLista"></div></div>
            ${lista.length > mostrar ? `<div class="card-ft"><span>Mostrando ${mostrar} de ${num(lista.length)}</span><button class="btn sm" id="ctMais" type="button">Mostrar mais</button></div>` : ""}
          </section>
        </div>`;

      P.ui.hbars(el.querySelector("#ctCats"), [...cats.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => ({ k, v })), { total: doAno.reduce((s, c) => s + (+c.valor || 0), 0), onClick: (k) => { cat = cat === k ? "" : k; mostrar = 12; P.setFiltro({}); } });
      const x = el.querySelector("#ctCatX"); if (x) x.onclick = () => { cat = ""; P.setFiltro({}); };
      el.querySelector("#ctLista").innerHTML = lista.length ? lista.slice(0, mostrar).map((c) => {
        const vence = c.fim && c.fim >= hoje && c.fim <= em60, encerrado = c.fim && c.fim < hoje;
        const link = c.ano && c.seq ? `https://pncp.gov.br/app/contratos/46634374000160/${c.ano}/${c.seq}` : "";
        return `<div class="row"><span class="t" title="${esc(c.forn)}">${esc(c.forn)}</span><span class="v">${brl(+c.valor || 0)}</span><span class="d">${esc(c.objeto || "")}</span><span class="m">${vence ? `<span class="badge warn">${P.ico("clock")}Vence em ${data(c.fim)}</span>` : encerrado ? `<span class="badge">Encerrado</span>` : c.fim ? `<span class="badge good">Vigente até ${data(c.fim)}</span>` : ""}${c.categoria ? `<span class="badge">${esc(c.categoria)}</span>` : ""}<span>Contrato ${esc(c.num || "–")} · assinado em ${data(c.assinatura)}</span>${link ? `<a href="${link}" target="_blank" rel="noopener">Ver no PNCP ${P.ico("ext")}</a>` : ""}</span></div>`;
      }).join("") : P.ui.vazio("Nenhum contrato com esses filtros.");
      el.querySelectorAll("[data-o]").forEach((b) => (b.onclick = () => { ordem = b.dataset.o; mostrar = 12; P.setFiltro({}); }));
      const m = el.querySelector("#ctMais"); if (m) m.onclick = () => { mostrar += 20; P.setFiltro({}); };
    },
  });
})();
