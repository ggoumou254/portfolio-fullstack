// frontend/js/ai.js
// =====================================================
// Helper
// =====================================================
const api = (p) => (window.CONFIG?.apiUrl ? CONFIG.apiUrl(p) : `/${p.replace(/^\/+/, '')}`);
const $  = (id) => document.getElementById(id);
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// Debounce minimal
function debounce(fn, wait = 250) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

// Evidenzia parole della query nello snippet
function hi(text, q){
  if (!q) return text;
  const toks = String(q).split(/\s+/).filter(Boolean).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!toks.length) return text;
  const rx = new RegExp(toks.join('|'), 'ig');
  return text.replace(rx, m => `<mark>${m}</mark>`);
}

// Spinner inline
function setLoading(el, on) {
  if (!el) return;
  if (on) {
    el.setAttribute('data-prev', el.innerHTML);
    el.innerHTML = `<div class="d-flex align-items-center gap-2"><div class="spinner-border spinner-border-sm" role="status" aria-hidden="true"></div><span>Caricamento…</span></div>`;
  } else {
    const prev = el.getAttribute('data-prev');
    if (prev != null) el.innerHTML = prev;
    el.removeAttribute('data-prev');
  }
}

// =====================================================
// Badge stato AI (/api/ai/ping)
// =====================================================
async function refreshAIPing() {
  const badge = $('ai-ping');
  const ts    = $('ai-ping-ts');
  if (!badge) return;

  badge.className = 'badge text-bg-warning';
  badge.textContent = 'AI: checking…';
  if (ts) ts.textContent = '';

  try {
    const r = await fetch(api('api/ai/ping'), { cache: 'no-store' });
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    const j = await r.json();

    badge.className = 'badge text-bg-success';
    badge.textContent = 'AI: online';
    if (ts && j?.ts) {
      const when = new Date(j.ts);
      ts.textContent = `(ok ${when.toLocaleTimeString()})`;
    }
  } catch {
    badge.className = 'badge text-bg-danger';
    badge.textContent = 'AI: offline';
    if (ts) ts.textContent = '';
  }
}

// =====================================================
// SEARCH
// =====================================================
async function runSearch() {
  const q = $('q')?.value?.trim() || '';
  const out = $('search-out');
  const btn = $('btn-search');
  if (!out) return;

  out.classList.remove('mono'); // render HTML
  if (!q) {
    out.innerHTML = `<div class="alert alert-info mb-0">Inserisci una query (es. <em>React dashboard responsive</em>)</div>`;
    return;
  }

  setLoading(btn, true);
  out.innerHTML = '…';

  try {
    const r = await fetch(api('api/ai/search'), {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ q, k: 5 })
    });
    const j = await r.json();
    renderResults(j, q);
  } catch (e) {
    out.innerHTML = `<div class="alert alert-danger mb-0">Errore: ${e.message}</div>`;
  } finally {
    setLoading(btn, false);
  }
}

function renderResults(j, qText='') {
  const box = $('search-out');
  if (!box) return;

  if (!j?.success) { box.textContent = JSON.stringify(j, null, 2); return; }

  const header = `
    <div class="ai-answer">
      ${j.answer?.answer ? `<p>${j.answer.answer}</p>` : ''}
      ${Array.isArray(j.answer?.citations) && j.answer.citations.length
        ? `<div class="citations">Fonti: ${j.answer.citations.map(n => `[${n}]`).join(' ')}</div>` : ''}
    </div>`;

  const cards = (j.results||[]).map(r => {
    const p = r.ref||{};
    const tech = (p.tech||[]).slice(0,6).map(t=>`<span class="tag">${t}</span>`).join(' ');
    const img = p.image ? `<img src="${p.image}" alt="${p.title||'project'}" loading="lazy"/>` : '';
    const links = `
      ${p.demo ? `<a href="${p.demo}" target="_blank" rel="noopener">Demo</a>` : ''}
      ${p.github ? `<a href="${p.github}" target="_blank" rel="noopener">GitHub</a>` : ''}
    `;

    const rawSnippet = (r.snippet||'').slice(0, 220);
    const prettySnippet = hi(rawSnippet, qText);
    return `
      <article class="ai-card">
        ${img}
        <div class="meta">
          <div class="row">
            <span class="rank">#${r.rank}</span>
            <span class="score">${(r.score*100).toFixed(1)}%</span>
          </div>
          <h3>${p.title||'Progetto'}</h3>
          <p class="snippet">${prettySnippet}${(r.snippet||'').length>220?'…':''}</p>
          <div class="tech">${tech}</div>
          <div class="links">${links}</div>
        </div>
      </article>`;
  }).join('');

  box.innerHTML = header + `<div class="ai-grid">${cards || '<div class="alert alert-warning">Nessun risultato utile.</div>'}</div>`;
}

