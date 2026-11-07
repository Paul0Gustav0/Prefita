/* Gastos do dia: empenhos do portal da Prefeitura (Fiorilli), atualizados todo dia,
   e os pagamentos detectados entre uma coleta e a seguinte. */
(function () {
  const P = window.Prefita, { fmt } = P;

  async function anosDisponiveis() {
    const r = await P.json("data/resumo.json");
    return [...(r.anos_portal || [])].sort((a, b) => b - a);
  }

  async function carregar(ano) {
    const j = await P.json(`data/despesas-${ano}.json`);
    if (!j._linhas) {
      j._linhas = j.r.map(r => ({
        id: r[0], num: r[1], dia: r[2], forn: j.forn[r[3]], doc: j.doc[r[4]], sec: j.sec[r[5]],
        area: j.area[r[6]], nat: j.nat[r[7]], mod: j.mod[r[8]], desc: r[9], emp: r[10], liq: r[11], pago: r[12],
      }));
    }
    return j._linhas;
  }

  P.registrarSecao({
    id: "gastos-do-dia",
    titulo: "Gastos do dia",
    async render(el) {
      const anos = await anosDisponiveis();
      if (!anos.length) throw new Error("sem dados");
      let pagamentos = [];
      try { pagamentos = await P.json("data/pagamentos-recentes.json"); } catch (e) { /* ainda não existe */ }
      const st = { ano: anos[0], dia: "", busca: "", area: "", sec: "" };

      el.innerHTML = `
        <p class="muted" style="margin:0 0 14px;max-width:75ch">Empenhos lançados pela Prefeitura no seu portal de transparência, que é atualizado no mesmo dia (o TCE leva semanas). Empenho é a reserva do dinheiro para uma despesa; depois ela é liquidada (entregue) e paga.</p>
        <div class="filters">
          <label>Ano<select data-f="ano">${anos.map(a => `<option>${a}</option>`).join("")}</select></label>
          <label>Dia<input type="date" data-f="dia"></label>
          <label>Buscar fornecedor, empenho ou descrição<input type="search" data-f="busca" placeholder="Ex.: combustível, 1021"></label>
          <span data-chips></span>
        </div>
        <div data-kpis style="margin-top:18px"></div>
        <div class="grid" style="margin-top:22px">
          <section class="panel"><div class="hd"><h2>Pagamentos detectados</h2><span>O que mudou de "pago" entre uma coleta e a seguinte</span></div><div data-pagtos></div></section>
          <section class="panel"><div class="hd"><h2>Por área</h2><span>Toque para filtrar</span></div><div class="hbars" data-area></div></section>
          <section class="panel"><div class="hd"><h2>Por secretaria ou setor</h2><span>Toque para filtrar</span></div><div class="hbars" data-sec></div></section>
          <section class="panel"><div class="hd"><h2>Maiores fornecedores</h2><span>Empenhado no período</span></div><div class="hbars" data-forn></div></section>
        </div>
        <section class="panel" style="margin-top:22px"><div class="hd"><h2>Empenhos</h2><span data-titulo></span></div><div data-tabela></div></section>`;
      const q = s => el.querySelector(s);

      async function desenhar() {
        const linhas = await carregar(st.ano);
        const b = st.busca.trim().toLowerCase();
        const f = linhas.filter(l => (!st.dia || l.dia === st.dia) && (!st.area || l.area === st.area) && (!st.sec || l.sec === st.sec) &&
          (!b || l.forn.toLowerCase().includes(b) || l.num.toLowerCase().includes(b) || l.desc.toLowerCase().includes(b)));
        const ultimoDia = linhas.reduce((m, l) => l.dia > m ? l.dia : m, "");
        const doDia = linhas.filter(l => l.dia === ultimoDia);
        const somaEmp = a => a.reduce((s, l) => s + l.emp, 0), somaPago = a => a.reduce((s, l) => s + l.pago, 0);
        const lim7 = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
        const pg7 = pagamentos.filter(p => p.dia >= lim7).reduce((s, p) => s + p.valor, 0);
        q("[data-kpis]").innerHTML = P.kpis([
          ["Último dia com empenhos", fmt.compact(somaEmp(doDia)), `${fmt.data(ultimoDia)} · ${fmt.num(doDia.length)} empenhos`],
          ["Pago nos últimos 7 dias", pagamentos.length ? fmt.compact(pg7) : "–", pagamentos.length ? "detectado pela coleta diária" : "aparece a partir da 2ª coleta"],
          [st.dia || st.area || st.sec || b ? "Empenhado (filtro)" : `Empenhado em ${st.ano}`, fmt.compact(somaEmp(f)), "já descontadas as anulações"],
          [st.dia || st.area || st.sec || b ? "Pago (filtro)" : `Pago em ${st.ano}`, fmt.compact(somaPago(f)), `${fmt.num(new Set(f.map(l => l.forn)).size)} fornecedores e credores`],
        ]);
        const chips = [["area", st.area], ["sec", st.sec], ["dia", st.dia && fmt.data(st.dia)]].filter(c => c[1]);
        q("[data-chips]").innerHTML = chips.map(([k, v]) => `<button class="chip" type="button" data-limpa="${k}">${fmt.esc(v)} ✕</button>`).join(" ");
        q("[data-chips]").querySelectorAll("[data-limpa]").forEach(c => c.onclick = () => { st[c.dataset.limpa] = ""; if (c.dataset.limpa === "dia") q("[data-f=dia]").value = ""; desenhar(); });

        const pg = pagamentos.filter(p => +p.ano === +st.ano || !st.ano).slice(0, 12);
        q("[data-pagtos]").innerHTML = pg.length ? `<div class="contratos">${pg.map(p => `<div class="ct"><div class="obj"><b>${fmt.esc(p.forn)}</b><br><span class="muted">${fmt.esc(p.desc)}</span></div><div class="val">${fmt.brl(p.valor)}</div><div class="meta"><span>${fmt.data(p.dia)}</span><span>Empenho ${fmt.esc(p.num)}</span><span>${fmt.esc(p.sec)}</span></div></div>`).join("")}</div>`
          : `<div class="empty">A coleta compara o valor pago de cada empenho com o do dia anterior. Os primeiros pagamentos aparecem depois da segunda coleta diária.</div>`;

        P.barras(q("[data-area]"), P.somarPor(f, l => l.area, l => l.emp).filter(i => i[1] > 0).slice(0, 10), { onClick: k => { st.area = k; desenhar(); } });
        P.barras(q("[data-sec]"), P.somarPor(f, l => l.sec, l => l.emp).filter(i => i[1] > 0).slice(0, 10), { onClick: k => { st.sec = k; desenhar(); } });
        P.barras(q("[data-forn]"), P.somarPor(f, l => l.forn, l => l.emp).filter(i => i[1] > 0).slice(0, 10), { onClick: k => { st.busca = k; q("[data-f=busca]").value = k; desenhar(); } });

        q("[data-titulo]").textContent = st.dia ? `Emitidos em ${fmt.data(st.dia)}` : "Mais recentes primeiro";
        P.tabela(q("[data-tabela]"), [
          { t: "Data", k: "dia", f: v => fmt.data(v) },
          { t: "Empenho", k: "num", mono: true },
          { t: "Fornecedor ou credor", k: "forn", f: (v, l) => `<b>${fmt.esc(v)}</b><br><small class="muted">${fmt.esc(l.doc)}</small>` },
          { t: "Secretaria / área", k: "sec", f: (v, l) => `${fmt.esc(v)}<br><small class="muted">${fmt.esc(l.area)}</small>` },
          { t: "Descrição", k: "desc", f: (v, l) => `<small>${fmt.esc(v)}</small><br><small class="muted">${fmt.esc(l.nat)} · ${fmt.esc(l.mod)}</small>` },
          { t: "Empenhado", k: "emp", r: true, f: v => fmt.brl(v) },
          { t: "Pago", k: "pago", r: true, f: (v, l) => v >= l.emp - 0.01 && l.emp > 0 ? `<span class="pill">${fmt.brl(v)}</span>` : fmt.brl(v) },
        ], f);
      }

      q("[data-f=ano]").onchange = e => { st.ano = e.target.value; st.dia = ""; q("[data-f=dia]").value = ""; desenhar(); };
      q("[data-f=dia]").onchange = e => { st.dia = e.target.value; if (st.dia) { st.ano = st.dia.slice(0, 4); q("[data-f=ano]").value = st.ano; } desenhar(); };
      let t; q("[data-f=busca]").oninput = e => { clearTimeout(t); t = setTimeout(() => { st.busca = e.target.value; desenhar(); }, 200); };
      await desenhar();
    },
  });
})();
