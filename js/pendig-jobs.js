(function () {
  const STORAGE_KEY = 'cmsp_pending_jobs';
  const LOGIN_KEY = 'cmsp_login';
  const POLL_MS = 5000;
  const STALE_MS = 30 * 60 * 1000;

  const inflight = new Set();
  const finished = new Set();
  let pollTimer = null;

  function loadJobs() {
    try {
      const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return { tarefas: data.tarefas || [], redacoes: data.redacoes || [] };
    } catch {
      return { tarefas: [], redacoes: [] };
    }
  }

  function saveJobs(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  function jobKey(type, id) {
    return `${type}:${id}`;
  }

  function stopPoll() {
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function ensurePoll() {
    const data = loadJobs();
    if (!data.tarefas.length && !data.redacoes.length) {
      stopPoll();
      return;
    }
    if (pollTimer) return;
    pollTimer = setInterval(poll, POLL_MS);
    poll();
  }

  function removeJob(type, id) {
    const data = loadJobs();
    data[type] = data[type].filter((j) => String(j.id) !== String(id));
    saveJobs(data);
    ensurePoll();
  }

  function finishJob(type, id, ok, message, draft) {
    const key = jobKey(type, id);
    if (finished.has(key)) return;

    const data = loadJobs();
    const job = data[type].find((j) => String(j.id) === String(id));
    if (!job) return;

    finished.add(key);
    inflight.delete(key);

    const defaultOk = type === 'tarefas'
      ? (draft ? 'Rascunho salvo!' : 'Tarefa enviada!')
      : 'Rascunho salvo!';

    if (ok) Notify.success(defaultOk, job.toastId, message || defaultOk);
    else Notify.error('Falha', job.toastId, message || 'Não foi possível concluir.');

    removeJob(type, id);
    window.dispatchEvent(new CustomEvent(`cmsp:${type}-done`, {
      detail: { id: String(id), ok, draft: !!draft },
    }));
  }

  function restoreToast(job, type) {
    if (job.toastId && document.getElementById(job.toastId)) return job.toastId;
    const title = type === 'tarefas'
      ? (job.draft ? 'Salvando rascunho...' : 'Fazendo tarefa...')
      : 'Salvando rascunho...';
    job.toastId = Notify.loading(title, job.titulo || '');
    return job.toastId;
  }

  async function runTarefaPost(job) {
    const key = jobKey('tarefas', job.id);
    if (inflight.has(key)) return;
    inflight.add(key);

    try {
      const response = await fetch(`/api/tarefas/${encodeURIComponent(job.id)}/completar?modo=${encodeURIComponent(job.modo)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: job.draft ? 'draft' : 'direto',
          cf_turnstile_token: job.cf_turnstile_token,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Falha ao completar.');
      finishJob('tarefas', job.id, true, data.message, job.draft);
    } catch (error) {
      if (finished.has(key)) return;
      finishJob('tarefas', job.id, false, error.message, job.draft);
    }
  }

  function validEssayLevel(value) {
    const nivel = Number(value);
    return Number.isInteger(nivel) && nivel >= 1 && nivel <= 5 ? nivel : null;
  }

  async function runRedacaoPost(job) {
    const key = jobKey('redacoes', job.id);
    if (inflight.has(key)) return;
    inflight.add(key);

    try {
      const nivel = validEssayLevel(job.nivel);
      if (!nivel) throw new Error('Nível de redação inválido. Escolha um nível de 1 a 5.');
      const response = await fetch(`/api/redacoes/${encodeURIComponent(job.id)}/enviar`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          acao: 'draft',
          modo: job.modo || 'pendente',
          nivel,
          cf_turnstile_token: job.cf_turnstile_token,
        }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.message || 'Falha ao salvar rascunho.');
      const msg = job.wasDraft ? 'Nova redação salva como rascunho!' : (data.message || 'Rascunho salvo!');
      finishJob('redacoes', job.id, true, msg, true);
      App.invalidarPendencias?.();
    } catch (error) {
      if (finished.has(key)) return;
      inflight.delete(key);
      if (error.message && !/fetch|network|timeout|aborted/i.test(error.message)) {
        finishJob('redacoes', job.id, false, error.message, true);
      }
    }
  }

  async function pollTarefas(jobs) {
    const byModo = {};
    jobs.forEach((job) => {
      byModo[job.modo] = byModo[job.modo] || [];
      byModo[job.modo].push(job);
    });

    for (const [modo, list] of Object.entries(byModo)) {
      try {
        const response = await fetch(`/api/tarefas?modo=${encodeURIComponent(modo)}`, { credentials: 'same-origin' });
        const data = await response.json();
        if (!response.ok) continue;

        const map = new Map((data.tarefas || []).map((t) => [String(t.id), t]));
        for (const job of list) {
          const tarefa = map.get(String(job.id));
          if (job.draft) {
            if (tarefa && (tarefa.status_key === 'draft' || tarefa.status === 'Rascunho')) {
              finishJob('tarefas', job.id, true, 'Rascunho salvo!', true);
            }
            continue;
          }
          if (!tarefa) {
            finishJob('tarefas', job.id, true, 'Tarefa enviada!', false);
            continue;
          }
          if (tarefa.status_key === 'submitted' || tarefa.status === 'Enviada') {
            finishJob('tarefas', job.id, true, 'Tarefa enviada!', false);
          }
        }
      } catch {
      }
    }
  }

  async function pollRedacoes(jobs) {
    try {
      const response = await fetch('/api/redacoes?modo=pendente', { credentials: 'same-origin' });
      const data = await response.json();
      if (!response.ok) return;

      const map = new Map((data.redacoes || []).map((r) => [String(r.id), r]));
      for (const job of jobs) {
        const key = jobKey('redacoes', job.id);
        if (inflight.has(key)) continue;
        if (job.wasDraft) continue;

        const redacao = map.get(String(job.id));
        if (redacao && (redacao.status_key === 'draft' || redacao.status === 'Rascunho')) {
          finishJob('redacoes', job.id, true, 'Rascunho salvo!', true);
        }
      }
    } catch {
    }
  }

  async function poll() {
    const data = loadJobs();
    const now = Date.now();
    let changed = false;

    ['tarefas', 'redacoes'].forEach((type) => {
      const before = data[type].length;
      data[type] = data[type].filter((job) => {
        if (now - (job.startedAt || 0) > STALE_MS) {
          finished.delete(jobKey(type, job.id));
          if (job.toastId) Notify.error('Tempo esgotado', job.toastId, 'Não foi possível confirmar a conclusão.');
          return false;
        }
        return true;
      });
      if (data[type].length !== before) changed = true;
    });

    if (changed) saveJobs(data);
    if (data.tarefas.length) await pollTarefas(data.tarefas);
    if (data.redacoes.length) await pollRedacoes(data.redacoes);
    ensurePoll();
  }

  function registerJob(type, job) {
    finished.delete(jobKey(type, job.id));
    const data = loadJobs();
    data[type] = data[type].filter((item) => String(item.id) !== String(job.id));
    data[type].push(job);
    saveJobs(data);
    ensurePoll();
  }

  function loadLogin() {
    try {
      return JSON.parse(localStorage.getItem(LOGIN_KEY) || 'null');
    } catch {
      return null;
    }
  }

  function clearLogin() {
    localStorage.removeItem(LOGIN_KEY);
  }

  function loadAccounts() {
    try {
      const raw = localStorage.getItem('cmsp_accounts');
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function saveAccounts(accounts) {
    try {
      localStorage.setItem('cmsp_accounts', JSON.stringify(accounts));
    } catch {}
  }

  window.PendingJobs = {
    startTarefa({ id, modo, draft, titulo, cf_turnstile_token }) {
      const job = {
        id: String(id),
        modo: modo || 'pendente',
        draft: !!draft,
        titulo: titulo || '',
        cf_turnstile_token: cf_turnstile_token || '',
        toastId: Notify.loading(
          draft ? 'Salvando rascunho...' : 'Fazendo tarefa...',
          titulo || '',
        ),
        startedAt: Date.now(),
      };
      registerJob('tarefas', job);
      runTarefaPost(job);
      return job.toastId;
    },

    startRedacao({ id, titulo, nivel, modo, wasDraft, cf_turnstile_token }) {
      const validLevel = validEssayLevel(nivel);
      if (!validLevel) {
        Notify.error('Nível inválido', null, 'Escolha um nível de redação entre 1 e 5.');
        return null;
      }
      const job = {
        id: String(id),
        modo: modo || 'pendente',
        draft: true,
        wasDraft: !!wasDraft,
        titulo: titulo || '',
        nivel: validLevel,
        cf_turnstile_token: cf_turnstile_token || '',
        toastId: Notify.loading(
          wasDraft ? 'Gerando nova redação...' : 'Salvando rascunho...',
          titulo || '',
        ),
        startedAt: Date.now(),
      };
      registerJob('redacoes', job);
      runRedacaoPost(job);
      return job.toastId;
    },

    resume() {
      const data = loadJobs();
      data.tarefas.forEach((job) => restoreToast(job, 'tarefas'));
      data.redacoes.forEach((job) => restoreToast(job, 'redacoes'));
      saveJobs(data);
      ensurePoll();
    },

    clear() {
      stopPoll();
      finished.clear();
      inflight.clear();
      saveJobs({ tarefas: [], redacoes: [] });
    },

    saveLogin(credentials) {
      localStorage.setItem(LOGIN_KEY, JSON.stringify(credentials));
      if (credentials && credentials.ra) {
        const accounts = loadAccounts();
        const index = accounts.findIndex((a) => a.ra === credentials.ra);
        if (index >= 0) {
          accounts[index] = credentials;
        } else {
          accounts.push(credentials);
        }
        saveAccounts(accounts);
      }
    },

    loadLogin,

    clearLogin,

    getSavedAccounts() {
      return loadAccounts();
    },

    removeSavedAccount(ra) {
      const accounts = loadAccounts().filter((a) => a.ra !== ra);
      saveAccounts(accounts);
    },

    async autoLogin() {
      const credentials = loadLogin();
      if (!credentials || !credentials.ra || !credentials.senha) {
        return { success: false, message: 'Nenhum login salvo.' };
      }

      try {
        const response = await fetch('/api/login', {
          method: 'POST',
          credentials: 'same-origin',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(credentials),
        });
        const data = await response.json();

        if (!response.ok || !data.success) {
          clearLogin();
          return { success: false, message: data.message || 'Login automático falhou.' };
        }

        return { success: true, user: data.user };
      } catch (err) {
        return { success: false, message: err.message || 'Erro de rede.' };
      }
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => PendingJobs.resume());
  } else {
    PendingJobs.resume();
  }
})();
