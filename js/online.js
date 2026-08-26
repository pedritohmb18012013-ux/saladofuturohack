(function () {
  var INTERVALO = 30000;
  var ultimo = 0;

  function ping() {
    var agora = Date.now();
    if (agora - ultimo < 5000) return;
    ultimo = agora;
    try {
      fetch('/api/online/ping', {
        method: 'POST',
        credentials: 'same-origin',
        cache: 'no-store',
      }).catch(function () {});
    } catch (_) {}
  }

  ping();
  setInterval(ping, INTERVALO);

  document.addEventListener('visibilitychange', function () {
    if (!document.hidden) ping();
  });
})();
