/* Área reservada: cruzamento de sócios de fornecedores com a folha.
   O arquivo data/reservado.json vem criptografado (AES-256-GCM, chave PBKDF2-SHA256 a partir da senha).
   A senha é digitada aqui e usada só na memória do navegador: não é salva nem enviada a lugar nenhum. */
(function () {
  const P = window.Prefita, { fmt } = P;
  const cnpjFmt = (c) => String(c).replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
  const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const NIVEL = { forte: ["Forte", "crit"], medio: ["Médio", "warn"], fraco: ["Fraco", "neutral"] };
  let aberto = null; // conteúdo decifrado, só enquanto a página estiver aberta

  async function decifrar(pacote, senha) {
    const base = await crypto.subtle.importKey("raw", new TextEncoder().encode(senha), "PBKDF2", false, ["deriveKey"]);
    const chave = await crypto.subtle.deriveKey({ name: "PBKDF2", hash: "SHA-256", salt: b64(pacote.sal), iterations: pacote.iter },
      base, { name: "AES-GCM", length: 256 }, false, ["decrypt"]);
    const claro = await crypto.subtle.decrypt({ name: "AES-GCM", iv: b64(pacote.iv) }, chave, b64(pacote.dados));
    return JSON.parse(new TextDecoder().decode(claro));
  }

  P.registrarSecao({
    id: "reservado",
    titulo: "Área reservada",
    tituloCurto: "Reservado",
    icone: "lock",
    ordem: 99,
    fonte: "Acesso com senha",
    descricao: "Cruzamento dos sócios dos fornecedores com os nomes da folha de pagamento. O conteúdo fica criptografado e só abre com a senha.",
    async render(el) {
      if (aberto) return mostrar(el, aberto);
      let pacote = null;
      try { pacote = await (await fetch("data/reservado.json", { cache: "no-cache" })).json(); } catch (e) {}
      if (!pacote || !pacote.dados) {
        el.innerHTML = `<div class="notice">${P.ico("lock")}<span>A área reservada ainda não foi gerada. Ela aparece depois que a senha for cadastrada no GitHub (secret <b>PREFITA_SENHA</b>) e a coleta diária rodar.</span></div>`;
        return;
      }
      el.innerHTML = `
        <section class="panel" style="max-width:520px">
          <div class="hd"><h2>${P.ico("lock")} Digite a senha</h2></div>
          <form data-form style="display:flex;gap:8px;flex-wrap:wrap">
            <input type="password" data-senha autocomplete="current-password" required placeholder="Senha da área reservada"
              style="flex:1;min-width:200px;height:34px;background:var(--surface-2);border:1px solid var(--line);border-radius:var(--r-sm);padding:0 10px;color:var(--ink)">
            <button class="btn primary" type="submit">Abrir</button>
          </form>
          <small class="muted" data-msg>A senha não sai do seu navegador.</small>
        </section>`;
      const form = el.querySelector("[data-form]"), msg = el.querySelector("[data-msg]");
      form.onsubmit = async (ev) => {
        ev.preventDefault();
        const btn = form.querySelector("button"); btn.disabled = true; msg.textContent = "Abrindo…";
        try {
          aberto = await decifrar(pacote, form.querySelector("[data-senha]").value);
          mostrar(el, aberto);
        } catch (e) {
          msg.textContent = "Senha incorreta."; btn.disabled = false;
        }
      };
    },
  });

  function mostrar(el, d) {
    const achados = d.achados || [];
    const st = { nivel: "", busca: "" };
    const n = (k) => achados.filter((a) => a.nivel === k).length;
    el.innerHTML = `
      <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;align-items:center;margin-bottom:14px">
        <small class="muted">Gerado em ${new Date(d.gerado).toLocaleString("pt-BR")} · ${fmt.num(d.empresas)} empresas x ${fmt.num(d.servidores)} pessoas da folha (2024 em diante)</small>
        <button class="btn sm" type="button" data-trancar>${P.ico("lock")} Trancar</button>
      </div>
      <div class="alert crit" style="margin-bottom:18px"><div class="ic">${P.ico("alert")}</div>
        <div class="lbl">Indícios para verificação, não acusações</div>
        <p>Cada linha é uma coincidência de dados públicos. Antes de qualquer conclusão ou divulgação, confirme em fonte oficial. Não compartilhe esta lista: ela tem nome de pessoas e pode haver homônimos.</p>
        <small><b>Forte:</b> nome igual e CPF compatível (os dígitos que a Receita mostra batem com os que o portal mostra). <b>Médio:</b> nome igual, sem como conferir o CPF. <b>Fraco:</b> só sobrenomes iguais, em empresa de Itaberá; parentesco não é dado público.</small>
      </div>
      <div class="filters">
        <label>Nível<select data-f="nivel"><option value="">Todos (${achados.length})</option><option value="forte">Forte (${n("forte")})</option><option value="medio">Médio (${n("medio")})</option><option value="fraco">Fraco (${n("fraco")})</option></select></label>
        <label style="flex:1;min-width:200px">Buscar<input type="search" data-f="busca" placeholder="Empresa, pessoa, cargo ou secretaria"></label>
      </div>
      <section class="panel" style="margin-top:18px"><div class="hd"><h2>Indícios</h2><span>Mais fortes primeiro</span></div><div data-tabela></div></section>
      <section class="panel" style="margin-top:18px"><div class="hd"><h2>Como verificar</h2></div>
        <ol style="margin:0;padding-left:20px;display:flex;flex-direction:column;gap:6px;font-size:14px">
          <li>Confira os sócios no cartão CNPJ da <a href="https://solucoes.receita.fazenda.gov.br/servicos/cnpjreva/cnpjreva_solicitacao.asp" target="_blank" rel="noopener">Receita Federal</a> e na ficha cadastral da <a href="https://www.jucesponline.sp.gov.br/" target="_blank" rel="noopener">JUCESP</a> (gratuita).</li>
          <li>Veja o cargo e a data de nomeação do servidor no <a href="https://fiorilli.itabera.online/transparencia/" target="_blank" rel="noopener">portal da Prefeitura</a> e no Diário Oficial.</li>
          <li>Veja se o servidor atuou na licitação ou no contrato (comissão, fiscal, secretaria que pediu). A Lei 14.133, art. 9º e 14, proíbe esse tipo de vínculo; nepotismo em cargo de confiança segue a Súmula Vinculante 13 do STF.</li>
          <li>Se houver indício concreto, o caminho é representar ao Ministério Público de SP, ao TCE-SP ou à Câmara, com os documentos.</li>
        </ol>
      </section>`;
    const q = (s) => el.querySelector(s);
    q("[data-trancar]").onclick = () => { aberto = null; P.secoes.find((s) => s.id === "reservado")._feito = false; P.irPara("reservado"); };
    function desenhar() {
      const b = st.busca.trim().toLowerCase();
      const f = achados.filter((a) => (!st.nivel || a.nivel === st.nivel) &&
        (!b || [a.empresa, a.pessoa, a.servidor, a.cargo, a.sec, a.cnpj].some((x) => (x || "").toLowerCase().includes(b))));
      P.tabela(q("[data-tabela]"), [
        { t: "Nível", k: (a) => ({ forte: 3, medio: 2, fraco: 1 })[a.nivel], f: (v, a) => `<span class="badge ${NIVEL[a.nivel][1]}">${NIVEL[a.nivel][0]}</span>` },
        { t: "Empresa", k: "empresa", f: (v, a) => `<b>${fmt.esc(v)}</b>${a.cnpj ? `<br><small class="muted mono">${cnpjFmt(a.cnpj)}</small>` : ""}${a.cidade ? ` <small class="muted">· ${fmt.esc(a.cidade)}</small>` : ""}` },
        { t: "Na empresa", k: "pessoa", f: (v, a) => `${fmt.esc(v)}<br><small class="muted">${fmt.esc(a.papel)}</small>` },
        { t: "Na folha", k: "servidor", f: (v, a) => `${fmt.esc(v)}<br><small class="muted">${fmt.esc(a.cargo)} · ${fmt.esc(a.sec)}</small><br><small class="muted">${fmt.esc(a.vinc)}${a.admissao ? `, desde ${fmt.data(a.admissao)}` : ""}${a.ativo ? "" : ` · <b>não aparece desde ${fmt.mes(a.mes)}</b>`}</small>` },
        { t: "Por quê", k: "motivo", f: (v) => `<small>${fmt.esc(v)}</small>` },
        { t: "Empenhado", k: "valor", r: true, f: (v) => fmt.brl(v) },
      ], f, { ordem: 0, vazio: "Nenhum indício com esses filtros." });
    }
    q("[data-f=nivel]").onchange = (e) => { st.nivel = e.target.value; desenhar(); };
    let t; q("[data-f=busca]").oninput = (e) => { clearTimeout(t); t = setTimeout(() => { st.busca = e.target.value; desenhar(); }, 200); };
    desenhar();
  }
})();
