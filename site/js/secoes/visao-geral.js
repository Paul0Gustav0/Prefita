/* Seção: Visão geral (empenhos do TCE-SP) */
(function () {
  "use strict";
  const P = window.Prefita, T = P.tce, { compact, brl0, num, pctF: pct, esc, data } = P.fmt;
  let semPessoal = false;

  P.registrarSecao({
    id: "visao-geral", titulo: "Visão geral", proprioCabecalho: true, icone: "home", ordem: 1, filtros: true,
    async render(el) {
      const f = P.filtros;
      if (!el.querySelector(".hero")) el.innerHTML = esqueleto();
      let dados;
      try { dados = await T.ano(f.ano); } catch (e) { dados = []; }
      if (String(f.ano) !== String(P.filtros.ano)) return; // usuário trocou de ano durante o carregamento

      const rows = T.filtrar(dados, f), rowsAno = T.filtrar(dados, f, { ignorarMes: true });
      const emps = rows.filter((d) => d.ev === "E");
      const total = T.soma(rows), pago = T.soma(rows, "pg"), anulado = T.soma(rows, "an");
      const credores = new Set(emps.map((d) => d.forn)).size;
      const mesA = T.porMes(rowsAno), mesP = T.porMes(rowsAno, "pg"), mesN = T.porMes(rowsAno, "an");
      const mesQ = new Array(12).fill(0), mesC = Array.from({ length: 12 }, () => new Set());
      for (const d of rowsAno) if (d.ev === "E" && d.mes) { mesQ[d.mes - 1]++; mesC[d.mes - 1].add(d.forn); }
      const ultimoMes = Math.max(0, ...dados.filter((d) => d.mes).map((d) => d.mes));
      const periodo = f.mes ? `${P.MESES[f.mes - 1].toLowerCase()} de ${f.ano}` : ultimoMes && ultimoMes < 12 ? `${f.ano}, de janeiro a ${P.MESES[ultimoMes - 1].toLowerCase()}` : String(f.ano);

      // Comparação com o mesmo período do ano anterior
      let delta = "";
      const anoAnt = String(+f.ano - 1);
      if (P.anos.map(String).includes(anoAnt)) {
        try {
          const ant = await T.ano(anoAnt);
          const r = T.filtrar(ant, f, f.mes ? {} : { ignorarMes: true, ateMes: ultimoMes || 12 });
          const t0 = T.soma(r);
          if (t0 > 0) { const v = total / t0 - 1; delta = `<span class="delta" title="Comparado com ${f.mes ? P.MESES[f.mes - 1].toLowerCase() + " de " + anoAnt : "o mesmo período de " + anoAnt} (${compact(t0)})">${P.ico(v >= 0 ? "up" : "down")}${pct(Math.abs(v))}</span><span class="faint">vs. ${f.mes ? P.MESES_ABBR[f.mes - 1] + "/" : "mesmo período de "}${anoAnt}</span>`; }
        } catch (e) {}
      }
      if (String(f.ano) !== String(P.filtros.ano)) return;

      // Para quem foi o dinheiro
      const tipos = new Map();
      for (const d of rows) { const k = T.tipoCredor(d); tipos.set(k, (tipos.get(k) || 0) + d.vl); }
      const CORES = { "Empresas e entidades": "var(--s1)", "Pessoal e encargos": "var(--s2)", "Pessoas físicas": "var(--s3)", "Outros": "var(--ink-3)" };
      const partes = ["Empresas e entidades", "Pessoal e encargos", "Pessoas físicas", "Outros"].map((k) => ({ k, v: Math.max(0, tipos.get(k) || 0), cor: CORES[k] })).filter((p) => p.k !== "Outros" || p.v > 0);

      const [inteiro, cent] = P.fmt.brl(total).split(/(?=,\d+$)/);
      const sp = f.mes ? null : undefined; // sparkline só faz sentido com o ano inteiro
      el.innerHTML = `
        <div class="page-head"><div><div class="eyebrow">Prefeitura e Câmara de Itaberá · SP</div><h1>Para onde vai o dinheiro de Itaberá</h1><p>Cada ${P.termo("empenho", "empenho")} é um compromisso de gasto: quem vai receber, quanto e quando. Dados do Tribunal de Contas do Estado, atualizados todo dia.</p></div></div>
        <div class="hero">
          <div class="hero-main">
            <div class="eyebrow">Empenhado em ${esc(periodo)}${f.orgao ? (f.orgao === "C" ? " · Câmara" : " · Prefeitura") : ""}</div>
            <div class="hero-value num" aria-label="${esc(P.fmt.brl(total))}">${inteiro}${cent ? `<span class="cents">${cent}</span>` : ""}</div>
            <div class="hero-sub">${delta ? `<span style="display:inline-flex;gap:8px;align-items:center">${delta}</span>` : ""}<span>já descontadas as anulações</span></div>
            <div style="margin-top:auto;padding-top:14px;display:flex;flex-direction:column;gap:12px"><div class="eyebrow">Para quem foi</div>${P.ui.segbar(partes)}</div>
          </div>
          <div class="hero-side">${P.ui.tiles([
            { label: "Pago", value: compact(pago), note: total > 0 ? `${pct(Math.min(pago / total, 9.99), 0)} do empenhado, inclui restos de anos anteriores` : "pagamentos feitos no período", spark: sp ?? mesP, title: P.fmt.brl(pago) },
            { label: "Anulado", value: compact(anulado), note: `${P.termo("anulacao", "empenhos cancelados")} ou reduzidos`, spark: sp ?? mesN, title: P.fmt.brl(anulado) },
            { label: "Empenhos emitidos", value: num(emps.length), note: "notas de empenho no período", spark: sp ?? mesQ },
            { label: "Credores", value: num(credores), note: "fornecedores, servidores e entidades", spark: sp ?? mesC.map((s) => s.size) },
          ])}</div>
        </div>
        <div class="bento">
          <section class="card span-8">
            <div class="card-hd"><div><h2>Empenhado e pago por mês</h2><div class="sub">${f.mes ? "Toque no mês de novo para ver o ano todo" : "Toque num mês para filtrar o painel"}</div></div>
              <div class="legend"><span><i></i>Empenhado</span><span><i class="line"></i>Pago</span></div></div>
            <div class="card-bd"><div id="vgMes"></div></div>
          </section>
          <section class="card span-4">
            <div class="card-hd"><div><h2>Quem mais recebeu</h2><div class="sub">Toque num nome para filtrar</div></div>
              <div class="seg" role="group" aria-label="Incluir folha de pagamento"><button type="button" data-p="0" aria-pressed="${!semPessoal}">Todos</button><button type="button" data-p="1" aria-pressed="${semPessoal}">Sem folha</button></div></div>
            <div class="card-bd"><div id="vgTop"></div></div>
          </section>
          <section class="card span-7">
            <div class="card-hd"><div><h2>Pontos para olhar de perto</h2><div class="sub">Sinais automáticos para orientar a consulta, não são acusações</div></div></div>
            <div class="card-bd"><div class="alerts" id="vgAlertas"></div></div>
          </section>
          <section class="card span-5">
            <div class="card-hd"><div><h2>Contratos recentes</h2><div class="sub">Publicados pela Prefeitura no PNCP</div></div><a class="btn sm" href="#/contratos">Ver todos</a></div>
            <div class="card-bd"><div class="list" id="vgCt"></div></div>
          </section>
        </div>`;

      P.ui.colunas(el.querySelector("#vgMes"), {
        rotulos: P.MES_ABBR, rotulosLongos: P.MESES.map((m) => `${m} de ${f.ano}`), a: mesA, b: mesP, nomeA: "Empenhado", nomeB: "Pago",
        altura: innerWidth < 600 ? 220 : 350, sel: f.mes ? f.mes - 1 : -1, aria: `Empenhado e pago por mês em ${f.ano}`,
        onClick: (i) => P.setFiltro({ mes: f.mes == i + 1 ? "" : String(i + 1) }),
      });

      const top = T.porChave(rows.filter((d) => !semPessoal || T.tipoCredor(d) !== "Pessoal e encargos"), "forn").filter(([, v]) => v > 0).slice(0, 8).map(([k, v]) => ({ k, v }));
      P.ui.hbars(el.querySelector("#vgTop"), top, { total, onClick: (k) => { P.setFiltro({ forn: k }); } });
      el.querySelectorAll(".seg [data-p]").forEach((b) => (b.onclick = () => { semPessoal = b.dataset.p === "1"; P.setFiltro({}); }));

      const al = T.sinais(emps, total).slice(0, 5), ae = el.querySelector("#vgAlertas");
      ae.innerHTML = al.length ? al.map((a, i) => `<div class="alert ${a.lvl}"><span class="ic">${P.ico("alert")}</span><span class="lbl">${esc(a.tag)}</span><p>${a.txt}</p><small>${a.why}</small><div class="act"><button class="btn sm" type="button" data-i="${i}">Ver empenhos ${P.ico("right")}</button></div></div>`).join("") : P.ui.vazio("Nenhum sinal automático com esses filtros.");
      ae.querySelectorAll("[data-i]").forEach((b) => (b.onclick = () => { P.filtros.forn = al[+b.dataset.i].forn; P.irPara("empenhos"); }));

      const cts = (await T.carregarContratos()).filter((c) => String(c.assinatura || c.publicado || "").startsWith(f.ano)).sort((a, b) => String(b.publicado || "").localeCompare(String(a.publicado || ""))).slice(0, 5);
      el.querySelector("#vgCt").innerHTML = cts.length ? cts.map(linhaContrato).join("") : P.ui.vazio(`Nenhum contrato de ${f.ano} no PNCP.`);
    },
  });

  function linhaContrato(c) {
    const link = c.ano && c.seq ? `https://pncp.gov.br/app/contratos/46634374000160/${c.ano}/${c.seq}` : "";
    return `<div class="row"><span class="t" title="${esc(c.forn)}">${esc(c.forn)}</span><span class="v">${compact(+c.valor || 0)}</span><span class="d">${esc(c.objeto || "")}</span><span class="m">${c.categoria ? `<span class="badge">${esc(c.categoria)}</span>` : ""}<span>Assinado em ${data(c.assinatura)}</span>${link ? `<a href="${link}" target="_blank" rel="noopener">PNCP ${P.ico("ext")}</a>` : ""}</span></div>`;
  }
  P.tce.linhaContrato = linhaContrato;

  function esqueleto() {
    return `<div class="hero"><div class="hero-main">${P.ui.carregando(4)}</div><div class="hero-side"><div class="tiles">${'<div class="tile">' + P.ui.carregando(2) + "</div>"}${'<div class="tile">' + P.ui.carregando(2) + "</div>"}</div></div></div><div class="bento"><div class="card span-8"><div class="card-bd"><div class="skel" style="height:260px"></div></div></div><div class="card span-4"><div class="card-bd">${P.ui.carregando(5)}</div></div></div>`;
  }
})();