// =====================================================
// CHAT (SSE)
// =====================================================
const chat = {
  box: null,
  input: null,
  sendBtn: null,
  clearBtn: null,
  stopBtn: null,
  messages: [],
  streamAbort: null, // AbortController per interrompere stream
};

function renderChat() {
  if (!chat.box) return;
  chat.box.innerHTML = chat.messages.map(m => `
    <div class="msg ${m.role}">
      <span class="role">${m.role === 'user' ? 'Tu' : 'AI'}:</span>
      <span class="content">${m.content}</span>
    </div>
  `).join('');
  chat.box.scrollTop = chat.box.scrollHeight;
}

function resetChatState() {
  try { chat.streamAbort?.abort(); } catch {}
  chat.streamAbort = null;
  chat.messages = [];
  renderChat();
}

async function startChatStream() {
  try { chat.streamAbort?.abort(); } catch {}
  chat.streamAbort = new AbortController();

  const idx = chat.messages.push({ role:'assistant', content:'' }) - 1;
  renderChat();

  let resp;
  try {
    resp = await fetch(api('api/ai/chat-stream'), {
      method: 'POST',
      headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ messages: chat.messages }),
      signal: chat.streamAbort.signal
    });
  } catch (e) {
    chat.messages[idx].content = `⚠️ Errore rete: ${e.message}`;
    renderChat();
    return;
  }

  if (!resp.ok || !resp.body) {
    chat.messages[idx].content = `⚠️ Errore: ${resp.status} ${resp.statusText}`;
    renderChat();
    return;
  }

  const reader = resp.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split('\n\n');
      buffer = parts.pop();

      for (const chunk of parts) {
        const line = chunk.trim();
        if (line.startsWith('event:')) continue;
        if (!line.startsWith('data:')) continue;

        const data = line.slice(5).trim();
        if (!data) continue;

        try {
          const obj = JSON.parse(data);
          if (obj.delta) {
            chat.messages[idx].content += obj.delta;
            renderChat();
          }
        } catch { /* keep-alive o chunk non JSON */ }
      }
    }
  } catch (e) {
    if (e.name === 'AbortError') {
      chat.messages[idx].content += '\n\n⏹️ Streaming interrotto.';
    } else {
      chat.messages[idx].content += `\n\n⚠️ Stream error: ${e.message}`;
    }
    renderChat();
  } finally {
    try { reader.releaseLock?.(); } catch {}
  }
}

// =====================================================
// TRIAGE
// =====================================================
async function runTriage() {
  const ta = $('triage-text');
  const out = $('triage-out');
  if (!ta || !out) return;

  const message = ta.value.trim();
  out.textContent = '…';
  try {
    const r = await fetch(api('api/ai/triage-contact'), {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ message })
    });
    const j = await r.json();
    out.textContent = JSON.stringify(j, null, 2);
  } catch (e) {
    out.textContent = 'Errore: ' + e.message;
  }
}

// =====================================================
// initAI: aggancia i listener DOPO l'iniezione del fragment
// =====================================================
export async function initAI() {
  // Badge stato AI
  $('ai-ping-refresh')?.addEventListener('click', refreshAIPing);
  await refreshAIPing();
  try { clearInterval(window.__aiPingTimer); } catch {}
  window.__aiPingTimer = setInterval(refreshAIPing, 20000);

  // Search
  const btnSearch = $('btn-search');
  const inputQ    = $('q');
  const outSearch = $('search-out');

  if (outSearch) {
    outSearch.innerHTML = `<div class="alert alert-info mb-0">Digita una query e premi <strong>Cerca</strong>.</div>`;
  }
  if (btnSearch) btnSearch.addEventListener('click', runSearch);
  if (inputQ)    inputQ.addEventListener('keydown', (e) => { if (e.key === 'Enter') runSearch(); });
  if (inputQ)    inputQ.addEventListener('input', debounce(() => { /* hook suggerimenti */ }, 250));

  // Chat
  chat.box      = $('chat-box');
  chat.input    = $('chat-input');
  chat.sendBtn  = $('chat-send');
  chat.clearBtn = $('chat-clear');
  chat.stopBtn  = $('chat-stop'); // opzionale

  if (chat.box) chat.box.innerHTML = '';
  chat.clearBtn?.addEventListener('click', resetChatState);
  chat.stopBtn?.addEventListener('click', () => { try { chat.streamAbort?.abort(); } catch {} });

  chat.sendBtn?.addEventListener('click', async () => {
    const text = chat.input?.value?.trim();
    if (!text) return;
    chat.input.value = '';
    chat.messages.push({ role:'user', content: text });
    renderChat();
    await startChatStream();
  });

  chat.input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') chat.sendBtn?.click();
  });

  // Triage
  $('triage-run')?.addEventListener('click', runTriage);
}
