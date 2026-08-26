(function (global) {
  const POPUP_ID = 'adblockPopup';

  function testarIsca() {
    return new Promise((resolve) => {
      const bait = document.createElement('div');
      bait.className = 'adsbox ad-banner ad-unit adsbygoogle pub_300x250 text-ad textAd advertisement banner_ad';
      bait.setAttribute('aria-hidden', 'true');
      bait.style.cssText = 'position:absolute;left:-9999px;top:-9999px;width:300px;height:250px;pointer-events:none;';
      document.body.appendChild(bait);

      requestAnimationFrame(() => requestAnimationFrame(() => {
        const style = global.getComputedStyle(bait);
        const bloqueado =
          bait.offsetHeight === 0 ||
          style.display === 'none' ||
          style.visibility === 'hidden';
        bait.remove();
        resolve(bloqueado);
      }));
    });
  }

  function testarRede() {
    if (!global.navigator.onLine) return Promise.resolve(false);
    return fetch('https://www.highperformanceformat.com/74c2440d4945399e465d4111ac40db15/invoke.js', {
      method: 'HEAD',
      mode: 'no-cors',
      cache: 'no-store',
    })
      .then(() => false)
      .catch(() => true);
  }

  async function detectar() {
    if (await testarIsca()) return true;
    return testarRede();
  }

  function substituirBanners(seletor, src, alt) {
    document.querySelectorAll(seletor).forEach((slot) => {
      if (slot.dataset.tadinho) return;
      slot.dataset.tadinho = '1';
      slot.innerHTML = '';
      const img = document.createElement('img');
      img.src = src;
      img.alt = alt;
      img.className = 'ad-slot-tadinho';
      img.addEventListener('click', () => abrir());
      slot.appendChild(img);
    });
  }

  function substituirBannerSidebar() {
    substituirBanners('.ad-sidebar-tower .ad-slot', '/images/tadinho.png', 'Detectamos um bloqueador de anúncios');
    substituirBanners('.ad-zone-vertical .ad-slot', '/images/obra%20do%20coisa%20ruim.png', 'Detectamos um bloqueador de anúncios');
  }

  function montarPopup() {
    const overlay = document.createElement('div');
    overlay.className = 'discord-popup-overlay';
    overlay.id = POPUP_ID;
    overlay.setAttribute('aria-hidden', 'true');
    overlay.innerHTML = `
      <div class="discord-popup" role="dialog" aria-modal="true" aria-labelledby="adblockPopupTitle">
        <button class="discord-popup-close" id="adblockPopupClose" aria-label="Fechar">✕</button>
        <img class="discord-popup-banner adblock-popup-banner" src="/images/adblock.png" alt="" aria-hidden="true" />
        <div class="discord-popup-body">
          <h3 id="adblockPopupTitle">Detectamos um bloqueador de anúncios</h3>
          <p class="popup-lead-with-icon">O Zunder é e sempre vai ser de graça.</p>
          <p>
            Os anúncios são o que paga os servidores, proxies e APIs que fazem os bots
            funcionarem. Sem eles, não tem como manter o site no ar pra todo mundo.
          </p>
          <p>
            Se puder, desative seu bloqueador aqui no Zunder. Leva 10 segundos e ajuda demais.
            Você pode continuar usando normalmente de qualquer jeito.
          </p>
          <button class="discord-popup-btn" id="adblockPopupReload" type="button">Já desativei, recarregar</button>
          <button class="discord-popup-btn adblock-popup-secondary" id="adblockPopupDismiss" type="button">Continuar assim mesmo</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  function abrir() {
    if (document.getElementById(POPUP_ID)) return;
    const overlay = montarPopup();

    function fechar() {
      overlay.classList.remove('open');
      overlay.setAttribute('aria-hidden', 'true');
      document.removeEventListener('keydown', onEsc);
      setTimeout(() => {
        overlay.remove();
        global.App?.syncOverlayScrollLock?.();
      }, 260);
    }

    function onEsc(e) {
      if (e.key === 'Escape') fechar();
    }

    overlay.querySelector('#adblockPopupClose').addEventListener('click', fechar);
    overlay.querySelector('#adblockPopupDismiss').addEventListener('click', fechar);
    overlay.querySelector('#adblockPopupReload').addEventListener('click', () => global.location.reload());
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) fechar();
    });
    document.addEventListener('keydown', onEsc);

    requestAnimationFrame(() => {
      overlay.classList.add('open');
      overlay.setAttribute('aria-hidden', 'false');
      global.App?.lockPageScroll?.();
    });
  }

  let verificando = false;

  async function verificar(delayMs) {
    if (verificando) return;
    verificando = true;
    try {
      if (global.ApoiadorStatus) {
        const isApoiador = await Promise.race([
          global.ApoiadorStatus,
          new Promise((r) => setTimeout(() => r(false), 4000)),
        ]);
        if (isApoiador) return;
      }
      if (global.UsuarioApoiador) return;
      if (delayMs) await new Promise((r) => setTimeout(r, delayMs));
      if (document.querySelector('.discord-popup-overlay.open')) return;
      if (await detectar()) {
        substituirBannerSidebar();
        abrir();
      }
    } finally {
      verificando = false;
    }
  }

  function init() {
    verificar(2500);
  }

  global.addEventListener('cmsp:navigated', () => verificar(400));

  global.AdblockNotice = { verificar, detectar };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})(window);
