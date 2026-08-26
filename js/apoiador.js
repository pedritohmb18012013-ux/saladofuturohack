(function (global) {
  const APOIADOR_CLASS = 'apoiador';
  let _apoioData = null;

  function formatarMoeda(valor) {
    return 'R$ ' + Number(valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function renderApoioProgress() {
    const el = document.getElementById('apoioProgresso');
    if (!el || !_apoioData) return;
    const apoiador = !!_apoioData.apoiador;
    const total = Number(_apoioData.total) || 0;
    const target = Number(_apoioData.target) || 4.9;
    const falta = Math.max(0, target - total);
    const pct = Math.min(100, Math.round((total / target) * 100));

    const fill = document.getElementById('apoioFill');
    if (fill) {
      fill.style.width = pct + '%';
      fill.classList.toggle('is-full', apoiador);
    }
    const valor = document.getElementById('apoioValor');
    if (valor) valor.textContent = formatarMoeda(total) + ' de ' + formatarMoeda(target);

    const label = document.getElementById('apoioLabel');
    if (label) {
      label.textContent = apoiador
        ? 'Apoiador desbloqueado!'
        : 'Doe + ' + formatarMoeda(falta) + ' para desbloquear o Apoiador';
      label.classList.toggle('is-full', apoiador);
    }
    el.hidden = false;
  }

  function removerAdsDom() {
    document.querySelectorAll('.ad-slot, .ad-zone, .ad-sidebar-tower, [id^="container-"]').forEach((el) => el.remove());
  }

  function aplicar(apoiador) {
    if (!apoiador) return;
    global.UsuarioApoiador = true;
    document.documentElement.classList.add(APOIADOR_CLASS);
    removerAdsDom();
  }

  const apoioFetch = fetch('/api/doacoes/apoiador', { credentials: 'same-origin' })
    .then((response) => response.json())
    .catch(() => null);
  global.ApoiadorStatus = apoioFetch.then((data) => !!(data && data.apoiador));

  function init() {
    apoioFetch.then((data) => {
      _apoioData = data || {};
      aplicar(!!(data && data.apoiador));
      renderApoioProgress();
    });
  }

  global.addEventListener('cmsp:navigated', () => {
    if (global.UsuarioApoiador) removerAdsDom();
    if (_apoioData) renderApoioProgress();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
