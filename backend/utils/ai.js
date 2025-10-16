// backend/utils/ai.js
import OpenAI from "openai";

/**
 * ===========================
 *  CONFIG / STATE
 * ===========================
 */
const hasKey = !!process.env.OPENAI_API_KEY;
const openai = hasKey ? new OpenAI({ apiKey: process.env.OPENAI_API_KEY }) : null;

const EMBED_MODEL = process.env.AI_EMBED_MODEL || "text-embedding-3-small"; // 1536 dim
const CHAT_MODEL  = process.env.AI_MODEL || "gpt-4o-mini";
const REQUEST_TIMEOUT_MS = Number(process.env.AI_TIMEOUT_MS || 12_000);

// ---- Circuit breaker (semplice) ----
let breakerOpen = false;
let breakerUntil = 0; // timestamp ms

function circuitOpen(ms = 30_000) {
  breakerOpen = true;
  breakerUntil = Date.now() + ms;
}
function circuitAllowed() {
  if (!breakerOpen) return true;
  if (Date.now() >= breakerUntil) {
    breakerOpen = false;
    breakerUntil = 0;
    return true;
  }
  return false;
}

/**
 * ===========================
 *  LRU Cache minima per embedding
 * ===========================
 */
const MAX_CACHE = 2000;
const embedCache = new Map(); // key: `${model}:${dim}:${q}` -> Float32Array

function cacheGet(key) {
  if (!embedCache.has(key)) return null;
  const val = embedCache.get(key);
  // refresh LRU
  embedCache.delete(key);
  embedCache.set(key, val);
  return val;
}
function cacheSet(key, val) {
  if (embedCache.size >= MAX_CACHE) {
    // rimuovi il primo inserito (LRU)
    const firstKey = embedCache.keys().next().value;
    embedCache.delete(firstKey);
  }
  embedCache.set(key, val);
}

/**
 * ===========================
 *  Utils
 * ===========================
 */
export function cosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i];
    const y = b[i];
    dot += x * y;
    na  += x * x;
    nb  += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom ? dot / denom : 0;
}

/**
 * Fallback locale per embedding (deterministico, non “intelligente”, ma stabile):
 * - hashing leggero sui token (word-like)
 * - proietta in uno spazio di dimensione targetDim
 */
function localEmbed(text, targetDim = 1536) {
  const vec = new Float32Array(targetDim);
  const toks = String(text).toLowerCase().split(/\s+/).filter(Boolean);
  for (const t of toks) {
    // piccolo hash deterministico
    let h = 2166136261;
    for (let i = 0; i < t.length; i++) {
      h ^= t.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    // distribuisci su 4 posizioni per ridurre collisioni
    for (let k = 0; k < 4; k++) {
      const idx = Math.abs((h + k * 2654435761) % targetDim);
      vec[idx] += 1;
    }
  }
  // normalizza
  let norm = 0;
  for (let i = 0; i < vec.length; i++) norm += vec[i] * vec[i];
  norm = Math.sqrt(norm) || 1;
  for (let i = 0; i < vec.length; i++) vec[i] /= norm;
  return vec;
}

/**
 * Timeout helper per qualsiasi promessa
 */
function withTimeout(promise, ms = REQUEST_TIMEOUT_MS) {
  return Promise.race([
    promise,
    new Promise((_, rej) => setTimeout(() => rej(new Error("AI_TIMEOUT")), ms))
  ]);
}

/**
 * ===========================
 *  EMBED
 * ===========================
 * @param {string} text   - testo da embeddare
 * @param {number} targetDim - dimensione desiderata (se nota dall'archivio)
 * @returns {Promise<Float32Array>}
 */
export async function embed(text, targetDim = 1536) {
  const key = `${EMBED_MODEL}:${targetDim}:${text}`;
  const cached = cacheGet(key);
  if (cached) return cached;

  // Se l’API è in breaker, vai diretto al fallback locale
  if (!hasKey || !circuitAllowed()) {
    const v = localEmbed(text, targetDim);
    cacheSet(key, v);
    return v;
  }

  try {
    const r = await withTimeout(
      openai.embeddings.create({
        model: EMBED_MODEL,
        input: text,
      })
    );

    let arr = r?.data?.[0]?.embedding || [];
    // alcune lib restituiscono number[], convertiamo a Float32Array
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) out[i] = arr[i];

    // se serve ridurre/espandere a targetDim
    const vec =
      out.length === targetDim
        ? out
        : resizeVector(out, targetDim);

    cacheSet(key, vec);
    return vec;
  } catch (e) {
    // in caso di 429/lato rete: apri il breaker per un po’ e fallback
    if (e?.status === 429 || e?.code === "insufficient_quota") {
      console.warn("EMBED_QUOTA/FALLBACK:", e?.code || e?.message);
      circuitOpen(60_000); // per 60s andiamo in locale
    } else {
      console.warn("EMBED_ERROR/FALLBACK:", e?.message || e);
      circuitOpen(20_000);
    }
    const v = localEmbed(text, targetDim);
    cacheSet(key, v);
    return v;
  }
}

