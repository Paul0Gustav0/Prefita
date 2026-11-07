/* Licitações e contratos com saldo (portal da Prefeitura). */
(function () {
  const P = window.Prefita, { fmt } = P;

  P.registrarSecao({
    id: "licitacoes",
    titulo: "Licitações e contratos",
    async render(el) {
      const anos = [...((await P.json("data/resumo.json")).anos_portal || [])].sort((a, b) => b - a);
      if (!anos.length) throw new Error("sem dados");
      const st = { ano: anos[0], busca: "", mod: "" };
      el.innerHTML = `
        <p class="muted" style="margin:0 0 14px;max-width:75ch">Processos de compra abertos pela Prefeitura e os contratos assinados, com quanto de cada contrato já foi empenhado e quanto ainda pode ser gasto.</p>
        <div class="filters">
          <label>Ano<select data-f="ano">${anos.map(a => `<option>${a}</option>`).join("")}</select></label>
          <label>Buscar fornecedor, objeto ou processo<input type="search" data-f="busca" placeholder="Ex.: merenda, pavimentação"></label>
          <span data-chips></span>
        </div>
        <div data-kpis style="margin-top:18px"></div>
        <div class="grid" style="margin-top:22px">
          <section class="panel"><div class="hd"><h2>Contratos por modalidade</h2><span>Valor contratado · toque para filtrar</span></div><div class="hbars" data-mod></div></section>
          <section class="panel"><div class="hd"><h2>Maiores contratados</h2><span>Valor contratado no ano</span></div><div class="hbars" data-forn></div></section>
        </div>
        <section class="panel" style="margin-top:22px"><div class="hd"><h2>Contratos</h2><span>Mais recentes primeiro</span></div><div data-ct></div></section>
        <section class="panel" style="margin-top:22px"><div class="hd"><h2>Licitações e compras diretas</h2><span>Processos abertos no ano</span></div><div data-lic></div></section>`;
      const q = s => el.querySelector(s);
      const hoje = new Date().toISOString().slice(0, 10), em60 = new Date(Date.now() + 60 * 864e5).toISOString().slice(0, 10);

      async function desenhar() {
        const [cts, lics] = await Promise.all([P.json(`data/contratos-${st.ano}.json`), P.json(`data/licitacoes-${st.ano}.json`)]);
        const b = st.busca.trim();
        const tem = (...xs) => !b || P.contem(xs.map(x => x || ""), b);
        const fc = cts.filter(c => !c.anulado && (!st.mod || c.mod === st.mod) && tem(c.forn, c.objeto, c.num, c.proc));
        const fl = lics.filter(l => (!st.mod || l.mod === st.mod) && tem(l.objeto, l.proc));
        const total = fc.reduce((s, c) => s + c.valor + c.aditado, 0);
        const diretas = fc.filter(c => /dispensa|inexig/i.test(c.mod)).reduce((s, c) => s + c.valor + c.aditado, 0);
        const vencendo = fc.filter(c => c.fim >= hoje && c.fim <= em60).length;
        q("[data-kpis]").innerHTML = P.kpis([
          [`Contratado em ${st.ano}`, fmt.compact(total), `${fmt.num(fc.length)} contratos, aditivos incluídos`],
          ["Sem licitação", total ? fmt.pct(diretas / total * 100) : "–", `dispensa e inexigibilidade: ${fmt.compact(diretas)}`],
          ["Vencem em 60 dias", fmt.num(vencendo), "contratos que vão precisar de renovação ou nova compra"],
          ["Processos abertos", fmt.num(fl.length), `${fmt.num(fl.filter(l => /andamento/i.test(l.situacao)).length)} em andamento`],
        ]);
        q("[data-chips]").innerHTML = st.mod ? `<button class="chip" type="button" data-limpa>${fmt.esc(st.mod)} ✕</button>` : "";
        if (st.mod) q("[data-limpa]").onclick = () => { st.mod = ""; desenhar(); };
        P.barras(q("[data-mod]"), P.somarPor(fc, c => c.mod, c => c.valor + c.aditado), { total, onClick: k => { st.mod = k; desenhar(); } });
        P.barras(q("[data-forn]"), P.somarPor(fc, c => c.forn, c => c.valor + c.aditado).slice(0, 10), { total, onClick: k => { st.busca = k; q("[data-f=busca]").value = k; desenhar(); } });
        P.tabela(q("[data-ct]"), [
          { t: "Assinatura", k: "assinatura", f: v => fmt.data(v) },
          { t: "Contrato", k: "num", f: (v, c) => `<span class="mono">${fmt.esc(v)}</span><br><small class="muted">${fmt.esc(c.mod)}</small>` },
          { t: "Fornecedor e objeto", k: "forn", f: (v, c) => `<b>${fmt.esc(v)}</b> <small class="muted">${fmt.esc(c.doc)}</small><br><small>${fmt.esc(c.objeto)}</small>` },
          { t: "Vigência até", k: "fim", f: v => v && v >= hoje && v <= em60 ? `<span class="pill fim">${fmt.data(v)}</span>` : fmt.data(v) },
          { t: "Valor", k: c => c.valor + c.aditado, r: true, f: (v, c) => fmt.brl(v) + (c.aditado ? `<br><small class="muted">aditivos ${fmt.brl(c.aditado)}</small>` : "") },
          { t: "Empenhado", k: "empenhado", r: true, f: (v, c) => fmt.brl(v) + `<br><small class="muted">${c.valor + c.aditado ? fmt.pct(v / (c.valor + c.aditado) * 100) : "–"} do contrato</small>` },
        ], fc, { porPagina: 15 });
        P.tabela(q("[data-lic]"), [
          { t: "Abertura", k: "abertura", f: v => fmt.data(v) },
          { t: "Processo", k: "proc", f: (v, l) => `<span class="mono">${fmt.esc(v)}</span><br><small class="muted">${fmt.esc(l.mod)}${l.srp ? " · registro de preços" : ""}</small>` },
          { t: "Objeto", k: "objeto", f: v => `<small>${fmt.esc(v)}</small>` },
          { t: "Situação", k: "situacao" },
          { t: "Valor estimado", k: "valor", r: true, f: v => v ? fmt.brl(v) : "–" },
        ], fl, { porPagina: 15 });
      }
      q("[data-f=ano]").onchange = e => { st.ano = e.target.value; desenhar(); };
      let t; q("[data-f=busca]").oninput = e => { clearTimeout(t); t = setTimeout(() => { st.busca = e.target.value; desenhar(); }, 200); };
      await desenhar();
    },
  });
})();
