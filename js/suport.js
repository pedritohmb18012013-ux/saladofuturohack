(function () {
  const estado = {
    ultimoId: 0,
    historicoCarregado: false,
    fonte: null,
    pendentesAluno: 0,
    chamado: null,
    status: 'aberto',
    avaliacao: null,
    lista: null,
    form: null,
    acao: null,
    painel: null,
    bolha: null,
    badge: null,
    naoLidas: 0,
  };
  const ANEXO_MAX_BYTES = 6 * 1024 * 1024;
  const URL_REGEX = /(https?:\/\/[^\s<>"']+)/g;
  // Chave PÚBLICA do VAPID — sem problema ficar no cliente (é o par privado
  // que precisa ficar só no servidor). Se gerar um par novo, troca aqui E no
  // .env (VAPID_PUBLIC_KEY) ao mesmo tempo, senão a inscrição não bate mais
  // com a chave que o servidor usa pra assinar o push.
  const VAPID_PUBLIC_KEY = 'BMSV5RFyOyOpoSDDU1XJkTxGUJwhReBQpu51xZ0EV6iDW7CSM83uNy8Jrh6hdAQlUUtwqmuMNblpxrynBzCzueI';
  // .gif (não .webp?animated=true) — suporte de animação em <img> pro webp
  // animado é inconsistente entre navegadores, .gif é universal.
  const ESTRELA_URL = 'https://cdn.discordapp.com/emojis/1536422479764004944.gif';
  const vistos = new Set();

  function estrelaImg(preenchida) {
    const img = document.createElement('img');
    img.src = ESTRELA_URL;
    img.alt = '';
    img.className = 'suporte-estrela-img' + (preenchida ? '' : ' suporte-estrela-vazia');
    return img;
  }

  function estrelasFixas(nota) {
    const container = el('div', 'suporte-estrelas-fixas');
    for (let n = 1; n <= 5; n++) container.appendChild(estrelaImg(n <= nota));
    return container;
  }

  function el(tag, cls, texto) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (texto != null) e.textContent = texto;
    return e;
  }

  // Negrito (**texto**) e link na mesma passada — sempre via createElement/
  // textContent, nunca innerHTML com texto de aluno/admin, pra não abrir XSS
  // (mesma regra de sempre deste arquivo, só ganhou negrito além do link).
  const INLINE_REGEX = /(\*\*([^*]+)\*\*)|(https?:\/\/[^\s<>"']+)/g;

  function renderInlineComFormatacao(container, texto) {
    let ultimo = 0;
    let m;
    INLINE_REGEX.lastIndex = 0;
    while ((m = INLINE_REGEX.exec(texto))) {
      if (m.index > ultimo) container.appendChild(document.createTextNode(texto.slice(ultimo, m.index)));
      if (m[1]) {
        const strong = document.createElement('strong');
        strong.textContent = m[2];
        container.appendChild(strong);
      } else {
        const a = document.createElement('a');
        a.href = m[3];
        a.textContent = m[3];
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
        container.appendChild(a);
      }
      ultimo = m.index + m[0].length;
    }
    if (ultimo < texto.length) container.appendChild(document.createTextNode(texto.slice(ultimo)));
  }

  // Um subconjunto pequeno da formatação do Discord (o suficiente pro que o
  // suporte de verdade usa lá: cabeçalho #/##/###, subtexto -#, lista -, e
  // **negrito**) — linha por linha, porque cada uma pode ter um estilo
  // diferente (não dá pra misturar tamanho de fonte dentro do mesmo nó de
  // texto). Cada linha vira um <div> próprio; cabeçalho/subtexto nunca leva
  // marcador (#, -#) pro texto visível, só estiliza.
  function renderTextoFormatado(container, texto) {
    const linhas = String(texto).split('\n');
    linhas.forEach((linha, i) => {
      if (linha.trim() === '') {
        if (i > 0 && i < linhas.length - 1) container.appendChild(el('div', 'suporte-msg-linha-vazia'));
        return;
      }
      let classe = 'suporte-msg-linha';
      let corpo = linha;
      if (/^-#\s+/.test(linha)) {
        classe = 'suporte-msg-subtexto';
        corpo = linha.replace(/^-#\s+/, '');
      } else if (/^###\s+/.test(linha)) {
        classe = 'suporte-msg-h3';
        corpo = linha.replace(/^###\s+/, '');
      } else if (/^##\s+/.test(linha)) {
        classe = 'suporte-msg-h2';
        corpo = linha.replace(/^##\s+/, '');
      } else if (/^#\s+/.test(linha)) {
        classe = 'suporte-msg-h1';
        corpo = linha.replace(/^#\s+/, '');
      } else if (/^-\s+/.test(linha)) {
        classe = 'suporte-msg-item';
        corpo = '•  ' + linha.replace(/^-\s+/, '');
      }
      const elLinha = el('div', classe);
      renderInlineComFormatacao(elLinha, corpo);
      container.appendChild(elLinha);
    });
  }

  function renderMensagem(msg) {
    if (msg.id != null) {
      if (vistos.has(msg.id)) return;
      vistos.add(msg.id);
    }
    const vazio = estado.lista.querySelector('.suporte-vazio');
    if (vazio) vazio.remove();
    const bolha = el('div', 'suporte-msg suporte-msg-' + (msg.remetente === 'admin' ? 'admin' : 'aluno'));

    if (msg.anexo_url) {
      const link = document.createElement('a');
      link.className = 'suporte-msg-anexo-link';
      link.href = msg.anexo_url;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      const img = document.createElement('img');
      img.src = msg.anexo_url;
      img.className = 'suporte-msg-img';
      img.loading = 'lazy';
      link.appendChild(img);
      bolha.appendChild(link);
    }

    if (msg.texto) {
      const texto = el('div', 'suporte-msg-texto');
      renderTextoFormatado(texto, msg.texto);
      bolha.appendChild(texto);
    }

    estado.lista.appendChild(bolha);
    estado.lista.scrollTop = estado.lista.scrollHeight;
  }

  function limparConversa() {
    estado.lista.innerHTML = '';
    estado.lista.appendChild(el('div', 'suporte-vazio', 'Manda sua dúvida que a gente responde por aqui.'));
    vistos.clear();
    estado.ultimoId = 0;
    estado.pendentesAluno = 0;
  }

  function renderAcao() {
    const acao = estado.acao;
    const form = estado.form;
    acao.innerHTML = '';

    if (estado.status === 'trancado') {
      form.style.display = 'none';
      acao.style.display = 'flex';
      acao.appendChild(el('div', 'suporte-acao-texto', 'Este chamado foi trancado pelo suporte.'));
      const btn = el('button', 'suporte-acao-btn', 'Solicitar reabertura');
      btn.type = 'button';
      btn.addEventListener('click', () => solicitarReabertura(btn));
      acao.appendChild(btn);
      return;
    }

    if (estado.status === 'encerrado') {
      form.style.display = 'none';
      acao.style.display = 'flex';
      acao.appendChild(el('div', 'suporte-acao-texto', 'Chamado encerrado.'));

      if (estado.avaliacao) {
        acao.appendChild(estrelasFixas(estado.avaliacao));
      } else {
        // Todas cinzas até avaliar; as N escolhidas ganham cor (e o resto
        // fica cinza) só depois. O preview no hover/foco existe pra o cinza
        // parecer "ainda não escolhi" em vez de "imagem quebrada".
        const estrelas = el('div', 'suporte-estrelas');
        const pintar = (ate) => {
          Array.prototype.forEach.call(estrelas.children, (btn, i) => {
            btn.firstChild.classList.toggle('suporte-estrela-vazia', i >= ate);
          });
        };
        for (let n = 1; n <= 5; n++) {
          const s = el('button', 'suporte-estrela');
          s.type = 'button';
          s.setAttribute('aria-label', `${n} de 5`);
          s.appendChild(estrelaImg(false));
          s.addEventListener('mouseenter', () => pintar(n));
          s.addEventListener('focus', () => pintar(n));
          s.addEventListener('click', () => avaliar(n, estrelas));
          estrelas.appendChild(s);
        }
        estrelas.addEventListener('mouseleave', () => pintar(0));
        acao.appendChild(estrelas);
      }

      const novoBtn = el('button', 'suporte-acao-btn', 'Abrir novo chamado');
      novoBtn.type = 'button';
      novoBtn.addEventListener('click', () => criarNovoChamado(novoBtn));
      acao.appendChild(novoBtn);
      return;
    }

    form.style.display = 'flex';
    acao.style.display = 'none';
  }

  function aplicarEstado(novo) {
    const chamadoMudou = estado.chamado != null && novo.chamado !== estado.chamado;
    estado.chamado = novo.chamado;
    estado.status = novo.status;
    estado.avaliacao = novo.avaliacao;
    if (chamadoMudou) limparConversa();
    renderAcao();
  }

  async function solicitarReabertura(btn) {
    btn.disabled = true;
    btn.textContent = 'Enviando...';
    try {
      const r = await fetch('/api/suporte/solicitar-reabertura', { method: 'POST', credentials: 'same-origin' });
      const data = await r.json();
      if (r.ok && data.success) {
        btn.textContent = 'Pedido enviado';
        return;
      }
    } catch (_) {}
    btn.disabled = false;
    btn.textContent = 'Solicitar reabertura';
  }

  async function avaliar(nota, estrelasEl) {
    Array.prototype.forEach.call(estrelasEl.children, (s) => (s.disabled = true));
    try {
      const r = await fetch('/api/suporte/avaliar', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nota }),
      });
      const data = await r.json();
      if (r.ok && data.success) {
        estado.avaliacao = nota;
        estrelasEl.replaceWith(estrelasFixas(nota));
        return;
      }
    } catch (_) {}
    Array.prototype.forEach.call(estrelasEl.children, (s) => (s.disabled = false));
  }

  async function criarNovoChamado(btn) {
    btn.disabled = true;
    btn.textContent = 'Abrindo...';
    try {
      const r = await fetch('/api/suporte/novo-chamado', { method: 'POST', credentials: 'same-origin' });
      const data = await r.json();
      if (r.ok && data.success) return; // aplicarEstado() reage via SSE
    } catch (_) {}
    btn.disabled = false;
    btn.textContent = 'Abrir novo chamado';
  }

  function painelFechado() {
    return !estado.painel || estado.painel.style.display === 'none';
  }

  // Bolinha vermelha com a contagem de respostas não lidas, na bolha
  // fechada. Só conta o que chega COM O PAINEL FECHADO — mensagem que o
  // aluno viu chegar na tela não é "não lida". Zera ao abrir o painel.
  function atualizarBadge() {
    if (!estado.badge) return;
    if (estado.naoLidas > 0) {
      estado.badge.textContent = estado.naoLidas > 9 ? '9+' : String(estado.naoLidas);
      estado.badge.style.display = 'flex';
    } else {
      estado.badge.style.display = 'none';
      estado.bolha?.classList.remove('suporte-bolha-alerta');
    }
  }

  function marcarNaoLida() {
    estado.naoLidas++;
    atualizarBadge();
    // Reinicia a animação a cada mensagem nova: só `classList.add` não
    // repulsa se a classe já estiver lá (a 2ª resposta seguida passaria
    // despercebida). Remover + forçar reflow + readicionar é o jeito de
    // fazer o navegador rodar o keyframe de novo.
    const bolha = estado.bolha;
    if (!bolha) return;
    bolha.classList.remove('suporte-bolha-alerta');
    void bolha.offsetWidth;
    bolha.classList.add('suporte-bolha-alerta');
  }

  function zerarNaoLidas() {
    if (estado.naoLidas === 0) return;
    estado.naoLidas = 0;
    atualizarBadge();
  }

  let swPronto = false;

  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker
      .register('/sw.js')
      .then(() => {
        swPronto = true;
      })
      .catch(() => {});
    navigator.serviceWorker.addEventListener('message', (ev) => {
      const tipo = ev.data && ev.data.tipo;
      if (tipo === 'suporte-notificacao-clicada' && painelFechado() && estado.bolha) {
        estado.bolha.click();
        return;
      }
      // Resposta nova chegou por push. Com o painel FECHADO é só acender a
      // bolinha (não há SSE aberto pra trazer a mensagem — de propósito);
      // com o painel ABERTO o SSE já está conectado e vai renderizar, então
      // aqui não se faz nada pra não contar duas vezes.
      if (tipo === 'suporte-mensagem-nova' && painelFechado()) marcarNaoLida();
    });
  }

  function urlBase64ToUint8Array(base64) {
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const base64Normal = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
    const bruto = atob(base64Normal);
    const saida = new Uint8Array(bruto.length);
    for (let i = 0; i < bruto.length; i++) saida[i] = bruto.charCodeAt(i);
    return saida;
  }

  // Inscrição de Web Push — funciona mesmo com o navegador fechado (diferente
  // do SSE + Notification local, que precisa da aba aberta). Chamada depois
  // que a permissão de notificação é concedida; idempotente (getSubscription
  // primeiro, só cria uma nova se ainda não tiver).
  async function inscreverPush() {
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    try {
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
        });
      }
      await fetch('/api/suporte/push-subscribe', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub.toJSON()),
      });
    } catch (_) {}
  }

  // Só notifica quem já autorizou (pedido no primeiro clique na bolha) e só
  // quando o aluno não está OLHANDO a resposta agora (aba escondida OU
  // painel fechado) — senão vira notificação redundante de algo que já tá
  // vendo na tela.
  //
  // Android (Chrome/Firefox mobile) BLOQUEIA `new Notification()` chamado
  // direto da página ("Illegal constructor") — só aceita via
  // `registration.showNotification()`, que precisa de um Service Worker
  // ativo (sw.js). Por isso o caminho preferido é sempre pelo SW quando
  // registrado; `new Notification()` fica só de fallback pra quando o SW
  // ainda não terminou de registrar (janela bem curta, na prática nunca
  // chega a notificar antes disso) ou não é suportado.
  function tentarNotificar(msg) {
    if (typeof Notification === 'undefined' || Notification.permission !== 'granted') return;
    if (!document.hidden && !painelFechado()) return;
    const opcoes = {
      body: msg.texto || 'Nova mensagem no chat de suporte.',
      icon: '/images/zunder-notificacao-192.png',
      badge: '/images/zunder-selo-96.png',
      tag: 'suporte-cmsp',
    };
    if (swPronto) {
      navigator.serviceWorker.ready.then((reg) => reg.showNotification('Suporte respondeu', opcoes)).catch(() => {});
      return;
    }
    try {
      const notif = new Notification('Suporte respondeu', opcoes);
      notif.onclick = () => {
        window.focus();
        if (painelFechado() && estado.bolha) estado.bolha.click();
        notif.close();
      };
    } catch (_) {}
  }

  function abrirStream() {
    if (estado.fonte) return;
    try {
      const fonte = new EventSource('/api/suporte/stream?desde=' + estado.ultimoId);
      fonte.addEventListener('mensagem', (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          estado.ultimoId = Math.max(estado.ultimoId, msg.id);
          // Eco da PRÓPRIA mensagem do aluno (o servidor avisa o SSE depois
          // de qualquer envio, inclusive o nosso, pra outras abas/aparelhos
          // ficarem sincronizados). Se tem envio nosso pendente de
          // confirmação, este eco É essa confirmação — já foi mostrado
          // otimisticamente na hora do clique, então só marca como visto
          // (pro reconnect não redesenhar) sem desenhar de novo. Contador em
          // vez de comparar id: o id só existe depois que a resposta do
          // POST chega, e o eco do SSE pode chegar ANTES dessa resposta —
          // depender de id pra saber "é meu" tem essa corrida.
          if (msg.remetente === 'aluno' && estado.pendentesAluno > 0) {
            estado.pendentesAluno--;
            vistos.add(msg.id);
            return;
          }
          renderMensagem(msg);
          if (msg.remetente === 'admin') {
            if (painelFechado()) marcarNaoLida();
            tentarNotificar(msg);
          }
        } catch (_) {}
      });
      fonte.addEventListener('status', (ev) => {
        try {
          aplicarEstado(JSON.parse(ev.data));
        } catch (_) {}
      });
      fonte.onerror = () => {};
      estado.fonte = fonte;
    } catch (_) {}
  }

  function fecharStream() {
    if (estado.fonte) {
      estado.fonte.close();
      estado.fonte = null;
    }
  }

  async function carregarHistorico() {
    try {
      const r = await fetch('/api/suporte/historico', { credentials: 'same-origin' });
      const data = await r.json();
      if (!data.success) return;
      data.mensagens.forEach((m) => {
        renderMensagem(m);
        estado.ultimoId = Math.max(estado.ultimoId, m.id);
      });
      estado.historicoCarregado = true;
      aplicarEstado({ chamado: data.chamado, status: data.status, avaliacao: data.avaliacao });
      abrirStream();
    } catch (_) {}
  }

  async function enviarMensagem(texto) {
    renderMensagem({ remetente: 'aluno', texto });
    estado.pendentesAluno++;
    try {
      const r = await fetch('/api/suporte/mensagem', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texto }),
      });
      const data = await r.json();
      if (r.ok && data.success) {
        estado.ultimoId = Math.max(estado.ultimoId, data.mensagem.id);
        return;
      }
      estado.pendentesAluno--;
      renderMensagem({ remetente: 'admin', texto: data.message || 'Não deu pra enviar. Tenta de novo.' });
    } catch (_) {
      estado.pendentesAluno--;
      renderMensagem({ remetente: 'admin', texto: 'Sem conexão — tenta de novo.' });
    }
  }

  async function enviarAnexo(arquivo, legenda) {
    if (arquivo.size > ANEXO_MAX_BYTES) {
      renderMensagem({ remetente: 'admin', texto: 'Imagem muito grande (máx. 6MB).' });
      return;
    }
    renderMensagem({ remetente: 'aluno', texto: legenda, anexo_url: URL.createObjectURL(arquivo) });
    estado.pendentesAluno++;
    try {
      const fd = new FormData();
      fd.append('arquivo', arquivo);
      if (legenda) fd.append('texto', legenda);
      const r = await fetch('/api/suporte/anexo', { method: 'POST', credentials: 'same-origin', body: fd });
      const data = await r.json();
      if (r.ok && data.success) {
        estado.ultimoId = Math.max(estado.ultimoId, data.mensagem.id);
        return;
      }
      estado.pendentesAluno--;
      renderMensagem({ remetente: 'admin', texto: data.message || 'Não deu pra enviar a imagem.' });
    } catch (_) {
      estado.pendentesAluno--;
      renderMensagem({ remetente: 'admin', texto: 'Sem conexão — tenta de novo.' });
    }
  }

  // Balão "Precisa de ajuda? Clique aqui" acima da bolha — mesmo padrão do
  // balão de Apostilas na barra de navegação (js/app.js:initApostilasHint):
  // só mobile, reaparece a cada pageshow, some sozinho em 10s ou no clique.
  function inicializarDica(bolha) {
    const mq = window.matchMedia('(max-width: 960px)');
    const dica = el('div', 'suporte-hint is-hidden', 'Precisa de ajuda? Clique aqui');
    dica.setAttribute('role', 'status');
    document.body.appendChild(dica);

    let hideTimer = null;
    const esconder = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      dica.classList.add('is-hidden');
    };
    const mostrar = () => {
      if (!mq.matches) return;
      if (hideTimer) clearTimeout(hideTimer);
      dica.classList.remove('is-hidden');
      hideTimer = setTimeout(esconder, 10000);
    };

    bolha.addEventListener('click', esconder);
    mq.addEventListener('change', () => {
      if (!mq.matches) esconder();
      else mostrar();
    });
    window.addEventListener('pageshow', mostrar);
    mostrar();
  }

  function montarWidget() {
    const bolha = el('button', 'suporte-bolha');
    bolha.type = 'button';
    bolha.setAttribute('aria-label', 'Suporte');
    bolha.innerHTML =
      '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

    const badge = el('span', 'suporte-badge');
    badge.style.display = 'none';
    badge.setAttribute('aria-hidden', 'true');
    bolha.appendChild(badge);

    const painel = el('div', 'suporte-painel');
    painel.style.display = 'none';

    const header = el('div', 'suporte-header');
    header.appendChild(el('span', null, 'Suporte'));
    const fechar = el('button', 'suporte-fechar', '×');
    fechar.type = 'button';
    fechar.setAttribute('aria-label', 'Fechar');
    header.appendChild(fechar);

    const lista = el('div', 'suporte-mensagens');
    lista.appendChild(el('div', 'suporte-vazio', 'Manda sua dúvida que a gente responde por aqui.'));

    const acao = el('div', 'suporte-acao');
    acao.style.display = 'none';

    const form = el('form', 'suporte-form');

    const anexarBtn = el('button', 'suporte-anexar');
    anexarBtn.type = 'button';
    anexarBtn.setAttribute('aria-label', 'Anexar imagem');
    anexarBtn.innerHTML = '<img src="/images/anexar-imagem.png" alt="" width="20" height="20">';

    const arquivoInput = document.createElement('input');
    arquivoInput.type = 'file';
    arquivoInput.accept = 'image/png,image/jpeg,image/webp,image/gif';
    arquivoInput.style.display = 'none';

    const input = el('textarea', 'suporte-input');
    input.placeholder = 'Escreva sua mensagem...';
    input.rows = 1;
    const enviar = el('button', 'suporte-enviar');
    enviar.type = 'submit';
    enviar.setAttribute('aria-label', 'Enviar');
    enviar.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><path d="M3.4 20.6l17.45-8.11a1 1 0 0 0 0-1.8L3.4 2.58a1 1 0 0 0-1.4 1.05l1.6 7.1 10 1.27-10 1.27-1.6 7.1a1 1 0 0 0 1.4 1.05z"/></svg>';

    form.appendChild(anexarBtn);
    form.appendChild(arquivoInput);
    form.appendChild(input);
    form.appendChild(enviar);

    painel.appendChild(header);
    painel.appendChild(lista);
    painel.appendChild(acao);
    painel.appendChild(form);

    document.body.appendChild(painel);
    document.body.appendChild(bolha);

    estado.lista = lista;
    estado.form = form;
    estado.acao = acao;
    estado.painel = painel;
    estado.bolha = bolha;
    estado.badge = badge;

    inicializarDica(bolha);

    bolha.addEventListener('click', () => {
      const abrindo = painel.style.display === 'none';
      painel.style.display = abrindo ? 'flex' : 'none';
      bolha.classList.toggle('suporte-bolha-ativa', abrindo);
      if (abrindo) {
        zerarNaoLidas();
        // O SSE vive só enquanto o painel está aberto (ver comentário em
        // iniciar()). Na primeira abertura carrega o histórico, que abre o
        // stream no fim; nas seguintes só reabre o stream.
        if (!estado.historicoCarregado) carregarHistorico();
        else abrirStream();
        estado.lista.scrollTop = estado.lista.scrollHeight;
      } else {
        fecharStream();
      }
      // Pedido de permissão de notificação precisa vir de um gesto do
      // usuário — o clique na bolha é o gesto natural mais cedo que existe.
      if (abrindo && typeof Notification !== 'undefined') {
        if (Notification.permission === 'default') {
          Notification.requestPermission()
            .then((perm) => {
              if (perm === 'granted') inscreverPush();
            })
            .catch(() => {});
        } else if (Notification.permission === 'granted') {
          inscreverPush(); // idempotente — garante que a inscrição existe mesmo se a permissão já vinha de antes
        }
      }
    });

    fechar.addEventListener('click', () => bolha.click());

    const limparInput = () => {
      input.value = '';
      input.style.height = 'auto';
      input.style.overflowY = 'hidden';
    };

    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      const texto = input.value.trim();
      if (!texto) return;
      limparInput();
      enviarMensagem(texto);
    });

    anexarBtn.addEventListener('click', () => arquivoInput.click());

    arquivoInput.addEventListener('change', () => {
      const arquivo = arquivoInput.files[0];
      arquivoInput.value = '';
      if (!arquivo) return;
      const legenda = input.value.trim();
      limparInput();
      enviarAnexo(arquivo, legenda);
    });

    input.addEventListener('input', () => {
      input.style.height = 'auto';
      const alvo = Math.min(input.scrollHeight, 96);
      input.style.height = alvo + 'px';
      input.style.overflowY = input.scrollHeight > 96 ? 'auto' : 'hidden';
    });

    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.shiftKey) {
        ev.preventDefault();
        form.requestSubmit();
      }
    });
  }

  async function iniciar() {
    try {
      const r = await fetch('/api/me', { credentials: 'same-origin' });
      const data = await r.json();
      if (!data.logged_in) return;
      montarWidget();
      registrarServiceWorker();
      // NÃO abre SSE nem carrega histórico aqui de propósito. Já foi assim
      // (pra notificar em qualquer página) e custava caro demais: medido com
      // o volume real do site — ~63 mil queries/dia no Postgres e uma
      // conexão persistente por aba, ~400 no pico — logo depois de um
      // travamento por pico de carga (10/08). Hoje quem avisa fora do chat é
      // o Web Push, que funciona até com o navegador FECHADO (o SSE nunca
      // funcionou) e não custa nada enquanto ninguém escreve: o Service
      // Worker recebe o push e manda `suporte-mensagem-nova` pras abas
      // abertas, que só acendem a bolinha. O SSE sobe apenas quando o aluno
      // abre o painel, que é quando ele precisa das mensagens ao vivo.
      // Contrapartida aceita: quem NEGA a permissão de notificação não vê a
      // bolinha enquanto navega por outras páginas.
      //
      // A inscrição de push também NÃO é renovada aqui: ela vive no
      // Postgres e não expira sozinha, então refazer a cada página seria um
      // upsert + um delete por carregamento — metade do custo que esta
      // mudança existe pra eliminar. Quem (re)inscreve é a abertura do
      // painel; se a linha sumir do banco (limpeza por 410, aluno trocou de
      // aparelho), o próximo clique na bolha reinscreve sozinho.
    } catch (_) {}
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', iniciar);
  } else {
    iniciar();
  }
})();
