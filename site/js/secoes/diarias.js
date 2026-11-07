/* Diárias, passagens e despesas de viagem (portal da Prefeitura). */
(function () {
  const P = window.Prefita, { fmt } = P;

  P.registrarSecao({
    id: "diarias",
    titulo: "Diárias e viagens",
    async render(el) {
      const anos = [...((await P.json("data/resumo.json")).anos_portal || [])].sort((a, b) => b - a);
      if (!anos.length) throw new Error("sem dados");
      const st = { ano: anos[0], busca: "", fav: "", tipo: "" };
      el.innerHTML = `
        <p class="muted" style="margin:0 0 14px;max-width:75ch">Pagamentos de diárias, passagens, pedágios e outras despesas de locomoção, com quem recebeu e o motivo.</p>
        <div class="filters">
          <label>Ano<select data-f="ano">${anos.map(a => `<option>${a}</option>`).join("")}</select></label>
          <label>Buscar favorecido, setor ou motivo<input type="search" data-f="busca" placeholder="Ex.: São Paulo, curso"></label>
          <span data-chips></span>
        </div>
        <div data-kpis style="margin-top:18px"></div>
        <div class="grid" style="margin-top:22px">
          <section class="panel"><div class="hd"><h2>Quem mais recebeu</h2><span>Toque para filtrar</span></div><div class="hbars" data-fav></div></section>
          <section class="panel"><div class="hd"><h2>Por tipo de despesa</h2><span>Toque para filtrar</span></div><div class="hbars" data-tipo></div></section>
        </div>
        <section class="panel" style="margin-top:22px"><div class="hd"><h2>Lançamentos</h2><span>Mais recentes primeiro</span></div><div data-tabela></div></section>`;
      const q = s => el.querySelector(s);

      async function desenhar() {
        const linhas = await P.json(`data/diarias-${st.ano}.json`);
        const b = st.busca.trim();
        const f = linhas.filter(l => (!st.fav || l.fav === st.fav) && (!st.tipo || l.tipo === st.tipo) &&
          (!b || P.contem([l.fav, l.orgao, l.desc, l.cargo], b)));
        const total = f.reduce((s, l) => s + l.valor, 0);
        const porFav = P.somarPor(f, l => l.fav, l => l.valor);
        q("[data-kpis]").innerHTML = P.kpis([
          [`Total em ${st.ano}`, fmt.compact(total), `${fmt.num(f.length)} lançamentos`],
          ["Favorecidos", fmt.num(porFav.length), "pessoas e empresas diferentes"],
          ["Quem mais recebeu", porFav[0] ? fmt.compact(porFav[0][1]) : "–", porFav[0] ? fmt.esc(porFav[0][0]) : ""],
        ]);
        q("[data-chips]").innerHTML = [["fav", st.fav], ["tipo", st.tipo]].filter(c => c[1]).map(([k, v]) => `<button class="chip" type="button" data-limpa="${k}">${fmt.esc(v)} ✕</button>`).join(" ");
        q("[data-chips]").querySelectorAll("[data-limpa]").forEach(c => c.onclick = () => { st[c.dataset.limpa] = ""; desenhar(); });
        P.barras(q("[data-fav]"), porFav.slice(0, 10), { total, onClick: k => { st.fav = k; desenhar(); } });
        P.barras(q("[data-tipo]"), P.somarPor(f, l => l.tipo, l => l.valor).slice(0, 8), { total, onClick: k => { st.tipo = k; desenhar(); } });
        P.tabela(q("[data-tabela]"), [
          { t: "Data", k: "dia", f: v => fmt.data(v) },
          { t: "Favorecido", k: "fav", f: (v, l) => `<b>${fmt.esc(v)}</b>${l.cargo ? `<br><small class="muted">${fmt.esc(l.cargo)}</small>` : ""}` },
          { t: "Setor", k: "orgao" },
          { t: "Motivo", k: "desc", f: (v, l) => `<small>${fmt.esc(v)}</small><br><small class="muted">${fmt.esc(l.tipo)}</small>` },
          { t: "Valor", k: "valor", r: true, f: v => fmt.brl(v) },
        ], f);
      }
      q("[data-f=ano]").onchange = e => { st.ano = e.target.value; desenhar(); };
      let t; q("[data-f=busca]").oninput = e => { clearTimeout(t); t = setTimeout(() => { st.busca = e.target.value; desenhar(); }, 200); };
      await desenhar();
    },
  });
})();
