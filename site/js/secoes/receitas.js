/* Receitas: de onde vem o dinheiro (portal da Prefeitura), previsto x arrecadado. */
(function () {
  const P = window.Prefita, { fmt } = P;
  const sig = c => String(c || "").replace(/\D/g, "").replace(/0+$/, "");

  /** Folhas da árvore de códigos: itens que não têm nenhum detalhamento abaixo deles. */
  function folhas(lista) {
    const s = lista.map(i => sig(i.cod));
    return lista.filter((i, k) => s[k] && !s.some((o, j) => j !== k && o.length > s[k].length && o.startsWith(s[k])));
  }

  function barrasPrevisto(el, itens) {
    if (!itens.length) { el.innerHTML = `<div class="empty">Sem dados.</div>`; return; }
    const max = Math.max(...itens.map(i => Math.max(i.previsto, i.arrecadado)), 1);
    el.innerHTML = itens.map(i => `<div class="hbar" style="cursor:default">
      <span class="n" title="${fmt.esc(i.nome)}">${fmt.esc(i.nome)}</span>
      <span class="a">${fmt.compact(i.arrecadado)} <span class="muted" style="font-weight:400">de ${fmt.compact(i.previsto)}</span></span>
      <span class="track" style="position:relative"><span class="fill" style="width:${Math.max(1, i.arrecadado / max * 100)}%;display:block"></span>
      <span style="position:absolute;top:0;bottom:0;left:${i.previsto / max * 100}%;width:2px;background:var(--ink-2)" title="Previsto"></span></span></div>`).join("");
  }

  P.registrarSecao({
    id: "receitas",
    titulo: "Receitas",
    async render(el) {
      const anos = [...((await P.json("data/resumo.json")).anos_portal || [])].sort((a, b) => b - a);
      if (!anos.length) throw new Error("sem dados");
      const st = { ano: anos[0] };
      el.innerHTML = `
        <p class="muted" style="margin:0 0 14px;max-width:75ch">De onde vem o dinheiro da Prefeitura: impostos cobrados pela cidade e repasses da União e do Estado. A linha vertical em cada barra marca o valor previsto no orçamento para o ano.</p>
        <div class="filters"><label>Ano<select data-f="ano">${anos.map(a => `<option>${a}</option>`).join("")}</select></label></div>
        <div data-kpis style="margin-top:18px"></div>
        <div class="grid" style="margin-top:22px">
          <section class="panel"><div class="hd"><h2>Principais fontes</h2><span>Arrecadado x previsto</span></div><div class="hbars" data-cat></div></section>
          <section class="panel"><div class="hd"><h2>Repasses da União</h2><span>FPM, SUS, FUNDEB, salário-educação…</span></div><div class="hbars" data-uniao></div></section>
          <section class="panel"><div class="hd"><h2>Repasses do Estado</h2><span>ICMS, IPVA, convênios…</span></div><div class="hbars" data-estado></div></section>
          <section class="panel"><div class="hd"><h2>Impostos da cidade</h2><span>IPTU, ISS, ITBI, taxas</span></div><div class="hbars" data-proprios></div></section>
        </div>
        <section class="panel" style="margin-top:22px"><div class="hd"><h2>Todas as receitas</h2><span>Detalhamento do orçamento</span></div><div data-tabela></div></section>`;
      const q = s => el.querySelector(s);

      async function desenhar() {
        const r = await P.json(`data/receitas-${st.ano}.json`);
        const orc = r.orcamentaria;
        const achar = re => orc.find(i => re.test(sig(i.cod)) && sig(i.cod).length <= 2);
        const corr = orc.find(i => sig(i.cod) === "1") || { previsto: 0, arrecadado: 0 };
        const cap = orc.find(i => sig(i.cod) === "2") || { previsto: 0, arrecadado: 0 };
        const total = { previsto: corr.previsto + cap.previsto, arrecadado: corr.arrecadado + cap.arrecadado };
        const transf = (r.uniao[0]?.arrecadado || 0) + (r.estado[0]?.arrecadado || 0);
        const proprios = achar(/^11$/) || { arrecadado: 0, previsto: 0 };
        q("[data-kpis]").innerHTML = P.kpis([
          [`Arrecadado em ${st.ano}`, fmt.compact(total.arrecadado), `${total.previsto ? fmt.pct(total.arrecadado / total.previsto * 100) : "–"} dos ${fmt.compact(total.previsto)} previstos`],
          ["Repasses da União e do Estado", fmt.compact(transf), total.arrecadado ? `${fmt.pct(transf / total.arrecadado * 100)} de tudo o que entrou` : ""],
          ["Impostos e taxas da cidade", fmt.compact(proprios.arrecadado), total.arrecadado ? `${fmt.pct(proprios.arrecadado / total.arrecadado * 100)} do total` : ""],
        ]);
        const nivel2 = orc.filter(i => sig(i.cod).length === 2 && i.previsto + i.arrecadado > 0).sort((a, b) => b.arrecadado - a.arrecadado);
        barrasPrevisto(q("[data-cat]"), nivel2.slice(0, 8));
        const top = l => folhas(l).filter(i => i.arrecadado > 0 || i.previsto > 0).sort((a, b) => b.arrecadado - a.arrecadado).slice(0, 10);
        barrasPrevisto(q("[data-uniao]"), top(r.uniao));
        barrasPrevisto(q("[data-estado]"), top(r.estado));
        barrasPrevisto(q("[data-proprios]"), top(orc.filter(i => sig(i.cod).startsWith("11") || sig(i.cod).startsWith("12"))));
        P.tabela(q("[data-tabela]"), [
          { t: "Código", k: "cod", mono: true },
          { t: "Receita", k: "nome", f: (v, i) => `<span style="padding-left:${Math.max(0, sig(i.cod).length - 1) * 10}px;${sig(i.cod).length <= 2 ? "font-weight:600" : ""}">${fmt.esc(v)}</span>` },
          { t: "Previsto", k: "previsto", r: true, f: v => fmt.brl(v) },
          { t: "Arrecadado", k: "arrecadado", r: true, f: v => fmt.brl(v) },
          { t: "%", k: i => i.previsto ? i.arrecadado / i.previsto * 100 : 0, r: true, f: v => v ? fmt.pct(v) : "–" },
        ], orc.filter(i => i.previsto || i.arrecadado), { ordem: 0, dir: 1, porPagina: 40 });
      }
      q("[data-f=ano]").onchange = e => { st.ano = e.target.value; desenhar(); };
      await desenhar();
    },
  });
})();
