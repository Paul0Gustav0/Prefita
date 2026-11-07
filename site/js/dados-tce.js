/* Prefita · empenhos do TCE-SP e contratos do PNCP
   Cada lançamento do TCE é um evento: E empenhado, R reforço, A anulação, L liquidado, P pago.
   vl = efeito no valor empenhado (E e R somam, A subtrai); pg = valor pago. */
(function () {
  "use strict";
  const P = window.Prefita;
  const cache = {};
  // Limite de dispensa por valor para compras e serviços comuns (Lei 14.133, valor atualizado pelo Decreto 12.343/2024).
  const LIMITE_DISPENSA = 62725.59;
  const SEM_DOC = /sem cpf|identifica[cç][aã]o especial|pessoal|folha|obriga[cç][oõ]es patronais|inss|i\.n\.s\.s|previd/i;

  async function ano(a) {
    a = String(a);
    if (!cache[a]) {
      cache[a] = P.json(`data/empenhos-${a}.json`).then((j) => {
        const agg = new Map();
        const ev = j.r.map((x) => {
          const [o, m, dm, nr, fi, ii, v, e] = x;
          const [dd, mm] = String(dm).split("/");
          const d = { orgao: o, ano: +a, mes: m, dt: dd && mm ? new Date(+a, +mm - 1, +dd) : null, nr, forn: j.f[fi], idf: j.i[ii], ev: e,
            vl: e === "E" || e === "R" ? v : e === "A" ? -v : 0, an: e === "A" ? v : 0, pg: e === "P" ? v : 0 };
          const k = o + "|" + nr;
          const g = agg.get(k) || agg.set(k, { liq: 0, pg: 0 }).get(k);
          g.liq += d.vl; g.pg += d.pg;
          return d;
        });
        for (const d of ev) if (d.ev === "E") { const g = agg.get(d.orgao + "|" + d.nr); d.liq = g.liq; d.pago = g.pg; }
        return ev;
      }).catch((e) => { delete cache[a]; throw e; });
    }
    return cache[a];
  }

  function filtrar(dados, f, opts = {}) {
    const b = (f.busca || "").trim().toLowerCase();
    return dados.filter((d) => (opts.ignorarMes || !f.mes || d.mes == f.mes) && (!opts.ateMes || d.mes <= opts.ateMes) && (!f.orgao || d.orgao === f.orgao) && (!f.forn || d.forn === f.forn) && (!b || d.forn.toLowerCase().includes(b) || d.nr.toLowerCase().includes(b)));
  }
  const soma = (a, k = "vl") => a.reduce((s, d) => s + d[k], 0);
  function porChave(a, k, campo = "vl") { const m = new Map(); for (const d of a) { const key = d[k] || "Não informado"; m.set(key, (m.get(key) || 0) + d[campo]); } return [...m.entries()].sort((x, y) => y[1] - x[1]); }
  function porMes(a, campo = "vl") { const r = new Array(12).fill(0); for (const d of a) if (d.mes) r[d.mes - 1] += d[campo]; return r; }
  function tipoCredor(d) {
    if (SEM_DOC.test(d.idf + " " + d.forn)) return "Pessoal e encargos";
    if (/PESSOA F[ÍI]SICA|CPF/i.test(d.idf)) return "Pessoas físicas";
    if (/CNPJ|JUR[ÍI]DICA/i.test(d.idf)) return "Empresas e entidades";
    return "Outros";
  }

  function sinais(rows, total) {
    const out = [], fora = (d) => SEM_DOC.test(d.idf + " " + d.forn);
    const g = new Map();
    for (const d of rows) { if (fora(d)) continue; const k = d.forn + "|" + d.ano + "|" + d.mes; (g.get(k) || g.set(k, []).get(k)).push(d); }
    const frac = new Map();
    for (const [k, l] of g) {
      const small = l.filter((d) => d.vl < LIMITE_DISPENSA), s = soma(small);
      if (small.length >= 3 && s > LIMITE_DISPENSA) { const [f, a, m] = k.split("|"); const cur = frac.get(f); if (!cur || s > cur.s) frac.set(f, { f, a, m, n: small.length, s, meses: (cur?.meses || 0) + 1 }); else cur.meses++; }
    }
    const { brl0, compact, esc } = P.fmt;
    for (const x of frac.values()) out.push({ lvl: "warn", tag: "Possível fracionamento", forn: x.f, txt: `<b>${esc(x.f)}</b> recebeu ${x.n} empenhos em ${P.MESES[x.m - 1].toLowerCase()} de ${x.a}, todos abaixo de ${brl0(LIMITE_DISPENSA)}, somando ${brl0(x.s)}${x.meses > 1 ? ` (aconteceu em ${x.meses} meses)` : ""}.`, why: "Dividir uma compra em partes pequenas pode evitar a licitação. Vale checar se existe contrato ou ata de registro de preços.", score: x.s });
    for (const [f, v] of porChave(rows.filter((d) => !fora(d)), "forn").slice(0, 3)) { const sh = v / total; if (sh > 0.05) out.push({ lvl: "warn", tag: "Concentração", forn: f, txt: `<b>${esc(f)}</b> concentra ${P.fmt.pctF(sh)} de tudo o que foi empenhado no período (${compact(v)}).`, why: "Não é irregular por si só, mas é bom saber qual contrato sustenta esse volume.", score: v }); }
    const byF = new Map();
    for (const d of rows) (byF.get(d.forn) || byF.set(d.forn, []).get(d.forn)).push(d.vl);
    const outl = new Map();
    for (const d of rows) { const l = byF.get(d.forn); if (l.length < 5 || fora(d)) continue; const med = [...l].sort((a, b) => a - b)[Math.floor(l.length / 2)]; if (d.vl > med * 3 && d.vl > 20000 && !(outl.get(d.forn)?.d.vl >= d.vl)) outl.set(d.forn, { d, med }); }
    for (const { d, med } of outl.values()) out.push({ lvl: "warn", tag: "Fora do padrão", forn: d.forn, txt: `Empenho <b>${esc(d.nr)}</b> para <b>${esc(d.forn)}</b> de ${brl0(d.vl)}, mais de 3 vezes o valor típico desse fornecedor (${brl0(med)}).`, why: "Pode ser uma compra maior legítima. Confira o histórico do empenho no portal da Prefeitura.", score: d.vl });
    return out.sort((a, b) => b.score - a.score);
  }

  let contratos;
  const carregarContratos = () => (contratos ||= P.json("data/contratos.json", { cache: "no-cache" }).catch(() => []));

  P.tce = { ano, filtrar, soma, porChave, porMes, sinais, tipoCredor, carregarContratos, LIMITE_DISPENSA, SEM_DOC };
})();
