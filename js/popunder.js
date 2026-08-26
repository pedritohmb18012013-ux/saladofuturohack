(function (global) {
  const SESSION_KEY = 'cmsp_popunder_done';
  const DELAY_AFTER_INTERACTION = 8000;

  let verificando = false;

  async function buscarScript() {
    try {
      const response = await fetch('/api/popunder/status', { credentials: 'same-origin' });
      const data = await response.json();
      return data && data.enabled ? String(data.script || '') : null;
    } catch (_) {
      return null;
    }
  }

  function injetar(url) {
    try {
      sessionStorage.setItem(SESSION_KEY, '1');
    } catch (_) {}
    const s = document.createElement('script');
    s.src = url;
    s.async = true;
    s.setAttribute('data-cfasync', 'false');
    document.body.appendChild(s);
  }

  function aguardarInteracao(url) {
    let interagiu = false;

    function disparar() {
      global.removeEventListener('pointerdown', disparar);
      global.removeEventListener('keydown', disparar);
      global.removeEventListener('scroll', disparar, { capture: true });
      if (interagiu) return;
      interagiu = true;
      setTimeout(() => injetar(url), DELAY_AFTER_INTERACTION);
    }

    global.addEventListener('pointerdown', disparar);
    global.addEventListener('keydown', disparar);
    global.addEventListener('scroll', disparar, { capture: true });
  }

  async function verificar() {
    if (verificando) return;
    verificando = true;
    try {
      if (global.UsuarioApoiador) return;
      if (global.location.pathname === '/login') return;
      let usado = false;
      try { usado = !!sessionStorage.getItem(SESSION_KEY); } catch (_) {}
      if (usado) return;

      const url = await buscarScript();
      if (!url) return;
      aguardarInteracao(url);
    } finally {
      verificando = false;
    }
  }

  function init() {
    verificar();
  }

  global.addEventListener('cmsp:navigated', () => verificar());

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
