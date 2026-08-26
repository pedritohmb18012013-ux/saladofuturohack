self.addEventListener('push', (event) => {
  let dados = {};
  try {
    dados = event.data ? event.data.json() : {};
  } catch (_) {}
  event.waitUntil(
    Promise.all([
      self.registration.showNotification(dados.title || 'Suporte respondeu', {
        body: dados.body || 'Nova mensagem no chat de suporte.',
        icon: '/images/zunder-notificacao-192.png',
        badge: '/images/zunder-selo-96.png',
        tag: 'suporte-cmsp',
      }),
      // Avisa as abas abertas pra acenderem a bolinha vermelha na bolha.
      // É isto que substitui manter uma conexão SSE aberta em TODA página
      // só pra saber que chegou resposta — o site tem ~400 alunos online
      // no pico e passou por travamento de carga em 10/08, então uma
      // conexão persistente por aba saía caro demais pro que entregava.
      self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
        for (const cliente of lista) cliente.postMessage({ tipo: 'suporte-mensagem-nova' });
      }),
    ]),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((lista) => {
      for (const cliente of lista) {
        if ('focus' in cliente) {
          cliente.postMessage({ tipo: 'suporte-notificacao-clicada' });
          return cliente.focus();
        }
      }
      if (self.clients.openWindow) return self.clients.openWindow('/');
      return undefined;
    }),
  );
});
