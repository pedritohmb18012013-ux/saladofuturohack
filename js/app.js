const App = {
  _shellNavReady: false,
  _navLoading: false,
  _authUser: null,
  _authPromise: null,
  _pendenciasResumo: null,
  _renderPendenciasModal: null,
  _pendenciasModalReady: false,
  _pendenciasResumoLoading: false,
  _scrollLockDepth: 0,

  getScrollRoot() {
    return document.querySelector('main.main') || document.scrollingElement || document.documentElement;
  },

  scrollToTop() {
    const root = App.getScrollRoot();
    if (root) root.scrollTop = 0;
    window.scrollTo(0, 0);
  },

  scrollElementIntoView(el, options = {}) {
    if (!el) return;
    const root = App.getScrollRoot();
    const behavior = options.behavior || 'smooth';
    const offset = options.offset ?? 12;

    if (root && root !== document.documentElement && root !== document.body) {
      const rootRect = root.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const top = elRect.top - rootRect.top + root.scrollTop - offset;
      root.scrollTo({ top: Math.max(0, top), behavior });
      return;
    }

    el.scrollIntoView({ behavior, block: options.block || 'start' });
  },

  lockPageScroll() {
    App._scrollLockDepth += 1;
    if (App._scrollLockDepth === 1) {
      document.documentElement.classList.add('scroll-locked');
    }
  },

  unlockPageScroll() {
    if (App._scrollLockDepth <= 0) return;
    App._scrollLockDepth -= 1;
    if (App._scrollLockDepth === 0) {
      document.documentElement.classList.remove('scroll-locked');
    }
  },

  releasePageScroll() {
    App._scrollLockDepth = 0;
    document.documentElement.classList.remove('scroll-locked');
  },

  syncOverlayScrollLock() {
    const overlayAberto = document.querySelector('.discord-popup-overlay.open, .exp-modal:not(.hidden)');
    if (overlayAberto) App.lockPageScroll();
    else App.releasePageScroll();
  },

  _consumeBootstrapUser() {
    try {
      const raw = sessionStorage.getItem('cmsp_user_bootstrap');
      if (!raw) return null;
      sessionStorage.removeItem('cmsp_user_bootstrap');
      const parsed = JSON.parse(raw);
      if (parsed?.user && Date.now() - (parsed.at || 0) < 120000) {
        return parsed.user;
      }
    } catch (error) {}
    return null;
  },

  setSessionUser(user) {
    this._authUser = user || null;
    if (user) this.aplicarUsuario(user);
  },

  clearSessionUser() {
    this._authUser = null;
    this._authPromise = null;
  },

  async requireAuth(options = {}) {
    const force = options.force === true;
    if (!force && this._authUser) return this._authUser;

    if (!force) {
      const bootstrap = this._consumeBootstrapUser();
      if (bootstrap) {
        this._authUser = bootstrap;
        this.aplicarUsuario(bootstrap);
        return bootstrap;
      }
    }

    if (!force && this._authPromise) return this._authPromise;

    this._authPromise = (async () => {
      try {
        const response = await fetch('/api/me', { credentials: 'same-origin' });
        if (!response.ok) {
          return null;
        }
        const data = await response.json();
        if (!data.logged_in || !data.user) {
          return null;
        }
        this._authUser = data.user;
        this.aplicarUsuario(data.user);
        return data.user;
      } catch (error) {
        return null;
      } finally {
        this._authPromise = null;
      }
    })();

    return this._authPromise;
  },

  async fetchJson(url, options = {}) {
    const response = await fetch(url, { credentials: 'same-origin', ...options });
    const text = await response.text();
    let data = {};
    if (text.trim()) {
      try {
        data = JSON.parse(text);
      } catch {
        throw new Error('Resposta inválida do servidor.');
      }
    } else if (!response.ok) {
      throw new Error(`Erro ${response.status}`);
    }
    if (!response.ok) {
      throw new Error(data.message || data.error || `Erro ${response.status}`);
    }
    return data;
  },

  bootPlatform(fetchData, onData, onError) {
    const fail = (error) => {
      if (onError) onError(error instanceof Error ? error : new Error(String(error || 'Erro ao carregar.')));
    };

    return this.requireAuth()
      .then(async (user) => {
        if (!user) {
          fail(new Error('Sessão expirada.'));
          return;
        }
        try {
          const data = await fetchData();
          onData(data);
        } catch (error) {
          fail(error);
        }
      })
      .catch(fail);
  },


  PEND_TTL: 5 * 60 * 1000,
  PEND_CHAVE: 'cmsp_pend',

  _lerPendCache() {
    try {
      const bruto = sessionStorage.getItem(this.PEND_CHAVE);
      if (!bruto) return null;
      const { em, dados } = JSON.parse(bruto);
      if (!em || Date.now() - em > this.PEND_TTL) return null;
      return dados;
    } catch {
      return null;
    }
  },

  _gravarPendCache(dados) {
    try {
      sessionStorage.setItem(this.PEND_CHAVE, JSON.stringify({ em: Date.now(), dados }));
    } catch {
    }
  },

  async invalidarPendencias() {
    this._pendenciasResumo = null;
    try { sessionStorage.removeItem(this.PEND_CHAVE); } catch { /* sem storage */ }
    await this.initPendenciasNav();
  },

  async initPendenciasNav() {
    if (!document.querySelector('.sidebar')) return;

    const doCache = this._pendenciasResumo || this._lerPendCache();
    if (doCache) {
      this.pintarPendenciasNav(doCache);
      return;
    }

    try {
      const response = await fetch('/api/inicio/resumo', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok || !data.success) return;
      const pend = data.pendencias || {};
      this.setPendenciasResumo(pend);
      this._gravarPendCache(pend);
      this.pintarPendenciasNav(pend);
    } catch {
    }
  },

  pintarPendenciasNav(pend) {
    const alvos = [['tarefas', pend?.tarefas], ['redacao', pend?.redacoes]];
    for (const [pagina, valor] of alvos) {
      const link = document.querySelector(`.sidebar .nav-link[data-page="${pagina}"]`);
      if (!link) continue;
      const n = Number(valor) || 0;
      let selo = link.querySelector('.nav-badge');
      if (!n) {
        if (selo) selo.remove();
        continue;
      }
      if (!selo) {
        selo = document.createElement('span');
        selo.className = 'nav-badge';
        link.appendChild(selo);
      }
      selo.textContent = n > 99 ? '99+' : String(n);
      selo.setAttribute('aria-label', `${n} pendente${n !== 1 ? 's' : ''}`);
    }
  },

  setPendenciasResumo(data) {
    this._pendenciasResumo = data || null;
  },

  registerPendenciasRenderer(fn) {
    if (typeof fn === 'function') this._renderPendenciasModal = fn;
  },

  async abrirModalPendencias() {
    const overlay = document.getElementById('pendenciasPopup');
    if (!overlay) return;

    if (!this._pendenciasResumo && !this._pendenciasResumoLoading) {
      this._pendenciasResumoLoading = true;
      try {
        const response = await fetch('/api/inicio/resumo', { credentials: 'same-origin' });
        const data = await response.json();
        if (response.ok && data.success) this.setPendenciasResumo(data.pendencias || {});
      } catch (error) {
      } finally {
        this._pendenciasResumoLoading = false;
      }
    }

    if (typeof this._renderPendenciasModal === 'function') {
      this._renderPendenciasModal(this._pendenciasResumo || {});
    }
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    App.lockPageScroll();
  },

  fecharModalPendencias() {
    const overlay = document.getElementById('pendenciasPopup');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    App.syncOverlayScrollLock();
  },

  initPendenciasModal() {
    if (this._pendenciasModalReady) return;
    this._pendenciasModalReady = true;

    const overlay = document.getElementById('pendenciasPopup');
    const closeBtn = document.getElementById('pendenciasPopupClose');
    if (!overlay || !closeBtn) return;

    closeBtn.addEventListener('click', () => this.fecharModalPendencias());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.fecharModalPendencias();
      if (e.target.closest('.pendencias-cat-go:not(.is-disabled)')) this.fecharModalPendencias();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) this.fecharModalPendencias();
    });
  },

  setFaltasResumo(data) {
    this._faltasResumo = data || null;
  },

  registerFaltasRenderer(fn) {
    if (typeof fn === 'function') this._renderFaltasModal = fn;
  },

  async abrirModalFaltas() {
    const overlay = document.getElementById('faltasPopup');
    if (!overlay) return;

    if (!this._faltasResumo && !this._faltasResumoLoading) {
      this._faltasResumoLoading = true;
      try {
        const response = await fetch('/api/inicio/resumo', { credentials: 'same-origin' });
        const data = await response.json();
        if (response.ok && data.success) this.setFaltasResumo(data.faltas || {});
      } catch (error) {
      } finally {
        this._faltasResumoLoading = false;
      }
    }

    if (typeof this._renderFaltasModal === 'function') {
      this._renderFaltasModal(this._faltasResumo || {});
    }
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
    App.lockPageScroll();
  },

  fecharModalFaltas() {
    const overlay = document.getElementById('faltasPopup');
    if (!overlay) return;
    overlay.classList.remove('open');
    overlay.setAttribute('aria-hidden', 'true');
    App.syncOverlayScrollLock();
  },

  initFaltasModal() {
    if (this._faltasModalReady) return;
    this._faltasModalReady = true;

    const overlay = document.getElementById('faltasPopup');
    const closeBtn = document.getElementById('faltasPopupClose');
    if (!overlay || !closeBtn) return;

    closeBtn.addEventListener('click', () => this.fecharModalFaltas());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) this.fecharModalFaltas();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && overlay.classList.contains('open')) this.fecharModalFaltas();
    });
  },

  aplicarUsuario(user) {
    const nome = user.nome || 'Usuário';
    const subtitulo = user.subtitulo || [user.turma, user.escola].filter(Boolean).join(' · ');
    const inicial = user.inicial || nome.charAt(0).toUpperCase();

    const avatar = document.getElementById('sidebarAvatar');
    const name = document.getElementById('sidebarName');
    const sub = document.getElementById('sidebarSub');
    if (avatar) avatar.textContent = inicial;
    if (name) name.textContent = nome.toUpperCase();
    if (sub) sub.textContent = subtitulo || 'Sala do Futuro';
  },

  marcarNavAtiva(pagina) {
    document.querySelectorAll('.nav-link[data-page]').forEach((link) => {
      link.classList.toggle('active', link.dataset.page === pagina);
    });
  },

  async aplicarPlataformasInativas() {
    if (App._plataformasAplicadas) return;
    App._plataformasAplicadas = true;
    try {
      const response = await fetch('/api/plataformas', { credentials: 'same-origin' });
      if (!response.ok) return;
      const data = await response.json();
      const apoiador = !!data.apoiador;
      const bloqueadas = (data.plataformas || [])
        .filter((p) => p.status !== 'online' || (p.apoiadorOnly && !apoiador))
        .map((p) => ({
          href: p.href,
          status: p.apoiadorOnly && !apoiador ? 'apoiador' : p.status,
        }));
      if (!bloqueadas.length) return;

      document.querySelectorAll('.nav-link[href]').forEach((link) => {
        const href = link.getAttribute('href');
        const match = bloqueadas.find((b) => b.href === href);
        if (!match) return;
        link.classList.add('is-disabled');
        link.setAttribute('aria-disabled', 'true');
        link.removeAttribute('href');
        if (!link.querySelector('.nav-soon')) {
          const badge = document.createElement('span');
          badge.className = 'nav-soon' + (match.status === 'update' ? ' is-update' : match.status === 'apoiador' ? ' is-apoiador' : '');
          badge.textContent = match.status === 'update' ? 'Update' : match.status === 'apoiador' ? 'Apoiador' : 'Em breve';
          link.appendChild(badge);
        }
      });
    } catch (error) {
    }
  },

  setModalProgress(modalEl, message, options = {}) {
    if (!modalEl) return;
    const bar = modalEl.querySelector('.exp-modal-bar');
    const fill = modalEl.querySelector('.exp-modal-bar-fill');
    const pct = modalEl.querySelector('.exp-modal-pct');
    if (!bar || !fill) return;

    let ratio = null;
    if (typeof options.ratio === 'number') {
      ratio = options.ratio;
    } else {
      const match = String(message || '').match(/(\d+)\s*\/\s*(\d+)/);
      if (match) {
        const atual = parseInt(match[1], 10);
        const total = parseInt(match[2], 10);
        if (total > 0) ratio = atual / total;
      }
    }
    if (options.done) ratio = 1;

    if (ratio === null) {
      bar.classList.add('indeterminate');
      fill.style.width = '';
      if (pct) pct.textContent = '';
      return;
    }

    ratio = Math.max(0, Math.min(1, ratio));
    bar.classList.remove('indeterminate');
    const porcento = Math.round(ratio * 100);
    fill.style.width = `${porcento}%`;
    if (pct) pct.textContent = `${porcento}%`;
  },

  resetModalProgress(modalEl) {
    if (!modalEl) return;
    const bar = modalEl.querySelector('.exp-modal-bar');
    const fill = modalEl.querySelector('.exp-modal-bar-fill');
    const pct = modalEl.querySelector('.exp-modal-pct');
    if (bar) bar.classList.add('indeterminate');
    if (fill) fill.style.width = '';
    if (pct) pct.textContent = '';
  },

  showExpModal(modalEl) {
    if (!modalEl) return;
    if (modalEl.parentElement !== document.body) {
      document.body.appendChild(modalEl);
    }
    modalEl.classList.remove('hidden');
    modalEl.setAttribute('aria-hidden', 'false');
    App.lockPageScroll();
  },

  hideExpModal(modalEl) {
    if (!modalEl) return;
    modalEl.classList.add('hidden');
    modalEl.setAttribute('aria-hidden', 'true');
    App.syncOverlayScrollLock();
  },

  bindLogout() {
    const btn = document.getElementById('btnLogout');
    if (!btn || btn.dataset.bound === '1') return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', async () => {
      const toastId = Notify.loading('Saindo...', 'Encerrando sessão');
      if (window.PendingJobs) {
        PendingJobs.clear();
        if (typeof PendingJobs.clearLogin === 'function') PendingJobs.clearLogin();
      }
      App.clearSessionUser();
      await fetch('/api/logout', { method: 'POST', credentials: 'same-origin' });
      Notify.success('Até logo!', toastId, 'Você saiu da conta');
      setTimeout(() => { window.location.replace('/'); }, 500);
    });
  },

  saudacao() {
    const hora = new Date().getHours();
    if (hora < 12) return 'Bom dia';
    if (hora < 18) return 'Boa tarde';
    return 'Boa noite';
  },

  ensureSiteCss(doc) {
    if (document.querySelector('link[href="css/site.css"]')) return;
    if (doc && !doc.querySelector('link[href="css/site.css"]')) return;
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'css/site.css';
    document.head.appendChild(link);
  },

  applyPageStyles(doc) {
    let el = document.getElementById('page-style');
    if (!el) {
      el = document.createElement('style');
      el.id = 'page-style';
      document.head.appendChild(el);
    }
    const style = doc.querySelector('head style');
    el.textContent = style ? style.textContent : '';
  },

  syncPageMeta(doc) {
    doc.querySelectorAll('head meta[name]').forEach((meta) => {
      const name = meta.getAttribute('name');
      if (!name) return;
      let existing = document.querySelector(`meta[name="${name}"]`);
      if (!existing) {
        existing = document.createElement('meta');
        existing.setAttribute('name', name);
        document.head.appendChild(existing);
      }
      const content = meta.getAttribute('content');
      if (content != null) existing.setAttribute('content', content);
    });
  },

  applyPageOverlays(doc) {
    document.querySelectorAll('[data-page-overlay]').forEach((el) => el.remove());
    doc.querySelectorAll('body > *').forEach((node) => {
      if (node.matches('.app, script')) return;
      const overlay = document.importNode(node, true);
      overlay.setAttribute('data-page-overlay', '1');
      document.body.appendChild(overlay);
    });
  },

  _isGlobalScriptLoaded(src) {
    if (!src) return false;
    const file = src.split('/').pop().split('?')[0];
    return [...document.scripts].some((script) => {
      if (!script.src) return false;
      return script.src.split('/').pop().split('?')[0] === file;
    });
  },

  async runPageScripts(doc) {
    document.querySelectorAll('script[data-page-script]').forEach((s) => s.remove());
    const scripts = [...doc.querySelectorAll('body > script')];
    const skipRescript = /(?:app|notifications|pending-jobs|ads|platform-captcha)\.js/;

    for (const old of scripts) {
      if (old.src && skipRescript.test(old.src) && this._isGlobalScriptLoaded(old.src)) continue;
      if (old.src && /turnstile\.js/.test(old.src) && window.TurnstileHelper) continue;

      await new Promise((resolve) => {
        const s = document.createElement('script');
        s.setAttribute('data-page-script', '1');
        if (old.src) {
          s.src = old.src;
          s.onload = () => resolve();
          s.onerror = () => resolve();
        } else {
          s.textContent = `(function(){\n${old.textContent}\n})();`;
        }
        document.body.appendChild(s);
        if (!old.src) resolve();
      });
    }
  },

  scrollToPlataformas() {
    requestAnimationFrame(() => {
      App.scrollElementIntoView(document.getElementById('plataformas'), { offset: 16 });
    });
  },

  normalizeNavPath(path) {
    const hashIndex = path.indexOf('#');
    let target = (hashIndex >= 0 ? path.slice(0, hashIndex) : path) || '/';
    let hash = hashIndex >= 0 ? path.slice(hashIndex) : '';
    if (target === '/' && hash === '#plataformas') {
      target = '/plataformas';
      hash = '';
    }
    return { target, hash };
  },

  closeShellOverlays() {
    document.querySelectorAll('.discord-popup-overlay.open').forEach((overlay) => {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
    });
    App.syncOverlayScrollLock();
  },

  async navigateTo(path, pushState = true) {
    const { target, hash } = App.normalizeNavPath(path);

    if (target === location.pathname && !hash && pushState) {
      if (target === '/plataformas') App.scrollToPlataformas();
      return;
    }
    if (App._navLoading) return;

    App.closeShellOverlays();
    document.querySelectorAll('body > .exp-modal').forEach((el) => el.remove());
    App.syncOverlayScrollLock();

    const main = document.querySelector('main.main');
    if (!main) {
      window.location.href = path;
      return;
    }

    const fetchPath = target;

    App._navLoading = true;
    try {
      const res = await fetch(fetchPath, { credentials: 'same-origin' });
      if (!res.ok) throw new Error('fetch failed');

      const html = await res.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const newMain = doc.querySelector('main.main');
      if (!newMain) throw new Error('no main');

      App.ensureSiteCss(doc);
      App.applyPageStyles(doc);
      App.syncPageMeta(doc);

      main.innerHTML = newMain.innerHTML;
      App.scrollToTop();
      if (doc.title) document.title = doc.title;

      App.applyPageOverlays(doc);
      await App.runPageScripts(doc);

      const pageMap = { '/': 'inicio', '/plataformas': 'plataformas', '/tarefas': 'tarefas', '/redacao': 'redacao', '/apostilas': 'apostilas', '/matific': 'plataformas', '/expansao': 'plataformas', '/alura': 'plataformas', '/leia': 'plataformas', '/speak': 'plataformas', '/khan': 'plataformas', '/open-english': 'plataformas', '/ed': 'plataformas', '/prepara': 'plataformas' };
      if (pageMap[target]) App.marcarNavAtiva(pageMap[target]);

      if (pushState) history.pushState({ shell: true }, '', target + hash);

      window.dispatchEvent(new CustomEvent('cmsp:navigated', { detail: { target, hash } }));

      if (target === '/plataformas') {
        App.scrollToPlataformas();
      } else if (hash) {
        requestAnimationFrame(() => {
          App.scrollElementIntoView(document.querySelector(hash), { offset: 16 });
        });
      }
    } catch {
      window.location.href = path;
    } finally {
      App._navLoading = false;
    }
  },

  initApostilasHint() {
    const link = document.querySelector('.nav-link[data-page="apostilas"]');
    if (!link || link.dataset.apostilasHintReady === '1') return;
    link.dataset.apostilasHintReady = '1';

    let hint = link.querySelector('.nav-apostilas-hint');
    if (!hint) {
      hint = document.createElement('div');
      hint.className = 'nav-apostilas-hint';
      hint.setAttribute('role', 'status');
      hint.textContent = 'Clique aqui para ver as apostilas';
      link.prepend(hint);
    }

    const mq = window.matchMedia('(max-width: 960px)');
    let hideTimer = null;

    const esconderHint = () => {
      if (hideTimer) {
        clearTimeout(hideTimer);
        hideTimer = null;
      }
      hint.classList.add('is-hidden');
    };

    const mostrarHint = () => {
      if (!mq.matches) return;
      if (hideTimer) clearTimeout(hideTimer);
      hint.classList.remove('is-hidden');
      hideTimer = setTimeout(esconderHint, 10000);
    };

    link.addEventListener('click', esconderHint);
    mq.addEventListener('change', () => {
      if (!mq.matches) esconderHint();
      else mostrarHint();
    });
    window.addEventListener('pageshow', () => mostrarHint());

    mostrarHint();
  },

  initShellNav() {
    if (!document.querySelector('.sidebar') || !document.querySelector('main.main')) return;
    if (App._shellNavReady) return;
    App._shellNavReady = true;

    const headStyle = document.querySelector('head > style:not(#page-style)');
    App.ensureSiteCss();
    if (headStyle && !document.getElementById('page-style')) {
      const pageStyle = document.createElement('style');
      pageStyle.id = 'page-style';
      pageStyle.textContent = headStyle.textContent;
      document.head.appendChild(pageStyle);
      headStyle.remove();
    }

    ['/images/cmsp.png', '/images/tarefasp.png', '/images/redacaosp.png', '/images/expansao.png', '/images/alura.png', '/images/leiasp.png', '/images/khan_academy.png', '/images/Ed-1.png', '/images/Prepara-1.png', '/images/speak.png?v=2'].forEach((src) => {
      const img = new Image();
      img.decoding = 'sync';
      img.src = src;
    });

    if (location.pathname === '/' && location.hash === '#plataformas') {
      history.replaceState({ shell: true }, '', '/plataformas');
      App.marcarNavAtiva('plataformas');
      App.scrollToPlataformas();
    } else if (location.pathname === '/plataformas') {
      if (!history.state?.shell) history.replaceState({ shell: true }, '', '/plataformas');
      App.marcarNavAtiva('plataformas');
      App.scrollToPlataformas();
    } else if (!history.state?.shell) {
      history.replaceState({ shell: true }, '', location.pathname + location.hash);
    }

    const routes = new Set(['/', '/plataformas', '/tarefas', '/redacao', '/apostilas', '/matific', '/expansao', '/alura', '/leia', '/speak', '/khan', '/open-english', '/ed', '/prepara']);

    document.addEventListener('click', (e) => {
      if (e.target.closest('#cardPendencias')) {
        App.abrirModalPendencias();
        return;
      }
      if (e.target.closest('#cardFaltas')) {
        App.abrirModalFaltas();
        return;
      }

      const link = e.target.closest('a[href]');
      if (!link || link.target === '_blank' || link.hasAttribute('download')) return;

      const href = link.getAttribute('href');
      if (!href || href.startsWith('javascript:')) return;

      let url;
      try {
        url = new URL(href, window.location.origin);
      } catch {
        return;
      }

      if (url.origin !== window.location.origin) return;
      if (!routes.has(url.pathname)) return;

      e.preventDefault();
      App.navigateTo(url.pathname + url.hash);
    });

    window.addEventListener('popstate', () => {
      if (!routes.has(location.pathname)) return;
      App.navigateTo(location.pathname + location.hash, false);
    });

    App.initApostilasHint();
    App.initPendenciasNav();
    if (document.getElementById('pendenciasPopup')) App.initPendenciasModal();
    App.aplicarPlataformasInativas();
  },
};

App.initShellNav();
