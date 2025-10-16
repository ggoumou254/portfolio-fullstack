
import 'dotenv/config';
import mongoose from 'mongoose';
import pLimit from 'p-limit';
import Project from '../models/Project.js';
import Embedding from '../models/Embedding.js';
import { embed } from '../utils/ai.js';


const MONGO = process.env.MONGO_URI || process.env.MONGODB_URI;
if (!MONGO) { console.error('MONGO_URI mancante'); process.exit(1); }


const limit = pLimit(4);
const embModel = process.env.AI_EMBEDDING_MODEL || 'text-embedding-3-small';


function chunk(text, size = 800) {
const words = String(text || '').split(/\s+/);
const out = [];
let cur = [];
for (const w of words) {
cur.push(w);
if (cur.join(' ').length > size) { out.push(cur.join(' ')); cur = []; }
}
if (cur.length) out.push(cur.join(' '));
return out;
}


(async () => {
await mongoose.connect(MONGO);
const projects = await Project.find({ status: 'published' }).select('title description technologies');


let done = 0, upserts = 0;
await Promise.all(projects.map(p => limit(async () => {
const base = `${p.title}\n\n${p.description}\n\nTech: ${(p.technologies||[]).join(', ')}`;
const chunks = chunk(base, 900).slice(0, 6);
for (let i = 0; i < chunks.length; i++) {
const text = chunks[i];
const vector = await embed(text);
const chunkId = `project:${p._id}:ch${i}`;
await Embedding.updateOne(
{ refId: p._id, chunkId },
{ $set: {
source: 'project', refId: p._id, chunkId, lang: 'it',
text, vector, vectorDim: vector.length,
meta: { tech: p.technologies || [], embModel }
} },
{ upsert: true }
);
upserts++;
}
done++;
if (done % 5 === 0) console.log(`Indicizzati ${done}/${projects.length} progetti…`);
})));


console.log(`✅ Finito. Progetti: ${projects.length}, chunk upsert: ${upserts}`);
await mongoose.disconnect();
process.exit(0);
})().catch(async (e) => { console.error(e); await mongoose.disconnect(); process.exit(1); });