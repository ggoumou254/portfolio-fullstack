// backend/routes/aiRoutes.js
import express from 'express';
import rateLimit from 'express-rate-limit';
import OpenAI from 'openai';

import Embedding from '../models/Embedding.js';
import Project from '../models/Project.js';
import { embed, cosine, llmJSON } from '../utils/ai.js';
import { optionalAuth } from '../middleware/authMiddleware.js';

const router = express.Router();

// ======= OpenAI presence =======
const hasKey = !!process.env.OPENAI_API_KEY;
const openai = hasKey ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

// ======= Rate limit =======
const aiLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

// ======= Ping (per badge stato) =======
router.get('/ping', (_req, res) => {
  res.json({
    ok: true,
    hasKey,
    model: process.env.AI_MODEL || null,
    ts: Date.now(),
  });
});

/* =====================================================================================
   Helper: keyword score (fallback quando gli embedding non sono disponibili)
===================================================================================== */
function keywordScore(text, q) {
  const t = String(text || '').toLowerCase();
  const toks = String(q || '')
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (!toks.length || !t) return 0;
  let score = 0;
  for (const k of toks) {
    // match semplice a parola (o porzione)
    const rx = new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g');
    const matches = t.match(rx);
    if (matches) score += matches.length;
  }
  // normalizzazione “soft” per lunghezza testo
  return score / Math.max(1, Math.log10(50 + t.length));
}

/* =====================================================================================
   Helper: generatore risposta locale (senza LLM) con citazioni [1],[2]…
===================================================================================== */
function localSummarize(q, results, take = 3) {
  const top = (results || []).slice(0, take);
  if (!top.length) {
    return {
      answer:
        'Non ho trovato risultati pertinenti. Prova a riformulare la ricerca o a usare parole chiave più specifiche.',
      citations: [],
    };
  }

  const bullets = top
    .map((r) => {
      const p = r.ref || {};
      const bits = [];
      if (p.title) bits.push(`**${p.title}**`);
      if (Array.isArray(p.tech) && p.tech.length) bits.push(`tech: ${p.tech.slice(0, 4).join(', ')}`);
      if (p.github) bits.push('GitHub disponibile');
      if (p.demo) bits.push('Demo disponibile');
      return `- [${r.rank}] ${bits.join(' · ')}`;
    })
    .join('\n');

  const answer = [
    `Ecco i risultati più rilevanti per **"${q}"**:`,
    bullets,
    `Suggerimento: aggiungi stack/feature per affinare (es. "React + Stripe", "Node + Auth + Mongo").`,
  ].join('\n');

  return { answer, citations: top.map((r) => r.rank) };
}

