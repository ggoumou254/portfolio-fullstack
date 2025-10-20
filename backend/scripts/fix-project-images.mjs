// backend/scripts/fix-project-images.mjs
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import Project from '../models/Project.js';

dotenv.config();

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/portfolio';

const isFilename = (s) =>
  /^[a-z0-9._-]+\.(png|jpe?g|webp|gif|svg)$/i.test(String(s||'').trim());

const isAbsoluteUrl = (s) => {
  try { const u = new URL(String(s)); return u.protocol === 'http:' || u.protocol === 'https:'; }
  catch { return false; }
};

const needsLeadingSlash = (s) =>
  /^uploads\//i.test(String(s||''));

(async () => {
  try {
    await mongoose.connect(MONGO, { maxPoolSize: 5 });
    console.log('✅ MongoDB connected');

    const projects = await Project.find({}, { image: 1, thumbnail: 1 }).lean();
    let updated = 0, skipped = 0;

    for (const p of projects) {
      const original = p.image || p.thumbnail || '';
      let img = String(original).trim();
      if (!img) { skipped++; continue; }

      // già a posto? (URL assoluta o /uploads/…)
      if (isAbsoluteUrl(img) || /^\/uploads\//i.test(img)) { skipped++; continue; }

      // aggiusta i casi comuni
      if (isFilename(img)) {
        img = `/uploads/projects/${img}`;
      } else if (needsLeadingSlash(img)) {
        img = `/${img}`;
      } else {
        // altro formato (relativo a pagina): prova a normalizzare su /uploads/projects
        const justName = img.split('/').pop();
        if (isFilename(justName)) img = `/uploads/projects/${justName}`;
      }

      if (img !== original) {
        await Project.updateOne({ _id: p._id }, { $set: { image: img } });
        updated++;
        console.log(`🔧 ${p._id} → ${img}`);
      } else {
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
