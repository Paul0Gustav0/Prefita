/* Sócios dos fornecedores (quadro societário publicado pela Receita Federal) e sinais sobre as empresas. */
(function () {
  const P = window.Prefita, { fmt } = P;
  const cnpjFmt = (c) => String(c).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  const SINAIS = {
    aberta_recente: { r: "Aberta pouco antes", cls: "warn", txt: (s) => `Empresa aberta ${s.dias} dias antes do primeiro empenho.` },
    situacao: { r: "Situação irregular", cls: "crit", txt: (s) => `Situação na Receita: ${s.v}.` },
    mesmo_endereco: { r: "Endereço repetido", cls: "warn", txt: (s) => `Mesmo endereço de outro${s.com.length > 1 ? "s" : ""} ${s.com.length} fornecedor${s.com.length > 1 ? "es" : ""}.` },
    mesmo_telefone: { r: "Telefone repetido", cls: "warn", txt: (s) => `Mesmo telefone de outro${s.com.length > 1 ? "s" : ""} ${s.com.length} fornecedor${s.com.length > 1 ? "es" : ""}.` },
    socio_em_comum: { r: "Sócio em comum", cls: "info", txt: (s) => `${s.nome} também é sócio de outro${s.com.length > 1 ? "s" : ""} ${s.com.length} fornecedor${s.com.length > 1 ? "es" : ""}.` },
  };

  P.registrarSecao({
    id: "socios",
    titulo: "Sócios dos fornecedores",
    tituloCurto: "Sócios",
    icone: "network",
    ordem: 2.55,
    fonte: "Receita Federal (dados abertos do CNPJ)",
    descricao: "Quem são os donos das empresas que recebem da Prefeitura, e sinais que merecem uma olhada: empresa aberta pouco antes de vender, endereço ou telefone repetido entre fornecedores, sócio em comum.",
    async render(el) {
      const d = await P.json("data/socios.json");
      const empresas = d.empresas || [];
      if (!empresas.length) throw new Error("sem dados");
      const porCnpj = new Map(empresas.map((e) => [e.cnpj, e]));
      const st = { busca: P.buscaInicial("socios"), sinal: "", cidade: "", porte: "" };
      el.innerHTML = `
        <div class="notice" style="margin-bottom:14px">${P.ico("info")}<span>Os sinais são calculados automaticamente e não indicam irregularidade por si só. Endereço repetido, por exemplo, pode ser um escritório de contabilidade. Sempre confira na Receita e nos contratos.</span></div>
        <div class="filters">
          <label style="flex:1;min-width:200px">Buscar empresa, sócio, CNPJ ou cidade<input type="search" data-f="busca" placeholder="Ex.: Itaberá, nome do sócio"></label>
          <label>Sinal<select data-f="sinal"><option value="">Todos os fornecedores</option><option value="*">Só com algum sinal</option>${Object.entries(SINAIS).map(([k, v]) => `<option value="${k}">${v.r}</option>`).join("")}</select></label>
          <span class="facetas" data-facetas></span>
        </div>
        <div data-kpis style="margin-top:18px"></div>
        <section class="panel" style="margin-top:22px"><div class="hd"><h2>Fornecedores com CNPJ</h2><span>Ordenado pelo valor empenhado</span></div><div data-tabela></div></section>
        <p class="muted" style="font-size:13px;margin-top:14px">Cadastro de ${fmt.num(empresas.length)} de ${fmt.num(d.total_cnpj || empresas.length)} fornecedores com CNPJ, consultado em ${fmt.data(d.gerado)}. Valores somam o empenhado no portal da Prefeitura (2024 em diante) e no TCE-SP (anos anteriores).</p>`;
      const q = (s) => el.querySelector(s);

      function desenhar() {
        const b = st.busca.trim();
        const f = P.facetas(q("[data-facetas]"), empresas.filter((e) =>
          (!st.sinal || (st.sinal === "*" ? e.sinais.length : e.sinais.some((s) => s.t === st.sinal))) &&
          (!b || P.contem([e.nome, e.fantasia, e.cnpj, cnpjFmt(e.cnpj), e.cidade, e.cnae, ...e.socios.map((s) => s[0])].map((x) => x || ""), b))), [
          { k: "cidade", rotulo: "Cidade", todos: "Todas", valor: (e) => e.cidade },
          { k: "porte", rotulo: "Tipo de empresa", todos: "Todos", valor: (e) => e.mei ? "MEI" : /individual/i.test(e.natureza || "") ? "Empresário individual" : "Sociedade (tem sócios)" },
        ], st, desenhar);
        const comSinal = empresas.filter((e) => e.sinais.length).length;
        const itabera = empresas.filter((e) => /^Itabera/i.test(e.cidade)).length;
        q("[data-kpis]").innerHTML = P.kpis([
          ["Fornecedores com cadastro", fmt.num(empresas.length), `${fmt.num(f.length)} na seleção`],
          ["Com algum sinal", fmt.num(comSinal), "para conferir"],
          ["Sediados em Itaberá", fmt.num(itabera), "pelo endereço na Receita"],
        ]);
        P.tabela(q("[data-tabela]"), [
          { t: "Empresa", k: "nome", f: (v, e) => `<b>${fmt.esc(v)}</b><br><small class="muted mono">${cnpjFmt(e.cnpj)}</small> <small class="muted">· ${fmt.esc(e.cidade)}${e.mei ? " · MEI" : ""}</small><br><small class="muted">${fmt.esc(e.cnae)}</small>` },
          { t: "Abertura", k: "abertura", f: (v) => fmt.data(v) },
          { t: "Sócios", k: (e) => e.socios.length, f: (v, e) => e.socios.length ? e.socios.map((s) => `${fmt.esc(s[0])}<br><small class="muted">${fmt.esc(s[1])}${s[2] ? ` desde ${fmt.data(s[2])}` : ""}</small>`).join("<br>") : `<small class="muted">${e.mei || /individual/i.test(e.natureza) ? "Empresário individual (dono no nome da empresa)" : "Não informado"}</small>` },
          { t: "Sinais", k: (e) => e.sinais.length, f: (v, e) => e.sinais.map((s) => {
              const def = SINAIS[s.t]; if (!def) return "";
              const outros = (s.com || []).map((c) => porCnpj.get(c)?.nome || cnpjFmt(c)).slice(0, 4).join("; ");
              return `<span class="badge ${def.cls}" title="${fmt.esc(def.txt(s) + (outros ? " " + outros : ""))}">${fmt.esc(def.r)}</span>`;
            }).join(" ") + (e.sinais.some((s) => s.com) ? `<br><small class="muted">${fmt.esc(e.sinais.filter((s) => s.com).flatMap((s) => s.com).filter((c, i, a) => a.indexOf(c) === i).slice(0, 3).map((c) => porCnpj.get(c)?.nome || cnpjFmt(c)).join("; "))}</small>` : "") },
          { t: "Empenhado", k: "valor", r: true, f: (v) => fmt.brl(v) },
        ], f, { ordem: 4, aoClicar: (e) => P.detalhe("fornecedor", { nome: e.nome, doc: e.cnpj }) });
      }
      q("[data-f=sinal]").onchange = (e) => { st.sinal = e.target.value; desenhar(); };
      q("[data-f=busca]").value = st.busca;
      let t; q("[data-f=busca]").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { st.busca = e.target.value; desenhar(); }, 200); };
      desenhar();
    },
  });
})();