/* =====================================================================================
   Helper principale: semantic search con fallback (429-safe)
===================================================================================== */
async function runSemanticSearch(q, k) {
  // 1) dimensione target in base ai dati presenti
  const any = await Embedding.findOne({ source: 'project' }).select('vector').lean();
  const targetDim = Array.isArray(any?.vector) ? any.vector.length : 1536;

  // 2) prova ad ottenere l'embedding, altrimenti fallback keyword
  let qVec = null;
  let useKeyword = false;

  try {
    qVec = await embed(q, targetDim); // questa può lanciare (es. 429)
  } catch (e) {
    console.warn('EMBED_FALLBACK:', e?.code || e?.message || e);
    useKeyword = true;
  }

  // 3) carica documenti
  const docs = await Embedding.find({ source: 'project' })
    .select('refId text vector')
    .lean();

  // 4) scoring
  let scored;
  if (!useKeyword && Array.isArray(qVec)) {
    scored = docs
      .filter((d) => Array.isArray(d.vector) && d.vector.length === qVec.length)
      .map((d) => ({ ...d, score: cosine(qVec, d.vector) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  } else {
    // Fallback: keyword scoring
    scored = docs
      .map((d) => ({ ...d, score: keywordScore(d.text || '', q) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k);
  }

  // 5) arricchisci con i metadati progetto
  const ids = [...new Set(scored.map((s) => String(s.refId)))];
  const projects = await Project.find({ _id: { $in: ids } })
    .select('title image github liveDemo technologies')
    .lean();
  const byId = new Map(projects.map((p) => [String(p._id), p]));

  const results = scored.map((s, i) => {
    const p = byId.get(String(s.refId));
    return {
      rank: i + 1,
      score: Number((s.score || 0).toFixed(4)),
      ref: {
        id: s.refId,
        title: p?.title,
        demo: p?.liveDemo || null,
        github: p?.github || null,
        tech: p?.technologies || [],
        image: p?.image || null,
      },
      snippet: String(s.text || '').slice(0, 500),
    };
  });

  // 6) prova LLM per la risposta; in caso di errore/quota → risposta locale
  let answer = null;
  if (results.length) {
    const sys =
      'Sei un assistente del portfolio. Rispondi solo usando i documenti forniti. Cita i numeri [1], [2]… Non inventare link.';
    const ctx = results.map((r) => `[${r.rank}] ${r.ref.title}\n${r.snippet}`).join('\n\n');

    try {
      const out = await llmJSON(
        sys,
        `DOMANDA: ${q}\n\nCONTESTO:\n${ctx}\n\nRispondi in JSON: { "answer": "...", "citations": [1,2,...] }`
      );
      answer = out && out.answer ? out : localSummarize(q, results);
    } catch (e) {
      console.warn('LLM_JSON_FALLBACK:', e?.code || e?.message || e);
      answer = localSummarize(q, results);
    }
  } else {
    answer = localSummarize(q, results);
  }

  return { results, answer };
}

/* =====================================================================================
   SEARCH (POST + GET)
===================================================================================== */
// POST /api/ai/search
router.post('/search', aiLimiter, optionalAuth, async (req, res) => {
  try {
    const q = String(req.body?.q || '').trim();
    const k = Math.min(Math.max(parseInt(req.body?.k || 5, 10), 1), 10);
    if (!q) return res.status(400).json({ success: false, message: 'q mancante' });

    const { results, answer } = await runSemanticSearch(q, k);
    res.json({ success: true, method: 'POST', q, k, results, answer });
  } catch (e) {
    console.error('AI /search POST error:', e);
    res.status(500).json({ success: false, message: 'AI_SEARCH_ERROR' });
  }
});

// GET /api/ai/search?q=...&k=5
router.get('/search', aiLimiter, optionalAuth, async (req, res) => {
  try {
    const q = String(req.query?.q || '').trim();
    const k = Math.min(Math.max(parseInt(req.query?.k || 5, 10), 1), 10);
    if (!q) return res.status(400).json({ success: false, message: 'q mancante (usa ?q=...)' });

    const { results, answer } = await runSemanticSearch(q, k);
    res.json({ success: true, method: 'GET', q, k, results, answer });
  } catch (e) {
    console.error('AI /search GET error:', e);
    res.status(500).json({ success: false, message: 'AI_SEARCH_ERROR' });
  }
});

/* =====================================================================================
   CHAT (non-stream) con fallback
===================================================================================== */
router.post('/chat', aiLimiter, optionalAuth, async (req, res) => {
  try {
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];
    const system = String(req.body?.system || 'Sei un assistente del portfolio, risposte concise e utili.');

    if (!hasKey) {
      const last = messages.filter((m) => m.role === 'user').pop()?.content || '';
      return res.json({
        success: true,
        model: 'fallback',
        answer: `🧪 (simulazione) "${last.slice(0, 200)}"`,
      });
    }

    try {
      const r = await openai.chat.completions.create({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: 0.4,
      });

      return res.json({
        success: true,
        model: r.model,
        answer: r.choices?.[0]?.message?.content || '',
        usage: r.usage || null,
      });
    } catch (e) {
      console.warn('CHAT_FALLBACK:', e?.code || e?.message || e);
      const last = messages.filter((m) => m.role === 'user').pop()?.content || '';
      return res.json({
        success: true,
        model: 'fallback',
        answer:
          /\bsit[oi]\b|\bsite\b|\bweb\b/i.test(last)
            ? `Capito: vuoi creare un sito web. Piano rapido:
1) Obiettivi & pagine (Home, Servizi, Portfolio, Contatti).
2) Design responsive, brand color e font leggibile.
3) Tech: React + Node/Express + MongoDB (oppure statico + form email).
4) Deploy: Vercel/Netlify + Render/Fly.io.
Hai già logo/dominio? Multilingua? Budget?`
            : `Ricevuto: "${last.slice(0, 200)}". Indicami obiettivo, pubblico e scadenza: preparo uno schema operativo.`,
      });
    }
  } catch (e) {
    console.error('AI /chat error:', e);
    res.status(500).json({ success: false, message: 'AI_CHAT_ERROR' });
  }
});

/* =====================================================================================
   CHAT STREAM (SSE) con fallback
===================================================================================== */
router.post('/chat-stream', aiLimiter, optionalAuth, async (req, res) => {
  try {
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const system = String(req.query?.system || req.body?.system || 'Sei un assistente del portfolio.');
    const messages = Array.isArray(req.body?.messages) ? req.body.messages : [];

    const send = (data) => res.write(`data: ${data}\n\n`);
    const end = () => {
      res.write('event: done\ndata: {}\n\n');
      res.end();
    };

    async function streamFake() {
      const last = messages.filter((m) => m.role === 'user').pop()?.content || '';
      const fake =
        /\bsit[oi]\b|\bsite\b|\bweb\b/i.test(last)
          ? `Capito: vuoi creare un sito web. Ti propongo un piano:
1) Definizione: obiettivi, target e sitemap.
2) Design: colori del brand, tipografia, layout responsive.
3) Tech: React + Node/Express + MongoDB (o statico + form).
4) Deploy: Vercel/Netlify (FE) + Render/Fly.io (BE).
Domande: logo/dominio? multilingua? budget indicativo?`
          : `Ho ricevuto: "${last.slice(0, 200)}". Dimmi obiettivo, pubblico e scadenza e ti preparo un piano in 3 passi.`;

      for (const token of fake.split(' ')) {
        send(JSON.stringify({ delta: token + ' ' }));
        await new Promise((r) => setTimeout(r, 10));
      }
      end();
    }

    if (!hasKey) return streamFake();

    try {
      const stream = await openai.chat.completions.create({
        model: process.env.AI_MODEL || 'gpt-4o-mini',
        messages: [{ role: 'system', content: system }, ...messages],
        temperature: 0.4,
        stream: true,
      });

      for await (const part of stream) {
        const delta = part.choices?.[0]?.delta?.content || '';
        if (delta) send(JSON.stringify({ delta }));
      }
      end();
    } catch (e) {
      console.warn('CHAT_STREAM_FALLBACK:', e?.code || e?.message || e);
      return streamFake();
    }
  } catch (e) {
    console.error('AI /chat-stream error (outer):', e);
    try {
      res.write(`event: error\ndata: ${JSON.stringify({ message: 'AI_CHAT_STREAM_ERROR' })}\n\n`);
      res.end();
    } catch {}
  }
});

/* =====================================================================================
   TRIAGE contatti (con fallback già integrato in llmJSON)
===================================================================================== */
router.post('/triage-contact', aiLimiter, optionalAuth, async (req, res) => {
  try {
    const message = String(req.body?.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'message mancante' });

    if (!hasKey) {
      const lower = message.toLowerCase();
      const triage = {
        intent: /(budget|devis|preventivo|quote|offerta|stima|pricing|prezzo|costo)/.test(lower)
          ? 'lead'
          : /(bug|errore|issue|help|support|problema|bloccato)/.test(lower)
          ? 'support'
          : /(collab|collaborazione|partnership|joint|co-progetto)/.test(lower)
          ? 'collab'
          : 'other',
        urgency: /(urgent|urgente|asap)/.test(lower)
          ? 'high'
          : /(soon|presto|rapidement)/.test(lower)
          ? 'med'
          : 'low',
        summary: message.slice(0, 180),
      };
      return res.json({ success: true, triage, engine: 'rules' });
    }

    const sys = `Classifica messaggio contatto in JSON con schema:
{ "intent":"lead|support|collab|spam|other", "urgency":"low|med|high", "summary":"..." }`;
    try {
      const out = await llmJSON(sys, message);
      res.json({ success: true, triage: out, engine: 'llm' });
    } catch (e) {
      console.warn('TRIAGE_FALLBACK:', e?.code || e?.message || e);
      // fallback alle regole
      const lower = message.toLowerCase();
      const triage = {
        intent: /(budget|devis|preventivo|quote|offerta|stima|pricing|prezzo|costo)/.test(lower)
          ? 'lead'
          : /(bug|errore|issue|help|support|problema|bloccato)/.test(lower)
          ? 'support'
          : /(collab|collaborazione|partnership|joint|co-progetto)/.test(lower)
          ? 'collab'
          : 'other',
        urgency: /(urgent|urgente|asap)/.test(lower)
          ? 'high'
          : /(soon|presto|rapidement)/.test(lower)
          ? 'med'
          : 'low',
        summary: message.slice(0, 180),
      };
      res.json({ success: true, triage, engine: 'rules' });
    }
  } catch (e) {
    console.error('AI /triage-contact error:', e);
    res.status(500).json({ success: false, message: 'AI_TRIAGE_ERROR' });
  }
});

export default router;
