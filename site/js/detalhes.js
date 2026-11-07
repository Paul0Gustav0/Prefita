/* Prefita · janela de detalhes.
   Tocar numa pessoa, empresa, empenho, contrato, licitação ou diária abre esta janela lateral com tudo o que o painel
   sabe sobre aquilo, juntando as abas. Dentro dela, nomes e números também são tocáveis (com botão de voltar).
   Uso: Prefita.detalhe("servidor", {nome}) · ("fornecedor", {nome, doc}) · ("empenho", {ano, id}) · ("empenhoTce", {orgao, ano, nr})
        ("contratoPncp", {c}) · ("contratoPortal", {c, ano}) · ("licitacao", {l, ano}) · ("diaria", {d, ano}) · ("pessoa", {nome}) */
(function () {
  "use strict";
  const P = window.Prefita, { brl, compact, num, esc, data } = P.fmt;
  const TIPOS = {};
  let pilha = [], dlg, refs = new Map(), nref = 0, geracao = 0;

  /* ---------- carregadores (cada arquivo é baixado uma vez só) ---------- */
  const anosPortal = async () => [...((await P.json("data/resumo.json")).anos_portal || [])].sort((a, b) => b - a);
  async function despesas(ano) {
    const j = await P.json(`data/despesas-${ano}.json`).catch(() => null);
    if (!j) return [];
    return (j._det ||= j.r.map((r) => ({ ano: +ano, id: r[0], num: r[1], dia: r[2], forn: j.forn[r[3]], doc: j.doc[r[4]], sec: j.sec[r[5]],
      area: j.area[r[6]], nat: j.nat[r[7]], mod: j.mod[r[8]], desc: r[9], emp: r[10], liq: r[11], pago: r[12], tpem: r[13] || "", cod: r[14] || "" })));
  }
  async function folha(mes) {
    const j = await P.json(`data/folha-${mes}.json`);
    const t = (k, i) => (j[k] && i != null ? j[k][i] : "");
    return (j._det ||= j.r.map((r) => ({ mes, nome: r[0], cargo: j.cargo[r[1]], sec: j.sec[r[2]], local: j.local[r[3]], vinc: j.vinc[r[4]], adm: r[5],
      bruto: r[6], desc: r[7], liq: r[8], resc: !!r[9], extras: r.length > 10, base: r[10] || 0, he: r[11] || 0, horas: r[12] || 0,
      ref: t("ref", r[13]), regime: t("regime", r[14]), situ: t("situ", r[15]), fim: r[16] || "", deslig: r[17] || "", folha: t("folha", r[18]), prov: t("prov", r[19]) })));
  }
  const mesesFolha = async () => [...(await P.json("data/folha-meses.json"))].sort();
  const lista = (caminho) => P.json(caminho).catch(() => []);

  /* ---------- comparação de nomes e documentos ---------- */
  const N = (s) => P.norm(s).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  const digitos = (d) => { const s = String(d || ""); return /x/i.test(s) ? "" : s.replace(/\D/g, ""); };
  function mesmo(nomeA, docA, nomeB, docB) {
    const da = digitos(docA), db = digitos(docB);
    if (da.length >= 11 && db.length >= 11) return da === db;
    const a = N(nomeA), b = N(nomeB);
    if (!a || !b) return false;
    if (a === b) return true;
    // o portal corta nomes longos em 50 letras
    return Math.min(a.length, b.length) >= 40 && (a.startsWith(b) || b.startsWith(a));
  }
  const cnpjFmt = (c) => String(c || "").replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");

  /* ---------- pedacinhos de interface ---------- */
  const link = (tipo, args, texto, cls = "") => { const id = "r" + ++nref; refs.set(id, [tipo, args]); return `<button type="button" class="det-link ${cls}" data-det="${id}">${texto}</button>`; };
  const linkPessoa = (nome, doc, texto) => link("pessoa", { nome, doc }, texto ?? esc(nome));
  const secao = (titulo, corpo, sub = "") => corpo ? `<section class="det-sec"><div class="det-sec-hd"><h3>${titulo}</h3>${sub ? `<span>${sub}</span>` : ""}</div>${corpo}</section>` : "";
  const campos = (pares) => { const v = pares.filter(([, x]) => x !== "" && x != null && x !== false && x !== "–"); return v.length ? `<dl class="det-campos">${v.map(([k, x]) => `<div><dt>${k}</dt><dd>${x}</dd></div>`).join("")}</dl>` : ""; };
  const aviso = (txt, ico = "info") => `<div class="notice det-aviso">${P.ico(ico)}<span>${txt}</span></div>`;
  const tiles = (l) => P.ui.tiles(l.filter(Boolean));
  const fonte = (txt) => `<p class="det-fonte">${txt}</p>`;
  function execucao(total, liq, pago, rotulo = "Empenhado") {
    const t = Math.max(total, liq, pago, 0) || 1, w = (v) => Math.max(0, Math.min(100, (v / t) * 100));
    return `<div class="det-exec" role="img" aria-label="${esc(`${rotulo} ${brl(total)}, liquidado ${brl(liq)}, pago ${brl(pago)}`)}">
      <div class="det-exec-bar"><span class="l" style="width:${w(liq)}%"></span><span class="p" style="width:${w(pago)}%"></span></div>
      <div class="det-exec-leg"><span><i class="e"></i>${esc(rotulo)} <b>${brl(total)}</b></span><span><i class="l"></i>${P.termo("liquidacao", "Liquidado")} <b>${brl(liq)}</b></span>${pago == null ? "" : `<span><i class="p"></i>${P.termo("pagamento", "Pago")} <b>${brl(pago)}</b>${total > 0 ? ` <small>${P.fmt.pctF(Math.min(pago / total, 9.99), 0)}</small>` : ""}</span>`}</div></div>`;
  }
  // Tabela pequena dentro da janela: devolve o HTML do lugar e agenda o desenho para depois de inserido
  let agenda = [];
  function tabela(cols, linhas, o = {}) {
    if (!linhas.length) return o.vazio ? `<div class="empty">${esc(o.vazio)}</div>` : "";
    const id = "t" + ++nref;
    agenda.push((el) => P.tabela(el.querySelector(`[data-tab="${id}"]`), cols, linhas, { porPagina: 8, busca: linhas.length > 12, ...o }));
    return `<div data-tab="${id}"></div>`;
  }
  const mesCurto = (m) => { const [a, mm] = m.split("-"); return `${P.MES_ABBR[+mm - 1]}/${a.slice(2)}`; };
  const TPEM = { OR: "Ordinário (valor certo, pago de uma vez)", GL: "Global (valor certo, pago em parcelas)", ES: "Estimativo (valor previsto, pode variar)", AN: "Anulação" };

  /* ---------- janela ---------- */
  function janela() {
    if (dlg) return dlg;
    dlg = document.createElement("dialog");
    dlg.className = "dlg dlg-det"; dlg.id = "dlgDet";
    dlg.innerHTML = `<div class="dlg-hd det-hd"><div class="det-hd-l"><button class="icon-btn" type="button" data-voltar aria-label="Voltar" hidden>${P.ico("left")}</button><div><div class="eyebrow" data-eb></div><h2 data-tt></h2><div class="sub" data-sb></div></div></div><button class="icon-btn" type="button" data-fechar aria-label="Fechar">${P.ico("x")}</button></div><div class="dlg-bd det-bd" data-bd></div>`;
    document.body.append(dlg);
    dlg.querySelector("[data-fechar]").onclick = () => dlg.close();
    dlg.querySelector("[data-voltar]").onclick = () => { if (pilha.length > 1) { pilha.pop(); desenhar(); } };
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) return dlg.close();
      const b = e.target.closest("[data-det]");
      if (b && refs.has(b.dataset.det)) { const [t, a] = refs.get(b.dataset.det); abrir(t, a, true); }
      const ir = e.target.closest("[data-ir-aba]");
      if (ir) dlg.close();
    });
    dlg.addEventListener("close", () => { pilha = []; refs.clear(); });
    return dlg;
  }

  function abrir(tipo, args = {}, empilhar = false) {
    const d = janela();
    if (!empilhar || !d.open) pilha = [];
    pilha.push([tipo, args]);
    if (!d.open) d.showModal();
    desenhar();
  }

  async function desenhar() {
    const d = janela(), g = ++geracao;
    const [tipo, args] = pilha[pilha.length - 1];
    const q = (s) => d.querySelector(s);
    q("[data-voltar]").hidden = pilha.length < 2;
    q("[data-bd]").innerHTML = P.ui.carregando(6);
    q("[data-bd]").scrollTop = 0;
    agenda = [];
    let r;
    try { r = await TIPOS[tipo](args); }
    catch (e) { console.error(e); r = { titulo: "Não consegui abrir", corpo: aviso("Os dados desta ficha não carregaram. Confira a conexão e tente de novo.", "alert") }; }
    if (g !== geracao) return;
    if (r.redirecionar) { pilha[pilha.length - 1] = r.redirecionar; return desenhar(); }
    q("[data-eb]").innerHTML = r.eyebrow || "";
    q("[data-tt]").innerHTML = r.titulo || "";
    q("[data-sb]").innerHTML = r.sub || "";
    q("[data-bd]").innerHTML = r.corpo || "";
    const ag = agenda; agenda = [];
    ag.forEach((f) => f(q("[data-bd]")));
    r.depois?.(q("[data-bd]"), () => g === geracao);
  }

  /* ---------- pessoa: servidor se estiver na folha, senão fornecedor/credor ---------- */
  TIPOS.pessoa = async ({ nome, doc }) => {
    const meses = await mesesFolha();
    for (const m of meses.slice(-3).reverse()) if ((await folha(m)).some((l) => N(l.nome) === N(nome))) return { redirecionar: ["servidor", { nome }] };
    return { redirecionar: ["fornecedor", { nome, doc }] };
  };

  /* ---------- servidor ---------- */
  TIPOS.servidor = async ({ nome, mes: mesSel }) => {
    const meses = await mesesFolha();
    const todos = await Promise.all(meses.map((m) => folha(m).catch(() => [])));
    const alvo = N(nome);
    const hist = meses.map((m, i) => {
      const ls = todos[i].filter((l) => N(l.nome) === alvo);
      return { mes: m, ls, bruto: ls.reduce((s, l) => s + l.bruto, 0), desc: ls.reduce((s, l) => s + l.desc, 0), liq: ls.reduce((s, l) => s + l.liq, 0) };
    });
    const com = hist.filter((h) => h.ls.length);
    if (!com.length) return { titulo: esc(nome), corpo: aviso("Esta pessoa não aparece na folha de pagamento publicada desde 2024.") };
    const ultimo = com[com.length - 1], ultimoMes = meses[meses.length - 1];
    const sel = com.find((h) => h.mes === mesSel) || ultimo;
    const p = [...ultimo.ls].sort((a, b) => b.bruto - a.bruto)[0];
    const doMesSel = todos[meses.indexOf(sel.mes)];
    const colegas = doMesSel.filter((l) => l.cargo === p.cargo && !l.resc).map((l) => l.bruto).sort((a, b) => a - b);
    const medCargo = colegas.length ? colegas[Math.floor(colegas.length / 2)] : 0;
    const ult12 = com.slice(-12), media12 = ult12.reduce((s, h) => s + h.bruto, 0) / ult12.length;
    const anoSel = sel.mes.slice(0, 4), noAno = com.filter((h) => h.mes.startsWith(anoSel));
    const saiu = ultimo.mes !== ultimoMes;

    // Composição do mês escolhido
    const comp = sel.ls.map((l) => {
      const outros = Math.max(0, l.bruto - l.base - l.he);
      const linhasP = l.extras && l.base > 0
        ? [["Salário-base do cargo", l.base, "valor inicial da tabela salarial do cargo"], ...(l.he > 0 ? [["Horas extras", l.he, ""]] : []),
           ...(outros > 0.009 ? [["Adicionais, gratificações e outras vantagens", outros, "tempo de serviço, função, insalubridade, abonos, 13º, férias etc. (soma; o portal não separa)"]] : [])]
        : [["Total de proventos", l.bruto, ""]];
      const maxv = Math.max(l.bruto, l.desc, 1);
      const barra = (v, cls) => `<span class="det-vb"><span class="${cls}" style="width:${Math.max(0.5, (v / maxv) * 100)}%"></span></span>`;
      return `<div class="det-holerite">
        ${sel.ls.length > 1 ? `<div class="det-hol-tt">${esc(l.cargo)}${l.resc ? ` <span class="badge warn">rescisão</span>` : ""}${l.folha ? ` <small class="muted">${esc(l.folha)}</small>` : ""}</div>` : l.resc || /13|f[ée]rias|adiant/i.test(l.folha) ? `<div class="det-hol-tt">${esc(l.folha || "Rescisão")}</div>` : ""}
        <div class="det-hol-grupo"><div class="det-hol-g">Proventos (bruto)</div>${linhasP.map(([k, v, n]) => `<div class="det-hol-l"><span>${esc(k)}${n ? `<small>${esc(n)}</small>` : ""}</span><b>${brl(v)}</b>${barra(v, "p")}</div>`).join("")}
          <div class="det-hol-l tot"><span>Total bruto</span><b>${brl(l.bruto)}</b></div></div>
        <div class="det-hol-grupo"><div class="det-hol-g">Descontos</div><div class="det-hol-l"><span>Total de descontos<small>previdência (${esc(/geral/i.test(l.regime) ? "INSS" : l.regime ? "regime próprio" : "INSS ou regime próprio")}), imposto de renda, faltas, empréstimos consignados, pensão etc.</small></span><b>− ${brl(l.desc)}</b>${barra(l.desc, "d")}</div></div>
        <div class="det-hol-l liq"><span>Líquido (o que caiu na conta)</span><b>${brl(l.liq)}</b></div>
      </div>`;
    }).join("");

    const rot = com.map((h) => h.mes);
    const corpo = `
      ${saiu ? aviso(`Não aparece na folha de ${P.fmt.mes(ultimoMes).toLowerCase()}. O último pagamento publicado é de ${P.fmt.mes(ultimo.mes).toLowerCase()}${p.deslig ? ` (desligamento em ${data(p.deslig)})` : ""}.`) : ""}
      ${tiles([
        { label: `Bruto em ${mesCurto(sel.mes)}`, value: compact(sel.bruto), note: "antes dos descontos", title: brl(sel.bruto) },
        { label: "Descontos", value: compact(sel.desc), note: sel.bruto ? `${P.fmt.pctF(sel.desc / sel.bruto, 0)} do bruto` : "", title: brl(sel.desc) },
        { label: "Líquido", value: compact(sel.liq), note: "o que a pessoa recebe", title: brl(sel.liq) },
        { label: `Recebido em ${anoSel}`, value: compact(noAno.reduce((s, h) => s + h.bruto, 0)), note: `bruto de ${noAno.length} ${noAno.length > 1 ? "meses" : "mês"}`, spark: noAno.map((h) => h.bruto) },
      ])}
      ${secao(`O que compõe o salário de ${P.fmt.mes(sel.mes).toLowerCase()}`, `<label class="det-mes">Mês <select data-mes>${[...com].reverse().map((h) => `<option value="${h.mes}" ${h.mes === sel.mes ? "selected" : ""}>${P.fmt.mes(h.mes)}</option>`).join("")}</select></label>${comp}
        ${aviso("A Prefeitura publica só o total de proventos e o total de descontos de cada servidor, mais o salário-base do cargo e as horas extras. O valor de cada gratificação, adicional, INSS ou imposto de renda não está nos dados abertos nem no portal dela. Quem quiser esse detalhamento pode pedir pela Lei de Acesso à Informação (e-SIC da Prefeitura).")}`)}
      ${secao("Mês a mês", `<div class="legend"><span><i></i>Bruto</span><span><i class="line"></i>Líquido</span></div><div data-graf></div>` + tabela([
          { t: "Mês", k: "mes", f: (v) => P.fmt.mes(v) },
          { t: "Cargo", k: (h) => h.ls.map((l) => l.cargo).join(" + "), f: (v, h) => `${esc(v)}${h.ls.some((l) => l.resc) ? ' <span class="badge warn">rescisão</span>' : ""}` },
          { t: "Bruto", k: "bruto", r: true, f: (v) => brl(v) },
          { t: "Descontos", k: "desc", r: true, f: (v) => brl(v) },
          { t: "Líquido", k: "liq", r: true, f: (v) => brl(v) },
        ], [...com].reverse(), { ordem: 0, dir: -1, porPagina: 12, busca: false, unidade: "meses", arquivo: "salario-" + N(nome).replace(/ /g, "-"), aoClicar: (h) => abrirMes(h.mes) }),
        `média dos últimos ${ult12.length} meses: ${brl(media12)} bruto`)}
      ${secao("Comparado com o cargo", colegas.length > 2 ? `<p class="det-p">${num(colegas.length)} pessoas tinham o cargo <b>${esc(p.cargo)}</b> em ${P.fmt.mes(sel.mes).toLowerCase()}. O salário bruto típico (mediana) delas foi <b>${brl(medCargo)}</b>; o desta pessoa foi <b>${brl(sel.bruto)}</b>${medCargo ? ` (${sel.bruto >= medCargo ? "+" : "−"}${P.fmt.pctF(Math.abs(sel.bruto / medCargo - 1), 0)})` : ""}.</p>` : "")}
      ${secao("Dados do vínculo", campos([
        ["Cargo", esc(p.cargo)], ["Secretaria", esc(p.sec)], ["Local de trabalho", esc(p.local)], ["Vínculo", esc(p.vinc)],
        ["Situação", esc(p.situ)], ["Forma de ingresso", esc(p.prov)], ["Admissão", p.adm ? data(p.adm) : ""],
        ["Fim do contrato", p.fim ? data(p.fim) : ""], ["Carga horária", p.horas ? `${p.horas} horas por semana` : ""],
        ["Referência salarial", esc(p.ref)], ["Previdência", esc(p.regime)],
      ]) + (p.extras ? "" : `<p class="det-p muted">Mais dados do vínculo (carga horária, salário-base, previdência) aparecem depois da próxima coleta diária.</p>`))}
      <div data-outros></div>
      ${fonte(`Fonte: folha de pagamento publicada pela Prefeitura no <a href="https://fiorilli.itabera.online/transparencia/" target="_blank" rel="noopener">portal da transparência</a>. A remuneração de servidores é pública por lei (LAI e STF, ARE 652.777); o CPF não é mostrado.`)}`;

    function abrirMes(m) { pilha[pilha.length - 1] = ["servidor", { nome, mes: m }]; desenhar(); }
    return {
      eyebrow: `${P.ico("users")} Servidor da Prefeitura`, titulo: esc(p.nome), sub: `${esc(p.cargo)} · ${esc(p.sec)}`, corpo,
      depois: async (el, vivo) => {
        el.querySelector("[data-mes]").onchange = (e) => abrirMes(e.target.value);
        P.ui.colunas(el.querySelector("[data-graf]"), { rotulos: rot.map(mesCurto), rotulosLongos: rot.map((m) => P.fmt.mes(m)), a: com.map((h) => h.bruto), b: com.map((h) => h.liq),
          nomeA: "Bruto", nomeB: "Líquido", altura: 200, sel: rot.indexOf(sel.mes), aria: `Salário bruto e líquido de ${nome} mês a mês`, onClick: (i) => abrirMes(rot[i]) });
        // Outros pagamentos a esta pessoa: diárias e empenhos em nome dela
        const anos = await anosPortal();
        const [dia, desp] = await Promise.all([Promise.all(anos.map((a) => lista(`data/diarias-${a}.json`).then((l) => l.map((x) => ({ ...x, ano: a }))))), Promise.all(anos.map(despesas))]);
        if (!vivo()) return;
        const diar = dia.flat().filter((x) => N(x.fav) === alvo);
        const emps = desp.flat().filter((x) => N(x.forn) === alvo);
        el.querySelector("[data-outros]").innerHTML = secao("Diárias e viagens", tabela([
            { t: "Data", k: "dia", f: (v) => data(v) }, { t: "Motivo", k: "desc", f: (v, x) => `<small>${esc(v)}</small><br><small class="muted">${esc(x.tipo)}</small>` },
            { t: "Valor", k: "valor", r: true, f: (v) => brl(v) }], diar, { aoClicar: (x) => abrir("diaria", { d: x, ano: x.ano }, true), unidade: "lançamentos" }),
            diar.length ? `${num(diar.length)} lançamentos · ${brl(diar.reduce((s, x) => s + x.valor, 0))}` : "")
          + secao("Empenhos em nome desta pessoa", tabela([
            { t: "Data", k: "dia", f: (v) => data(v) }, { t: "Descrição", k: "desc", f: (v) => `<small>${esc(v)}</small>` },
            { t: "Empenhado", k: "emp", r: true, f: (v) => brl(v) }], emps, { aoClicar: (x) => abrir("empenho", { ano: x.ano, id: x.id }, true), unidade: "empenhos" }),
            emps.length ? "fora da folha: serviços, ressarcimentos, auxílios" : "");
        const ag = agenda; agenda = []; ag.forEach((f) => f(el));
      },
    };
  };

  /* ---------- fornecedor / credor ---------- */
  TIPOS.fornecedor = async ({ nome, doc }) => {
    const anos = await anosPortal();
    const [desp, cts, pncp, soc, dia] = await Promise.all([
      Promise.all(anos.map(despesas)).then((l) => l.flat()),
      Promise.all(anos.map((a) => lista(`data/contratos-${a}.json`).then((l) => l.map((c) => ({ ...c, _ano: a }))))).then((l) => l.flat()),
      P.tce.carregarContratos(),
      P.json("data/socios.json").catch(() => ({ empresas: [] })),
      Promise.all(anos.map((a) => lista(`data/diarias-${a}.json`).then((l) => l.map((x) => ({ ...x, ano: a }))))).then((l) => l.flat()),
    ]);
    // documento: o que veio, ou o primeiro que aparecer nas despesas com o mesmo nome
    let d = digitos(doc);
    if (!d) d = digitos(desp.find((x) => mesmo(nome, "", x.forn, ""))?.doc) || digitos(cts.find((c) => mesmo(nome, "", c.forn, ""))?.doc);
    const e = (x, n, dd) => mesmo(nome, d, n, dd);
    const meus = desp.filter((x) => e(x, x.forn, x.doc)).sort((a, b) => String(b.dia).localeCompare(String(a.dia)));
    const contratos = cts.filter((c) => !c.anulado && e(c, c.forn, c.doc));
    const noPncp = pncp.filter((c) => e(c, c.forn, c.doc));
    const empresa = (soc.empresas || []).find((x) => (d && x.cnpj === d) || mesmo(nome, "", x.nome, ""));
    const diarias = dia.filter((x) => mesmo(nome, "", x.fav, ""));
    const nomeShow = meus[0]?.forn || contratos[0]?.forn || empresa?.nome || nome;
    const docShow = d.length === 14 ? cnpjFmt(d) : meus.find((x) => x.doc)?.doc || "";
    const emp = meus.reduce((s, x) => s + x.emp, 0), pago = meus.reduce((s, x) => s + x.pago, 0), liq = meus.reduce((s, x) => s + x.liq, 0);
    const porAno = anos.map((a) => { const l = meus.filter((x) => x.ano === a); return { a, n: l.length, emp: l.reduce((s, x) => s + x.emp, 0), pago: l.reduce((s, x) => s + x.pago, 0) }; }).filter((x) => x.n);
    const porSec = P.somarPor(meus, (x) => x.sec, (x) => x.emp).filter(([, v]) => v > 0).slice(0, 8);
    const totCt = contratos.reduce((s, c) => s + c.valor + (c.aditado || 0), 0);
    const pf = /x/i.test(docShow) || d.length === 11;

    const corpo = `
      ${tiles([
        { label: `Empenhado desde ${anos[anos.length - 1] || ""}`, value: compact(emp), note: `${num(meus.length)} empenhos`, title: brl(emp), spark: porAno.length > 1 ? [...porAno].reverse().map((x) => x.emp) : null },
        { label: "Já pago", value: compact(pago), note: emp > 0 ? `${P.fmt.pctF(Math.min(pago / emp, 9.99), 0)} do empenhado` : "", title: brl(pago) },
        { label: "Contratos", value: num(Math.max(contratos.length, noPncp.length)), note: totCt ? `${compact(totCt)} contratados (portal)` : noPncp.length ? `${num(noPncp.length)} no PNCP` : "nenhum contrato registrado" },
        meus.length ? { label: "Recebe desde", value: data(meus[meus.length - 1].dia).slice(3), note: `último empenho em ${data(meus[0].dia)}` } : null,
      ])}
      ${meus.length ? secao("Quanto foi empenhado e pago", execucao(emp, liq, pago)) : ""}
      ${empresa ? secao("Cadastro na Receita Federal", campos([
          ["CNPJ", `<span class="mono">${cnpjFmt(empresa.cnpj)}</span>`], ["Nome fantasia", esc(empresa.fantasia)], ["Abertura", data(empresa.abertura)],
          ["Cidade", esc(empresa.cidade)], ["Atividade", esc(empresa.cnae)], ["Natureza", esc(empresa.natureza)], ["Porte", empresa.mei ? "MEI" : ""],
          ["Sócios", empresa.socios.length ? empresa.socios.map((s) => `${esc(s[0])} <small class="muted">${esc(s[1])}${s[2] ? ` desde ${data(s[2])}` : ""}</small>`).join("<br>") : ""],
          ["Pontos de atenção", empresa.sinais.length ? empresa.sinais.map((s) => `<span class="badge warn">${esc({ aberta_recente: `Aberta ${s.dias} dias antes do 1º empenho`, situacao: `Situação: ${s.v}`, mesmo_endereco: "Endereço igual ao de outro fornecedor", mesmo_telefone: "Telefone igual ao de outro fornecedor", socio_em_comum: `Sócio em comum: ${s.nome || ""}` }[s.t] || s.t)}</span>`).join(" ") : ""],
        ]) + `<a class="btn sm" data-ir-aba href="#/socios?busca=${encodeURIComponent(empresa.cnpj)}">Ver na aba Sócios ${P.ico("right")}</a>`) : ""}
      ${porAno.length ? secao("Por ano", tabela([{ t: "Ano", k: "a" }, { t: "Empenhos", k: "n", r: true, f: (v) => num(v) }, { t: "Empenhado", k: "emp", r: true, f: (v) => brl(v) }, { t: "Pago", k: "pago", r: true, f: (v) => brl(v) }], porAno, { ordem: 0, dir: -1, busca: false, unidade: "anos" })) : ""}
      ${porSec.length > 1 ? secao("Quem comprou", `<div data-sec></div>`, "empenhado por secretaria") : ""}
      ${secao("Empenhos", tabela([
          { t: "Data", k: "dia", f: (v) => data(v) }, { t: "Empenho", k: "num", mono: true },
          { t: "O que foi", k: "desc", f: (v, x) => `<small>${esc(v)}</small><br><small class="muted">${esc(x.sec)}</small>` },
          { t: "Empenhado", k: "emp", r: true, f: (v) => brl(v) }, { t: "Pago", k: "pago", r: true, f: (v, x) => (x.emp > 0 && v >= x.emp - 0.01 ? `<span class="badge good">${brl(v)}</span>` : brl(v)) },
        ], meus, { ordem: 0, dir: -1, unidade: "empenhos", arquivo: "empenhos-" + N(nomeShow).replace(/ /g, "-").slice(0, 40), aoClicar: (x) => abrir("empenho", { ano: x.ano, id: x.id }, true), vazio: "Nenhum empenho no portal da Prefeitura desde " + (anos[anos.length - 1] || 2024) + "." }),
        "toque num empenho para ver os itens e os pagamentos")}
      ${contratos.length ? secao("Contratos (portal da Prefeitura)", tabela([
          { t: "Assinatura", k: "assinatura", f: (v) => data(v) }, { t: "Objeto", k: "objeto", f: (v, c) => `<small>${esc(v)}</small><br><small class="muted">${esc(c.mod)} · contrato ${esc(c.num)}</small>` },
          { t: "Valor", k: (c) => c.valor + (c.aditado || 0), r: true, f: (v) => brl(v) }], contratos, { aoClicar: (c) => abrir("contratoPortal", { c, ano: c._ano }, true), unidade: "contratos" })) : ""}
      ${noPncp.length ? secao("Contratos no PNCP", tabela([
          { t: "Assinatura", k: "assinatura", f: (v) => data(v) }, { t: "Objeto", k: "objeto", f: (v) => `<small>${esc(v)}</small>` },
          { t: "Valor", k: (c) => +c.valor || 0, r: true, f: (v) => brl(v) }], noPncp, { aoClicar: (c) => abrir("contratoPncp", { c }, true), unidade: "contratos" })) : ""}
      ${diarias.length ? secao("Diárias e viagens", tabela([{ t: "Data", k: "dia", f: (v) => data(v) }, { t: "Motivo", k: "desc", f: (v) => `<small>${esc(v)}</small>` }, { t: "Valor", k: "valor", r: true, f: (v) => brl(v) }], diarias, { aoClicar: (x) => abrir("diaria", { d: x, ano: x.ano }, true) })) : ""}
      ${secao("No Tribunal de Contas (desde 2021)", `<div data-tce><button class="btn sm" type="button" data-tce-btn>${P.ico("list")}Somar os empenhos enviados ao TCE-SP</button><p class="det-p muted">Inclui os anos antes de 2024 e a Câmara. Baixa alguns megabytes.</p></div>`)}
      ${fonte("Fontes: portal da transparência da Prefeitura (empenhos, contratos e diárias), PNCP, TCE-SP e cadastro de CNPJ da Receita Federal.")}`;
    return {
      eyebrow: `${P.ico(pf ? "users" : "building")} ${pf ? "Pessoa que recebe da Prefeitura" : "Fornecedor ou credor"}`,
      titulo: esc(nomeShow), sub: [docShow && `<span class="mono">${esc(docShow)}</span>`, empresa?.cidade && esc(empresa.cidade)].filter(Boolean).join(" · "), corpo,
      depois: (el, vivo) => {
        const s = el.querySelector("[data-sec]"); if (s) P.ui.hbars(s, porSec.map(([k, v]) => ({ k, v })), { total: emp });
        const b = el.querySelector("[data-tce-btn]");
        if (b) b.onclick = async () => {
          b.disabled = true; b.textContent = "Carregando…";
          const res = [];
          for (const a of [...P.anos].sort()) {
            const l = (await P.tce.ano(a).catch(() => [])).filter((x) => x.ev === "E" && mesmo(nome, "", x.forn, ""));
            if (l.length) res.push({ a, n: l.length, liq: l.reduce((s2, x) => s2 + x.liq, 0), pago: l.reduce((s2, x) => s2 + x.pago, 0), l });
          }
          if (!vivo()) return;
          const box = el.querySelector("[data-tce]");
          box.innerHTML = res.length ? tabela([{ t: "Ano", k: "a" }, { t: "Empenhos", k: "n", r: true, f: (v) => num(v) }, { t: "Empenhado", k: "liq", r: true, f: (v) => brl(v) }, { t: "Pago", k: "pago", r: true, f: (v) => brl(v) }], res.reverse(), { ordem: 0, dir: -1, busca: false, aoClicar: (x) => { P.filtros.ano = String(x.a); P.filtros.forn = x.l[0].forn; dlg.close(); P.irPara("empenhos"); } }) + `<p class="det-p muted">Toque num ano para ver os empenhos na aba do TCE.</p>`
            : `<div class="empty">Nenhum empenho com este nome no TCE-SP.</div>`;
          const ag = agenda; agenda = []; ag.forEach((f) => f(el));
        };
      },
    };
  };

  /* ---------- empenho do portal da Prefeitura ---------- */
  TIPOS.empenho = async ({ ano, id }) => {
    const l = (await despesas(ano)).find((x) => String(x.id) === String(id));
    if (!l) return { titulo: "Empenho não encontrado", corpo: aviso("Este empenho não está mais na lista do portal.") };
    const det = (await P.json(`data/empenho/${ano}/${Math.floor(+id / 250)}.json`).catch(() => ({})))[id];
    const folhaInc = /^INCORPORA/i.test(l.desc);
    const itens = det?.i || [], pags = det?.p || [], nfs = det?.nf || [];
    const corpo = `
      ${secao("Quanto foi reservado, entregue e pago", execucao(l.emp, l.liq, l.pago) + `<p class="det-p muted">${P.termo("empenho", "Empenhado")}: dinheiro reservado. ${P.termo("liquidacao", "Liquidado")}: a Prefeitura conferiu que recebeu. ${P.termo("pagamento", "Pago")}: saiu do caixa.</p>`)}
      ${secao("O que foi comprado", `<p class="det-p det-hist">${esc(det?.h || l.desc)}</p>`)}
      ${itens.length ? secao("Itens", tabela([
          { t: "Item", k: 0, f: (v, i) => `${esc(v)}${i[1] ? `<br><small class="muted">marca ${esc(i[1])}</small>` : ""}` },
          { t: "Qtd.", k: 2, r: true, f: (v, i) => `${num(v)} ${esc(i[3])}` }, { t: "Valor unitário", k: 4, r: true, f: (v) => brl(v) },
          { t: "Total", k: 5, r: true, f: (v) => brl(v) }], itens, { ordem: 5, dir: -1, unidade: "itens", busca: itens.length > 12, arquivo: `itens-empenho-${l.num.replace("/", "-")}` }), `${num(itens.length)} ${itens.length > 1 ? "itens" : "item"}`) : ""}
      ${pags.length ? secao("Pagamentos", tabela([{ t: "Data", k: 0, f: (v) => data(v) }, { t: "Ordem de pagamento", k: 3, mono: true }, { t: "Retenções", k: 2, r: true, f: (v) => (v ? brl(v) : "–") }, { t: "Pago", k: 1, r: true, f: (v) => brl(v) }], pags, { ordem: 0, dir: 1, busca: false, unidade: "pagamentos" })) : ""}
      ${nfs.length ? secao("Notas fiscais", tabela([{ t: "Nota", k: 0, mono: true, f: (v, n) => (n[4] ? `<a href="${esc(n[4])}" target="_blank" rel="noopener">${esc(v)} ${P.ico("ext")}</a>` : esc(v)) }, { t: "Data", k: 1, f: (v) => data(v) }, { t: "Cidade", k: 3 }, { t: "Valor", k: 2, r: true, f: (v) => brl(v) }], nfs, { ordem: 1, dir: 1, busca: false, unidade: "notas" })) : ""}
      ${!det && !folhaInc ? aviso("Os itens, os pagamentos e as notas fiscais deste empenho ainda não foram baixados. O portal da Prefeitura só entrega esses dados empenho por empenho, então a coleta diária busca alguns milhares por dia, dos mais recentes para os mais antigos.", "clock") : ""}
      ${det?.x ? aviso("O portal da Prefeitura não tem itens nem pagamentos detalhados para este lançamento.") : ""}
      ${folhaInc ? aviso("Este empenho é a incorporação da folha de pagamento: o valor é a soma dos salários de um grupo de servidores. Veja quem recebeu na aba Folha de pagamento.") : ""}
      ${secao("Dados do empenho", campos([
        ["Número", `<span class="mono">${esc(l.num)}</span>`], ["Data", data(l.dia)], ["Tipo", esc(TPEM[l.tpem] || l.tpem)],
        ["Credor", linkPessoa(l.forn, l.doc)], ["CPF/CNPJ", esc(l.doc)], ["Secretaria", esc(l.sec)], ["Unidade", esc(det?.un)], ["Área", esc(l.area)],
        ["Programa", esc(det?.prog)], ["Ação", esc(det?.acao)], ["Natureza da despesa", esc(det?.nat || l.nat)], ["Fonte do dinheiro", esc(det?.fonte)],
        ["Forma de compra", esc(det?.lic || l.mod)], ["Processo de compra", det?.proc ? `<span class="mono">${esc(det.proc)}</span>` : ""],
        ["Contrato", det?.ct ? `<span class="mono">${esc(det.ct)}</span>${det.vig?.[1] ? ` <small class="muted">vigente de ${data(det.vig[0])} a ${data(det.vig[1])}</small>` : ""}` : ""],
        ["Convênio", esc(det?.conv)],
      ]))}
      ${fonte(`Fonte: <a href="https://fiorilli.itabera.online/transparencia/" target="_blank" rel="noopener">portal da transparência da Prefeitura</a> (Despesas · empenho ${esc(l.num)}).`)}`;
    return { eyebrow: `${P.ico("doc")} Empenho ${esc(l.num)} · ${data(l.dia)}`, titulo: linkPessoa(l.forn, l.doc), sub: esc(l.sec), corpo };
  };

  /* ---------- empenho do TCE-SP ---------- */
  TIPOS.empenhoTce = async ({ orgao, ano, nr }) => {
    const ev = (await P.tce.ano(ano)).filter((x) => x.orgao === orgao && String(x.nr) === String(nr));
    const e = ev.find((x) => x.ev === "E") || ev[0];
    if (!e) return { titulo: "Empenho não encontrado", corpo: "" };
    const NOME = { E: "Empenhado", R: "Reforço", A: "Anulação", L: "Liquidado", P: "Pago" };
    const liq = ev.reduce((s, x) => s + (x.lq || 0), 0);
    let ref = null;
    if (orgao === "P" && (await anosPortal()).includes(+ano)) { const n = String(nr).split(/[-/]/)[0].replace(/^0+/, ""); ref = (await despesas(ano)).find((x) => x.num === `${n}/${ano}` && mesmo(x.forn, "", e.forn, "")) || (await despesas(ano)).find((x) => x.num === `${n}/${ano}`); }
    const corpo = `
      ${secao("Valores", execucao(e.liq, liq, e.pago, "Valor final do empenho"))}
      ${ref ? `<p class="det-p">${link("empenho", { ano: ref.ano, id: ref.id }, `${P.ico("list")} Ver itens, pagamentos e notas fiscais no portal da Prefeitura`, "btn sm")}</p>` : ""}
      ${secao("Movimentos enviados ao TCE", tabela([{ t: "Data", k: "dt", f: (v) => (v ? v.toLocaleDateString("pt-BR") : "–") }, { t: "Movimento", k: "ev", f: (v) => esc(NOME[v] || v) }, { t: "Valor", k: (x) => (x.ev === "P" ? x.pg : x.ev === "A" ? x.an : x.ev === "L" ? x.lq : x.vl), r: true, f: (v, x) => (x.ev === "A" ? "− " : "") + brl(v) }], ev, { ordem: 0, dir: 1, busca: false, unidade: "movimentos" }))}
      ${secao("Dados", campos([["Número", `<span class="mono">${esc(nr)}</span>`], ["Órgão", orgao === "C" ? "Câmara Municipal" : "Prefeitura"], ["Credor", linkPessoa(e.forn, "")], ["Tipo de credor", esc(P.tce.tipoCredor(e))], ["Identificação", esc(e.idf)]]))}
      ${fonte("Fonte: TCE-SP, dados enviados pela Prefeitura e pela Câmara ao sistema Audesp (com algumas semanas de atraso).")}`;
    return { eyebrow: `${P.ico("list")} Empenho ${esc(nr)} no Tribunal de Contas · ${ano}`, titulo: linkPessoa(e.forn, ""), sub: esc(P.tce.tipoCredor(e)), corpo };
  };

  /* ---------- contratos ---------- */
  const hoje = () => new Date().toISOString().slice(0, 10);
  const vigencia = (ini, fim) => !fim ? "" : fim < hoje() ? `<span class="badge">Encerrado em ${data(fim)}</span>` : `<span class="badge good">Vigente até ${data(fim)}</span>`;
  TIPOS.contratoPncp = async ({ c }) => {
    const link_ = c.ano && c.seq ? `https://pncp.gov.br/app/contratos/46634374000160/${c.ano}/${c.seq}` : "";
    const outros = (await P.tce.carregarContratos()).filter((x) => x !== c && mesmo(c.forn, c.doc, x.forn, x.doc));
    const corpo = `
      ${tiles([{ label: "Valor do contrato", value: compact(+c.valor || 0), title: brl(+c.valor || 0), note: esc(c.categoria || "") }, { label: "Vigência", value: c.fim ? data(c.fim) : "–", note: c.inicio ? `começou em ${data(c.inicio)}` : "" }])}
      ${secao("Objeto", `<p class="det-p det-hist">${esc(c.objeto)}</p>`)}
      ${secao("Dados do contrato", campos([["Número", esc(c.num)], ["Fornecedor", linkPessoa(c.forn, c.doc)], ["CNPJ/CPF", `<span class="mono">${esc(cnpjFmt(c.doc))}</span>`], ["Categoria", esc(c.categoria)], ["Tipo", esc(c.tipo)], ["Processo", esc(c.processo)], ["Assinatura", data(c.assinatura)], ["Vigência", vigencia(c.inicio, c.fim)], ["Publicado no PNCP", data(String(c.publicado || "").slice(0, 10))]]))}
      ${link_ ? `<p class="det-p"><a class="btn sm" href="${link_}" target="_blank" rel="noopener">Ver o documento no PNCP ${P.ico("ext")}</a></p>` : ""}
      ${outros.length ? secao("Outros contratos deste fornecedor", tabela([{ t: "Assinatura", k: "assinatura", f: (v) => data(v) }, { t: "Objeto", k: "objeto", f: (v) => `<small>${esc(v)}</small>` }, { t: "Valor", k: (x) => +x.valor || 0, r: true, f: (v) => brl(v) }], outros, { aoClicar: (x) => abrir("contratoPncp", { c: x }, true) })) : ""}
      ${fonte("Fonte: Portal Nacional de Contratações Públicas (PNCP).")}`;
    return { eyebrow: `${P.ico("doc")} Contrato ${esc(c.num || "")} · PNCP`, titulo: linkPessoa(c.forn, c.doc), sub: c.assinatura ? `Assinado em ${data(c.assinatura)}` : "", corpo };
  };
  TIPOS.contratoPortal = async ({ c, ano }) => {
    const total = c.valor + (c.aditado || 0);
    const lics = await lista(`data/licitacoes-${ano}.json`), lic = lics.find((l) => l.proc && l.proc === c.proc);
    const irmaos = (await lista(`data/contratos-${ano}.json`)).filter((x) => x.proc && x.proc === c.proc && x.num !== c.num && !x.anulado);
    const corpo = `
      ${tiles([{ label: "Valor do contrato", value: compact(total), title: brl(total), note: c.aditado ? `inclui ${brl(c.aditado)} de aditivos` : "valor assinado" }, { label: "Saldo", value: compact(Math.max(0, total - c.empenhado)), note: "ainda pode ser empenhado" }])}
      ${secao("Quanto do contrato já foi usado", execucao(total, c.liquidado || 0, null, "Valor do contrato") + `<p class="det-p muted">Empenhado até agora: <b>${brl(c.empenhado)}</b> (${total ? P.fmt.pctF(c.empenhado / total, 0) : "–"} do contrato).</p>`)}
      ${secao("Objeto", `<p class="det-p det-hist">${esc(c.objeto)}</p>`)}
      ${secao("Dados do contrato", campos([["Número", esc(c.num)], ["Fornecedor", linkPessoa(c.forn, c.doc)], ["CNPJ/CPF", `<span class="mono">${esc(c.doc)}</span>`], ["Modalidade", esc(c.mod)], ["Processo", lic ? link("licitacao", { l: lic, ano }, esc(c.proc)) : esc(c.proc)], ["Assinatura", data(c.assinatura)], ["Vigência", `${c.inicio ? data(c.inicio) + " a " : ""}${data(c.fim)} ${vigencia(c.inicio, c.fim)}`], ["Valor inicial", brl(c.valor)], ["Aditivos", c.aditado ? brl(c.aditado) : ""]]))}
      ${irmaos.length ? secao("Outros contratos do mesmo processo", tabela([{ t: "Fornecedor", k: "forn", f: (v) => `<b>${esc(v)}</b>` }, { t: "Valor", k: (x) => x.valor + (x.aditado || 0), r: true, f: (v) => brl(v) }], irmaos, { aoClicar: (x) => abrir("contratoPortal", { c: x, ano }, true) })) : ""}
      ${fonte("Fonte: portal da transparência da Prefeitura (Licitações e contratos).")}`;
    return { eyebrow: `${P.ico("gavel")} Contrato ${esc(c.num)} · ${esc(c.mod)}`, titulo: linkPessoa(c.forn, c.doc), sub: c.assinatura ? `Assinado em ${data(c.assinatura)}` : "", corpo };
  };
  TIPOS.licitacao = async ({ l, ano }) => {
    const cts = (await lista(`data/contratos-${ano}.json`)).filter((c) => c.proc && c.proc === l.proc && !c.anulado);
    const corpo = `
      ${tiles([{ label: "Valor estimado", value: l.valor ? compact(l.valor) : "–", title: brl(l.valor) }, { label: "Situação", value: `<span style="font-size:20px">${esc(l.situacao || "–")}</span>` }, { label: "Contratos assinados", value: num(cts.length), note: cts.length ? compact(cts.reduce((s, c) => s + c.valor + (c.aditado || 0), 0)) : "" }])}
      ${secao("Objeto", `<p class="det-p det-hist">${esc(l.objeto)}</p>`)}
      ${secao("Dados do processo", campos([["Processo", `<span class="mono">${esc(l.proc)}</span>`], ["Modalidade", esc(l.mod)], ["Registro de preços", l.srp ? "Sim (a Prefeitura compra aos poucos, conforme precisar)" : ""], ["Abertura", data(l.abertura)], ["Entrega das propostas", data(l.envio)]]))}
      ${secao("Quem ganhou", tabela([{ t: "Fornecedor", k: "forn", f: (v, c) => `<b>${esc(v)}</b><br><small class="muted">contrato ${esc(c.num)}</small>` }, { t: "Valor", k: (c) => c.valor + (c.aditado || 0), r: true, f: (v) => brl(v) }], cts, { aoClicar: (c) => abrir("contratoPortal", { c, ano }, true), vazio: "Nenhum contrato deste processo no portal ainda." }))}
      ${fonte("Fonte: portal da transparência da Prefeitura (Licitações).")}`;
    return { eyebrow: `${P.ico("gavel")} ${esc(l.mod)} · processo ${esc(l.proc)}`, titulo: esc(String(l.objeto || "").slice(0, 90)) + (String(l.objeto || "").length > 90 ? "…" : ""), sub: l.abertura ? `Aberto em ${data(l.abertura)}` : "", corpo };
  };

  /* ---------- diária ---------- */
  TIPOS.diaria = async ({ d, ano }) => {
    const emp = d.emp ? (await despesas(ano)).find((x) => x.cod === String(d.emp) || x.num === `${d.emp}/${ano}`) : null;
    const todas = (await lista(`data/diarias-${ano}.json`)).filter((x) => N(x.fav) === N(d.fav));
    const corpo = `
      ${tiles([{ label: "Valor", value: compact(d.valor), title: brl(d.valor), note: esc(d.tipo) }, { label: `Total da pessoa em ${ano}`, value: compact(todas.reduce((s, x) => s + x.valor, 0)), note: `${num(todas.length)} lançamentos` }])}
      ${secao("Motivo", `<p class="det-p det-hist">${esc(d.desc)}</p>`)}
      ${secao("Dados", campos([["Data", data(d.dia)], ["Favorecido", linkPessoa(d.fav, d.doc)], ["Cargo", esc(d.cargo)], ["Setor", esc(d.orgao)], ["Tipo de despesa", esc(d.tipo)], ["Empenho", emp ? link("empenho", { ano, id: emp.id }, `<span class="mono">${esc(emp.num)}</span>`) : esc(d.emp)]]))}
      ${todas.length > 1 ? secao(`Outras viagens em ${ano}`, tabela([{ t: "Data", k: "dia", f: (v) => data(v) }, { t: "Motivo", k: "desc", f: (v) => `<small>${esc(v)}</small>` }, { t: "Valor", k: "valor", r: true, f: (v) => brl(v) }], todas.filter((x) => x !== d && !(x.dia === d.dia && x.valor === d.valor && x.desc === d.desc)), { aoClicar: (x) => abrir("diaria", { d: x, ano }, true) })) : ""}
      ${fonte("Fonte: portal da transparência da Prefeitura (Diárias).")}`;
    return { eyebrow: `${P.ico("plane")} Diária · ${data(d.dia)}`, titulo: linkPessoa(d.fav, d.doc), sub: esc([d.cargo, d.orgao].filter(Boolean).join(" · ")), corpo };
  };

  P.detalhe = (tipo, args) => abrir(tipo, args);
})();
