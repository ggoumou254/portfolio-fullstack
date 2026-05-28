// backend/scripts/fix-project-image-paths.mjs
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Project from '../models/Project.js';
import { fileURLToPath } from 'url';

dotenv.config();
const ROOT = process.cwd();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/portfolio';
const looksLikeFilename = (s) => /^[a-z0-9._-]+\.(png|jpe?g|webp|gif|svg)$/i.test(String(s||'').trim());

const fileExists = (relPath) => {
  try { return fs.existsSync(path.join(ROOT, relPath)); } catch { return false; }
};

(async () => {
  try {
    await mongoose.connect(MONGO, { maxPoolSize: 5 });
    console.log('✅ MongoDB connected');

    const projects = await Project.find({}, { image:1, thumbnail:1 }).lean();
    let updated = 0, skipped = 0;

    for (const p of projects) {
      const original = (p.image || p.thumbnail || '').trim();
      if (!original) { skipped++; continue; }

      // già assoluto / già /uploads/... => lascia stare
      if (/^https?:\/\//i.test(original) || /^\/uploads\//i.test(original)) { skipped++; continue; }

      // filename puro?
      if (!looksLikeFilename(original)) { skipped++; continue; }

      const candidateImages   = `/uploads/images/${original}`;
      const candidateProjects = `/uploads/projects/${original}`;
      let fixed = null;

      if (fileExists(candidateImages)) fixed = candidateImages;
      else if (fileExists(candidateProjects)) fixed = candidateProjects;

      if (fixed) {
        await Project.updateOne({ _id: p._id }, { $set: { image: fixed } });
        updated++;
        console.log(`🔧 ${p._id} -> ${fixed}`);
      } else {
        // se non esiste da nessuna parte non tocchiamo
        skipped++;
      }
    }

    console.log(`\n✅ Done. Updated: ${updated}, Skipped: ${skipped}, Total: ${projects.length}`);
  } catch (e) {
    console.error('❌ Fix error', e);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Mongo closed');
  }
})();
// backend/scripts/fix-project-image-paths.mjs
import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Project from '../models/Project.js';
import { fileURLToPath } from 'url';

dotenv.config();
const ROOT = process.cwd();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/portfolio';
const looksLikeFilename = (s) => /^[a-z0-9._-]+\.(png|jpe?g|webp|gif|svg)$/i.test(String(s||'').trim());

const fileExists = (relPath) => {
  try { return fs.existsSync(path.join(ROOT, relPath)); } catch { return false; }
};

(async () => {
  try {
    await mongoose.connect(MONGO, { maxPoolSize: 5 });
    console.log('✅ MongoDB connected');

    const projects = await Project.find({}, { image:1, thumbnail:1 }).lean();
    let updated = 0, skipped = 0;

    for (const p of projects) {
      const original = (p.image || p.thumbnail || '').trim();
      if (!original) { skipped++; continue; }

      // già assoluto / già /uploads/... => lascia stare
      if (/^https?:\/\//i.test(original) || /^\/uploads\//i.test(original)) { skipped++; continue; }

      // filename puro?
      if (!looksLikeFilename(original)) { skipped++; continue; }

      const candidateImages   = `/uploads/images/${original}`;
      const candidateProjects = `/uploads/projects/${original}`;
      let fixed = null;

      if (fileExists(candidateImages)) fixed = candidateImages;
      else if (fileExists(candidateProjects)) fixed = candidateProjects;

      if (fixed) {
        await Project.updateOne({ _id: p._id }, { $set: { image: fixed } });
        updated++;
        console.log(`🔧 ${p._id} -> ${fixed}`);
      } else {
        // se non esiste da nessuna parte non tocchiamo
        skipped++;
      }
    }

    console.log(`\n✅ Done. Updated: ${updated}, Skipped: ${skipped}, Total: ${projects.length}`);
  } catch (e) {
    console.error('❌ Fix error', e);
  } finally {
    await mongoose.connection.close();
    console.log('✅ Mongo closed');
  }
})();
