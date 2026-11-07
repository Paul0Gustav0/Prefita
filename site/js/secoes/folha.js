/* Folha de pagamento nome a nome (portal da Prefeitura) e despesa com pessoal x limite da LRF (SICONFI). */
(function () {
  const P = window.Prefita, { fmt } = P;

  async function carregar(mes) {
    const j = await P.json(`data/folha-${mes}.json`);
    if (!j._linhas) {
      j._linhas = j.r.map(r => ({
        nome: r[0], cargo: j.cargo[r[1]], sec: j.sec[r[2]], local: j.local[r[3]], vinc: j.vinc[r[4]],
        adm: r[5], bruto: r[6], desc: r[7], liq: r[8], resc: !!r[9],
      }));
    }
    return j._linhas;
  }

  /** Resumo da LRF: % da despesa com pessoal sobre a Receita Corrente Líquida no último quadrimestre publicado. */
  function resumoLrf(lrf) {
    const ult = [...lrf].reverse().find(p => p.linhas.length);
    if (!ult) return null;
    const achar = (re, col) => ult.linhas.find(l => re.test(l.conta) && (!col || col.test(l.coluna)));
    const dtp = achar(/DESPESA TOTAL COM PESSOAL/i, /VALOR/i) || achar(/DESPESA TOTAL COM PESSOAL/i);
    const pct = achar(/DESPESA TOTAL COM PESSOAL/i, /%/);
    const rcl = achar(/RECEITA CORRENTE L[IÍ]QUIDA AJUSTADA/i, /VALOR/i) || achar(/RECEITA CORRENTE L[IÍ]QUIDA/i);
    const lim = achar(/LIMITE M[AÁ]XIMO/i, /%/);
    const alerta = achar(/LIMITE DE ALERTA/i, /%/);
    const prud = achar(/LIMITE PRUDENCIAL/i, /%/);
    let p = pct ? +pct.valor : (dtp && rcl ? dtp.valor / rcl.valor * 100 : null);
    return { periodo: `${ult.quadrimestre}º quadrimestre de ${ult.ano}`, dtp: dtp?.valor, rcl: rcl?.valor, pct: p,
      limite: lim ? +lim.valor : 54, alerta: alerta ? +alerta.valor : 48.6, prudencial: prud ? +prud.valor : 51.3,
      mensal: lrf.flatMap(x => x.pessoal_mensal || []) };
  }

  P.registrarSecao({
    id: "folha",
    titulo: "Folha de pagamento",
    async render(el) {
      const meses = [...(await P.json("data/folha-meses.json"))].sort().reverse();
      if (!meses.length) throw new Error("sem dados");
      let lrf = null;
      try { lrf = resumoLrf(await P.json("data/lrf.json")); } catch (e) { /* opcional */ }
      const st = { mes: meses[0], cargo: "", sec: "", vinc: "", faixa: "", sit: "", ordem: "4:-1" };
      const buscaIni = P.buscaInicial("folha");

      el.innerHTML = `
        <p class="muted" style="margin:0 0 14px;max-width:75ch">Quem trabalha na Prefeitura, em que cargo e quanto recebeu no mês, como publicado pela própria Prefeitura. A remuneração de servidores é pública por lei; o CPF não é mostrado. Use os menus abaixo para ver, por exemplo, só os professores, só uma secretaria ou só quem ganha mais de R$ 12 mil.</p>
        <div class="filters">
          <label>Mês<select data-f="mes">${meses.map(m => `<option value="${m}">${fmt.mes(m)}</option>`).join("")}</select></label>
          <span class="facetas" data-facetas></span>
        </div>
        <div data-kpis style="margin-top:18px"></div>
        <div class="grid" style="margin-top:22px">
          <section class="panel"><div class="hd"><h2>Por secretaria</h2><span>Total bruto · toque para filtrar</span></div><div class="hbars" data-sec></div></section>
          <section class="panel"><div class="hd"><h2>Por tipo de vínculo</h2><span>Total bruto · toque para filtrar</span></div><div class="hbars" data-vinc></div></section>
          <section class="panel" data-lrf-box hidden><div class="hd"><h2>Limite da Lei de Responsabilidade Fiscal</h2><span data-lrf-per></span></div><div data-lrf></div></section>
          <section class="panel"><div class="hd"><h2>Cargos com mais gente</h2><span>Toque num cargo para filtrar</span></div><div class="hbars" data-cargo></div></section>
        </div>
        <section class="panel" style="margin-top:22px"><div class="hd"><h2>Servidores</h2><span class="filters-mini" data-ordem></span></div><div data-tabela></div></section>`;
      const q = s => el.querySelector(s);

      if (lrf && lrf.pct != null) {
        q("[data-lrf-box]").hidden = false;
        q("[data-lrf-per]").textContent = lrf.periodo + " · fonte: Tesouro (SICONFI)";
        const cor = lrf.pct >= lrf.prudencial ? "var(--crit)" : lrf.pct >= lrf.alerta ? "var(--warn)" : "var(--accent)";
        const w = v => Math.min(100, v / 60 * 100);
        q("[data-lrf]").innerHTML = `
          <div style="font-family:var(--display);font-size:34px;font-weight:700;color:${cor}">${fmt.pct(lrf.pct)}</div>
          <div class="muted">da receita corrente líquida vai para pessoal (12 meses${lrf.dtp ? `: ${fmt.compact(lrf.dtp)} de ${fmt.compact(lrf.rcl)}` : ""}).</div>
          <div style="position:relative;height:14px;border-radius:7px;background:var(--bar-soft);margin:14px 0 6px">
            <div style="height:100%;width:${w(lrf.pct)}%;border-radius:7px;background:${cor}"></div>
            ${[["alerta", lrf.alerta], ["prudencial", lrf.prudencial], ["máximo", lrf.limite]].map(([n, v]) =>
              `<div title="Limite ${n}: ${fmt.pct(v)}" style="position:absolute;top:-4px;bottom:-4px;left:${w(v)}%;width:2px;background:var(--ink-2)"></div>`).join("")}
          </div>
          <small class="muted">Linhas: alerta ${fmt.pct(lrf.alerta)}, prudencial ${fmt.pct(lrf.prudencial)} e máximo ${fmt.pct(lrf.limite)} (Executivo municipal).</small>`;
      }

      async function desenhar() {
        const linhas = await carregar(st.mes);
        const f = P.facetas(q("[data-facetas]"), linhas, [
          { k: "cargo", rotulo: "Cargo", todos: "Todos os cargos", valor: l => l.cargo },
          { k: "sec", rotulo: "Secretaria", todos: "Todas", valor: l => l.sec },
          { k: "vinc", rotulo: "Vínculo", todos: "Todos", valor: l => l.vinc },
          { k: "faixa", rotulo: "Salário bruto", todos: "Qualquer valor", valor: l => l.bruto, faixas: P.FAIXAS_SALARIO },
          { k: "sit", rotulo: "Situação", todos: "Todos", valor: l => l.resc ? "Saiu neste mês (rescisão)" : "Trabalhando" },
        ], st, desenhar);
        const soma = (a, k) => a.reduce((s, l) => s + l[k], 0);
        const ativos = f.filter(l => !l.resc);
        const ord = [...ativos].sort((a, b) => a.bruto - b.bruto);
        const mediana = ord.length ? ord[Math.floor(ord.length / 2)].bruto : 0;
        q("[data-kpis]").innerHTML = P.kpis([
          ["Pessoas na folha", fmt.num(ativos.length), f.length > ativos.length ? `+ ${fmt.num(f.length - ativos.length)} rescisões no mês` : fmt.mes(st.mes)],
          ["Total bruto", fmt.compact(soma(f, "bruto")), "proventos do mês, antes dos descontos"],
          ["Total líquido", fmt.compact(soma(f, "liq")), `descontos de ${fmt.compact(soma(f, "desc"))}`],
          ["Salário bruto típico", fmt.brl0(mediana), `mediana · maior: ${fmt.brl0(ord.length ? ord[ord.length - 1].bruto : 0)}`],
        ]);
        P.barras(q("[data-sec]"), P.somarPor(f, l => l.sec, l => l.bruto).slice(0, 10), { onClick: k => { st.sec = k; desenhar(); } });
        P.barras(q("[data-vinc]"), P.somarPor(f, l => l.vinc, l => l.bruto).slice(0, 10), { onClick: k => { st.vinc = k; desenhar(); } });
        P.barras(q("[data-cargo]"), P.somarPor(ativos, l => l.cargo, () => 1).slice(0, 10), { formato: v => fmt.num(v) + " pessoas", onClick: k => { st.cargo = k; desenhar(); } });
        q("[data-ordem]").innerHTML = P.ordenarPor([["4:-1", "Maior salário bruto"], ["4:1", "Menor salário bruto"], ["6:-1", "Maior salário líquido"], ["0:1", "Nome (A a Z)"], ["3:-1", "Admitidos mais recentemente"], ["3:1", "Há mais tempo na Prefeitura"]], st, desenhar);
        const [oc, od] = st.ordem.split(":").map(Number);
        P.tabela(q("[data-tabela]"), [
          { t: "Nome", k: "nome", f: (v, l) => `<b>${fmt.esc(v)}</b>${l.resc ? ' <span class="pill fim">rescisão</span>' : ""}` },
          { t: "Cargo", k: "cargo", f: (v, l) => `${fmt.esc(v)}<br><small class="muted">${fmt.esc(l.vinc)}</small>` },
          { t: "Secretaria / local", k: "sec", f: (v, l) => `${fmt.esc(v)}<br><small class="muted">${fmt.esc(l.local)}</small>` },
          { t: "Admissão", k: "adm", f: v => fmt.data(v) },
          { t: "Bruto", k: "bruto", r: true, f: v => fmt.brl(v) },
          { t: "Descontos", k: "desc", r: true, f: v => fmt.brl(v) },
          { t: "Líquido", k: "liq", r: true, f: v => fmt.brl(v) },
        ], f, { ordem: oc, dir: od, forcar: true, buscaInicial: buscaIni, busca: true, placeholder: "Buscar servidor pelo nome, cargo, secretaria ou local", unidade: "servidores", arquivo: "folha-" + st.mes });
      }

      q("[data-f=mes]").onchange = e => { st.mes = e.target.value; desenhar(); };
      await desenhar();
    },
  });
})();
