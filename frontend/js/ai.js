// frontend/js/ai.js
import { CONFIG } from './config.js';

const api = (p) => CONFIG.apiUrl(p);
const $ = (id) => document.getElementById(id);

function debounce(fn, wait = 250) {
  let t = null;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), wait); };
}

function hi(text, q) {
  if (!q) return text;
  const toks = String(q).split(/\s+/).filter(Boolean).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  if (!toks.length) return text;
  return text.replace(new RegExp(toks.join('|'), 'ig'), m => `<mark>${m}</mark>`);
}

function setLoading(el, on) {
  if (!el) return;
  if (on) { el.setAttribute('data-prev', el.innerHTML); el.innerHTML = `<div class="d-flex align-items-center gap-2"><div class="spinner-border spinner-border-sm" role="status"></div><span>Caricamento...</span></div>`; }
  else { const prev = el.getAttribute('data-prev'); if (prev != null) el.innerHTML = prev; el.removeAttribute('data-prev'); }
}

/* ---------- AI Ping ---------- */
async function refreshAIPing() {
  const badge = $('ai-ping'), ts = $('ai-ping-ts');
  if (!badge) return;
  badge.className = 'badge text-bg-warning';
  badge.textContent = 'AI: checking...';
  if (ts) ts.textContent = '';
  try {
    const r = await fetch(api('api/ai/ping'), { cache: 'no-store' });
    if (!r.ok) throw new Error(`${r.status}`);
    const j = await r.json();
    badge.className = 'badge text-bg-success';
    badge.textContent = 'AI: online';
    if (ts && j?.ts) ts.textContent = `(ok ${new Date(j.ts).toLocaleTimeString()})`;
  } catch {
    badge.className = 'badge text-bg-danger';
    badge.textContent = 'AI: offline';
  }
}

/* ---------- Search ---------- */
async function runSearch() {
  const q = $('q')?.value?.trim() || '';
  const out = $('search-out');
  const btn = $('btn-search');
  if (!out) return;
  if (!q) { out.innerHTML = `<div class="alert alert-info mb-0">Inserisci una query</div>`; return; }

  setLoading(btn, true);
  out.innerHTML = '...';
  try {
    const r = await fetch(api('api/ai/search'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ q, k: 5 })
    });
    const j = await r.json();
    renderResults(j, q);
  } catch (e) {
    out.innerHTML = `<div class="alert alert-danger mb-0">Errore: ${e.message}</div>`;
  } finally { setLoading(btn, false); }
}

function renderResults(j, qText = '') {
  const box = $('search-out');
  if (!box) return;
  if (!j?.success) { box.textContent = JSON.stringify(j, null, 2); return; }

  const header = j.answer?.answer ? `<div class="ai-answer"><p>${j.answer.answer}</p></div>` : '';
  const cards = (j.results || []).map(r => {
    const p = r.ref || {};
    const tech = (p.tech || []).slice(0, 6).map(t => `<span class="tag">${t}</span>`).join(' ');
    const img = p.image ? `<img src="${p.image}" alt="${p.title || 'project'}" loading="lazy"/>` : '';
    const snip = hi((r.snippet || '').slice(0, 220), qText);
    return `<article class="ai-card">${img}<div class="meta">
      <div class="d-flex gap-2"><span class="rank">#${r.rank}</span><span class="score">${(r.score * 100).toFixed(1)}%</span></div>
      <h3>${p.title || 'Progetto'}</h3>
      <p class="snippet">${snip}</p>
      <div class="tech">${tech}</div>
      <div class="links">${p.demo ? `<a href="${p.demo}" target="_blank" rel="noopener">Demo</a>` : ''}${p.github ? `<a href="${p.github}" target="_blank" rel="noopener">GitHub</a>` : ''}</div>
    </div></article>`;
  }).join('');

  box.innerHTML = header + `<div class="ai-grid">${cards || '<div class="alert alert-warning">Nessun risultato.</div>'}</div>`;
}

/* ---------- Chat ---------- */
const chat = { box: null, input: null, sendBtn: null, clearBtn: null, messages: [], streamAbort: null };

function renderChat() {
  if (!chat.box) return;
  chat.box.innerHTML = chat.messages.map(m => `
    <div class="msg ${m.role}">
      <span class="role">${m.role === 'user' ? 'Tu' : 'AI'}:</span>
      <span class="content">${m.content}</span>
    </div>`).join('');
  chat.box.scrollTop = chat.box.scrollHeight;
}

async function startChatStream() {
  try { chat.streamAbort?.abort(); } catch { }
  chat.streamAbort = new AbortController();
  const idx = chat.messages.push({ role: 'assistant', content: '' }) - 1;
  renderChat();

  let resp;
  try {
    resp = await fetch(api('api/ai/chat-stream'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chat.messages }),
      signal: chat.streamAbort.signal
    });
  } catch (e) { chat.messages[idx].content = `Errore rete: ${e.message}`; renderChat(); return; }

  if (!resp.ok || !resp.body) { chat.messages[idx].content = `Errore: ${resp.status}`; renderChat(); return; }

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
        if (!line.startsWith('data:')) continue;
        try {
          const obj = JSON.parse(line.slice(5).trim());
          if (obj.delta) { chat.messages[idx].content += obj.delta; renderChat(); }
        } catch { }
      }
    }
  } catch (e) {
    chat.messages[idx].content += e.name === 'AbortError' ? '\nStreaming interrotto.' : `\nErrore: ${e.message}`;
    renderChat();
  } finally { try { reader.releaseLock?.(); } catch { } }
}

/* ---------- Triage ---------- */
async function runTriage() {
  const ta = $('triage-text');
  const out = $('triage-out');
  if (!ta || !out) return;
  out.textContent = '...';
  try {
    const r = await fetch(api('api/ai/triage-contact'), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: ta.value.trim() })
    });
    const j = await r.json();
    out.textContent = JSON.stringify(j, null, 2);
  } catch (e) { out.textContent = 'Errore: ' + e.message; }
}

/* ---------- Init ---------- */
export async function initAI() {
  $('ai-ping-refresh')?.addEventListener('click', refreshAIPing);
  await refreshAIPing();
  try { clearInterval(window.__aiPingTimer); } catch { }
  window.__aiPingTimer = setInterval(refreshAIPing, 20000);

  const outSearch = $('search-out');
  if (outSearch) outSearch.innerHTML = `<div class="alert alert-info mb-0">Digita una query e premi Cerca.</div>`;
  $('btn-search')?.addEventListener('click', runSearch);
  $('q')?.addEventListener('keydown', e => { if (e.key === 'Enter') runSearch(); });

  chat.box = $('chat-box');
  chat.input = $('chat-input');
  chat.sendBtn = $('chat-send');
  chat.clearBtn = $('chat-clear');

  if (chat.box) chat.box.innerHTML = '';
  chat.clearBtn?.addEventListener('click', () => { chat.messages = []; renderChat(); });
  $('chat-stop')?.addEventListener('click', () => { try { chat.streamAbort?.abort(); } catch { } });

  chat.sendBtn?.addEventListener('click', async () => {
    const text = chat.input?.value?.trim();
    if (!text) return;
    chat.input.value = '';
    chat.messages.push({ role: 'user', content: text });
    renderChat();
    await startChatStream();
  });

  chat.input?.addEventListener('keydown', e => { if (e.key === 'Enter') chat.sendBtn?.click(); });
  $('triage-run')?.addEventListener('click', runTriage);
}