/**
 * Ridimensiona un vettore a una dimensione desiderata (downsample/upsample semplice)
 */
function resizeVector(vec, targetDim) {
  const out = new Float32Array(targetDim);
  const srcN = vec.length;
  if (srcN === 0) return out;

  if (srcN > targetDim) {
    // downsample: media di blocchi
    const ratio = srcN / targetDim;
    for (let i = 0; i < targetDim; i++) {
      const start = Math.floor(i * ratio);
      const end = Math.floor((i + 1) * ratio);
      let sum = 0, cnt = 0;
      for (let j = start; j < Math.min(end, srcN); j++) {
        sum += vec[j]; cnt++;
      }
      out[i] = cnt ? sum / cnt : 0;
    }
  } else {
    // upsample: ripetizione lineare
    const ratio = targetDim / srcN;
    for (let i = 0; i < targetDim; i++) {
      out[i] = vec[Math.floor(i / ratio)] || 0;
    }
  }

  // normalizza
  let n = 0; for (let i = 0; i < out.length; i++) n += out[i] * out[i];
  n = Math.sqrt(n) || 1;
  for (let i = 0; i < out.length; i++) out[i] /= n;

  return out;
}

/**
 * ===========================
 *  llmJSON
 * ===========================
 * Prova a far restituire JSON valido dal modello. Se non disponibile/quota finita,
 * produce un fallback “ragionevole” (simulazione).
 *
 * @param {string} system - system prompt
 * @param {string} user   - messaggio utente
 * @param {object} [schemaHint] - opzionale: shape attesa, usata per validazione soft
 */
export async function llmJSON(system, user, schemaHint = null) {
  // se breaker aperto o chiave assente -> fallback
  if (!hasKey || !circuitAllowed()) return localLLMJSON(system, user, schemaHint);

  try {
    const r = await withTimeout(
      openai.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          { role: "system", content: `${system}\nRispondi SOLO in JSON valido.` },
          { role: "user",   content: user }
        ],
        temperature: 0.2,
      })
    );

    const raw = r?.choices?.[0]?.message?.content || "";
    const json = safeParseJSON(raw);
    if (json) return json;

    // un secondo tentativo (estrazione blocco JSON se c'è testo attorno)
    const extracted = extractJSON(raw);
    if (extracted) return extracted;

    // ultima spiaggia -> fallback locale
    return localLLMJSON(system, user, schemaHint);
  } catch (e) {
    if (e?.status === 429 || e?.code === "insufficient_quota") {
      console.warn("LLM_QUOTA/FALLBACK:", e?.code || e?.message);
      circuitOpen(60_000);
    } else {
      console.warn("LLM_ERROR/FALLBACK:", e?.message || e);
      circuitOpen(20_000);
    }
    return localLLMJSON(system, user, schemaHint);
  }
}

/** Parser sicuro */
function safeParseJSON(text) {
  try {
    return JSON.parse(text);
  } catch { return null; }
}
function extractJSON(text) {
  const m = String(text).match(/\{[\s\S]*\}/);
  return m ? safeParseJSON(m[0]) : null;
}

/** Fallback JSON “simulato” (rispetta min. lo schema atteso) */
function localLLMJSON(system, user, schemaHint) {
  // Caso comune negli esempi: vogliamo {answer, citations}
  const lower = (user || "").toLowerCase();
  const sample = {
    answer: `🧪 (simulazione) Risposta basata sul contesto locale alla richiesta: "${truncate(user, 160)}"`,
    citations: [1]
  };
  // se c'è uno schema con chiavi, prova a rispettarle
  if (schemaHint && typeof schemaHint === "object") {
    const out = {};
    for (const k of Object.keys(schemaHint)) {
      out[k] = sample[k] ?? null;
    }
    return out;
  }
  // euristica per triage (usata altrove)
  if (/preventivo|budget|devis|quote|offerta|pricing|prezzo|costo/.test(lower)) {
    return { intent: "lead", urgency: "med", summary: truncate(user, 180) };
  }
  return sample;
}
function truncate(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
