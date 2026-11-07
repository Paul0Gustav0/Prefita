/* Emendas parlamentares: "Pix" federais (Transferegov) e impositivas (portal da Prefeitura). */
(function () {
  const P = window.Prefita, { fmt } = P;

  P.registrarSecao({
    id: "emendas",
    titulo: "Emendas",
    async render(el) {
      const { pix, impositivas } = await P.json("data/emendas.json");
      const totPix = pix.reduce((s, e) => s + e.custeio + e.investimento, 0);
      const porParl = P.somarPor(pix, e => e.parlamentar, e => e.custeio + e.investimento);
      el.innerHTML = `
        <p class="muted" style="margin:0 0 14px;max-width:75ch">Dinheiro indicado por deputados e senadores para Itaberá. As "emendas Pix" (transferências especiais) caem direto na conta da Prefeitura, sem convênio; por isso vale acompanhar onde foram gastas.</p>
        ${P.kpis([
          ["Emendas Pix recebidas", fmt.compact(totPix), `${fmt.num(pix.length)} emendas desde ${pix.length ? Math.min(...pix.map(e => e.ano)) : "–"}`],
          ["Parlamentares", fmt.num(porParl.length), porParl[0] ? `maior: ${fmt.esc(porParl[0][0])}` : ""],
        ])}
        <div class="grid" style="margin-top:22px">
          <section class="panel"><div class="hd"><h2>Por parlamentar</h2><span>Emendas Pix, todos os anos</span></div><div class="hbars" data-parl></div></section>
          <section class="panel"><div class="hd"><h2>Emendas impositivas no orçamento</h2><span>Como a Prefeitura registra e gasta</span></div><div data-imp></div></section>
        </div>
        <section class="panel" style="margin-top:22px"><div class="hd"><h2>Emendas Pix</h2><span>Fonte: Transferegov</span></div><div data-tabela></div></section>`;
      const q = s => el.querySelector(s);
      P.barras(q("[data-parl]"), porParl);
      P.tabela(q("[data-imp]"), [
        { t: "Ano", k: "ano" }, { t: "Tipo", k: "tipo" },
        { t: "Recebido", k: "recebido", r: true, f: v => fmt.brl(v) },
        { t: "Empenhado", k: "empenhado", r: true, f: v => fmt.brl(v) },
        { t: "Pago", k: "pago", r: true, f: v => fmt.brl(v) },
      ], impositivas, { ordem: 0, porPagina: 10, vazio: "Nenhuma emenda impositiva registrada no portal." });
      P.tabela(q("[data-tabela]"), [
        { t: "Ano", k: "ano" },
        { t: "Parlamentar", k: "parlamentar", f: v => `<b>${fmt.esc(v)}</b>` },
        { t: "Plano de ação", k: "codigo", f: v => v ? `<a href="https://especiais.transferegov.sistema.gov.br/transferencia-especial/plano-acao/consulta" target="_blank" rel="noopener" class="mono">${fmt.esc(v)}</a>` : "–" },
        { t: "Situação", k: "situacao" },
        { t: "Custeio", k: "custeio", r: true, f: v => fmt.brl(v) },
        { t: "Investimento", k: "investimento", r: true, f: v => fmt.brl(v) },
      ], pix, { ordem: 0, vazio: "Nenhuma emenda Pix encontrada." });
    },
  });
})();
