/* Seção: Todos os empenhos (TCE-SP) */
(function () {
  "use strict";
  const P = window.Prefita, T = P.tce, { brl, num, esc, compact } = P.fmt;
  let ultimaChave = "";

  P.registrarSecao({
    id: "empenhos", titulo: "Empenhos TCE", proprioCabecalho: true, icone: "list", ordem: 3, filtros: true,
    async render(el) {
      const f = P.filtros;
      if (!el.querySelector(".card")) el.innerHTML = P.ui.carregando(6);
      let dados;
      try { dados = await T.ano(f.ano); } catch (e) { dados = []; }
      if (String(f.ano) !== String(P.filtros.ano)) return;
      const emps = T.filtrar(dados, f).filter((d) => d.ev === "E");
      const total = emps.reduce((s, d) => s + d.liq, 0), pago = emps.reduce((s, d) => s + d.pago, 0);
      const quitados = emps.filter((d) => d.liq > 0 && d.pago >= d.liq - 0.01).length;
      el.innerHTML = `
        <div class="page-head"><div><div class="eyebrow">Tribunal de Contas do Estado de São Paulo</div><h1>Todos os empenhos</h1><p>Cada linha é uma nota de empenho, com o valor final (já com reforços e anulações) e quanto já foi pago dela. Toque no cabeçalho para ordenar.</p></div></div>
        ${P.ui.tiles([
          { label: "Empenhos", value: num(emps.length), note: f.mes ? `${P.MESES[f.mes - 1].toLowerCase()} de ${f.ano}` : `emitidos em ${f.ano}` },
          { label: "Valor final", value: compact(total), note: "soma dos empenhos listados", title: brl(total) },
          { label: "Já pago", value: compact(pago), note: total > 0 ? `${P.fmt.pctF(pago / total, 0)} do valor desses empenhos` : "–", title: brl(pago) },
          { label: "Quitados", value: num(quitados), note: emps.length ? `${P.fmt.pctF(quitados / emps.length, 0)} dos empenhos foram pagos por inteiro` : "–" },
        ])}
        <section class="card"><div class="card-hd"><div><h2>Notas de empenho</h2><div class="sub">${f.forn ? `Só de ${esc(f.forn)}` : "Prefeitura e Câmara"}</div></div></div><div class="card-bd" id="tbl"></div></section>`;
      const chave = JSON.stringify(f);
      P.ui.tabela(el.querySelector("#tbl"), emps, [
        { k: "dt", t: "Data", html: (d) => `<span class="num">${d.dt ? d.dt.toLocaleDateString("pt-BR") : "–"}</span>`, val: (d) => d.dt || 0 },
        { k: "nr", t: "Empenho", cls: "mono" },
        { k: "forn", t: "Credor", html: (d) => `<span class="cell-name" title="${esc(d.forn)}">${esc(d.forn)}</span><span class="cell-sub">${esc(T.tipoCredor(d))}</span>` },
        { k: "orgao", t: "Órgão", html: (d) => (d.orgao === "C" ? "Câmara" : "Prefeitura") },
        { k: "liq", t: "Empenhado", r: true, html: (d) => brl(d.liq) },
        { k: "pago", t: "Pago", r: true, html: (d) => (d.liq > 0 && d.pago >= d.liq - 0.01 ? `<span class="badge good">${brl(d.pago)}</span>` : brl(d.pago)) },
      ], { ordem: { k: "dt", dir: -1 }, unidade: "empenhos", vazio: "Nenhum empenho com esses filtros.", resetar: chave !== ultimaChave });
      ultimaChave = chave;
    },
  });
})();
