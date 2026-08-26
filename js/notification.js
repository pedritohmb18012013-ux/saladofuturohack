(() => {
  if (document.getElementById('toast-styles')) return;

  const style = document.createElement('style');
  style.id = 'toast-styles';
  style.textContent = `
    .toast-root {
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      width: min(360px, calc(100vw - 32px));
      pointer-events: none;
    }

    .toast {
      pointer-events: auto;
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding: 14px 16px;
      background: #141414;
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 14px;
      box-shadow: 0 16px 40px rgba(0, 0, 0, 0.45);
      color: #f4f4f4;
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
      transform: translateX(24px);
      opacity: 0;
      animation: toast-in 0.28s ease forwards;
    }

    .toast.is-leaving {
      animation: toast-out 0.22s ease forwards;
    }

    .toast-icon {
      width: 34px;
      height: 34px;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
    }

    .toast.loading .toast-icon {
      background: rgba(86, 86, 86, 0.18);
      color: #9c9c9c;
    }

    .toast.success .toast-icon {
      background: rgba(137, 137, 137, 0.15);
      color: #a7a7a7;
    }

    .toast.error .toast-icon {
      background: rgba(119, 119, 119, 0.15);
      color: #999999;
    }

    .toast.info .toast-icon {
      background: rgba(86, 86, 86, 0.18);
      color: #9c9c9c;
    }

    .toast-body {
      flex: 1;
      min-width: 0;
      padding-top: 2px;
    }

    .toast-title {
      font-size: 13px;
      font-weight: 700;
      line-height: 1.3;
      margin-bottom: 2px;
    }

    .toast-message {
      font-size: 12px;
      line-height: 1.45;
      color: #989898;
    }

    .toast-spinner {
      width: 16px;
      height: 16px;
      border: 2px solid rgba(156, 156, 156, 0.25);
      border-top-color: #9c9c9c;
      border-radius: 50%;
      animation: toast-spin 0.7s linear infinite;
    }

    @keyframes toast-in {
      to { transform: translateX(0); opacity: 1; }
    }

    @keyframes toast-out {
      to { transform: translateX(24px); opacity: 0; }
    }

    @keyframes toast-spin {
      to { transform: rotate(360deg); }
    }
  `;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'toast-root';
  root.id = 'toast-root';
  document.body.appendChild(root);

  const icons = {
    success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>',
    error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
    info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>',
  };

  let counter = 0;

  function getRoot() {
    return document.getElementById('toast-root');
  }

  function renderIcon(type) {
    if (type === 'loading') return '<div class="toast-spinner"></div>';
    return icons[type] || icons.info;
  }

  function createToast({ type = 'info', title = '', message = '', duration = 3200 }) {
    const id = `toast-${++counter}`;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.id = id;
    el.innerHTML = `
      <div class="toast-icon">${renderIcon(type)}</div>
      <div class="toast-body">
        <div class="toast-title"></div>
        ${message ? '<div class="toast-message"></div>' : ''}
      </div>
    `;
    el.querySelector('.toast-title').textContent = title;
    const msgEl = el.querySelector('.toast-message');
    if (msgEl) msgEl.textContent = message;
    getRoot().appendChild(el);

    if (duration > 0 && type !== 'loading') {
      setTimeout(() => Notify.dismiss(id), duration);
    }

    return id;
  }

  function setToast(id, { type, title, message, duration }) {
    const el = document.getElementById(id);
    if (!el) return id;

    if (type) {
      el.className = `toast ${type}`;
      el.querySelector('.toast-icon').innerHTML = renderIcon(type);
    }
    if (title !== undefined) el.querySelector('.toast-title').textContent = title;
    const msgEl = el.querySelector('.toast-message');
    if (message !== undefined) {
      if (msgEl) msgEl.textContent = message;
      else if (message) {
        const body = el.querySelector('.toast-body');
        const div = document.createElement('div');
        div.className = 'toast-message';
        div.textContent = message;
        body.appendChild(div);
      }
    }

    if (duration > 0 && type && type !== 'loading') {
      setTimeout(() => Notify.dismiss(id), duration);
    }

    return id;
  }

  window.Notify = {
    show(title, message = '', type = 'info', duration = 3200) {
      return createToast({ type, title, message, duration });
    },

    loading(title, message = '') {
      return createToast({ type: 'loading', title, message, duration: 0 });
    },

    update(id, title, message) {
      return setToast(id, { title, message });
    },

    success(title, id, message = '', duration = 2600) {
      if (id) return setToast(id, { type: 'success', title, message, duration });
      return createToast({ type: 'success', title, message, duration });
    },

    error(title, id, message = '', duration = 4200) {
      if (id) return setToast(id, { type: 'error', title, message, duration });
      return createToast({ type: 'error', title, message, duration });
    },

    dismiss(id) {
      const el = document.getElementById(id);
      if (!el) return;
      el.classList.add('is-leaving');
      setTimeout(() => el.remove(), 220);
    },
  };
})();
