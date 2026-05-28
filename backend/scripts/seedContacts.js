// backend/scripts/seedContacts.js
import 'dotenv/config';
import mongoose from 'mongoose';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Import del modello
import Contact from '../models/Contact.js';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randomDateWithinDays(days = 30) {
  const now = Date.now();
  const past = now - days * 24 * 60 * 60 * 1000;
  return new Date(randomInt(past, now));
}
function pick(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

const NAMES = [
  'Alice Martin', 'Luca Bianchi', 'Sofia Rossi', 'Hugo Dubois', 'Marta Ricci',
  'Noah Bernard', 'Giulia Conti', 'Emma Moretti', 'Yanis Lefevre', 'Chiara Greco'
];
const SUBJECTS = [
  'Demande de devis', 'Collaboration projet', 'Bug sur le site', 'Feedback portfolio',
  'Richiesta informazioni', 'Supporto tecnico', 'Stage/Internship', 'Proposta commerciale'
];
const MESSAGES = [
  'Bonjour, je voudrais plus d’informations sur vos services.',
  'Ciao! Vorrei collaborare su un progetto full-stack con React + Node.',
  'Ho visto il tuo portfolio, ottimo lavoro! Possiamo sentirci?',
  'There is a small issue on the contact form when submitting from mobile.',
  'Sarei interessato a un preventivo per un sito vetrina.',
  'Je cherche un développeur pour une mission courte (2 semaines).',
  'Mi piacerebbe discutere di un’opportunità di stage.',
  'Could you share availability for a quick call this week?'
];

function makeMessage(i) {
  const name = pick(NAMES);
  const first = name.split(' ')[0].toLowerCase();
  const email = `${first}.${i}@example.com`;
  const subject = pick(SUBJECTS);
  const message = pick(MESSAGES) + '\n' + pick(MESSAGES);
  const isRead = Math.random() < 0.5;
  const status = isRead ? pick(['read', 'archived', 'read']) : 'new';
  const createdAt = randomDateWithinDays(30);
  const updatedAt = new Date(createdAt.getTime() + randomInt(0, 5) * 3600 * 1000);

  return {
    name,
    email: email.toLowerCase(),
    subject,
    message,
    isRead,
    status,
    createdAt,
    updatedAt
  };
}

async function main() {
  const { MONGO_URI } = process.env;
  if (!MONGO_URI) {
    console.error('❌ MONGO_URI mancante nel .env');
    process.exit(1);
  }

  const args = process.argv.slice(2);
  const purge = args.includes('--purge');
  const countArg = args.find(a => a.startsWith('--count='));
  const COUNT = countArg ? Math.max(1, parseInt(countArg.split('=')[1], 10)) : 40;

  await mongoose.connect(MONGO_URI, {
    maxPoolSize: 5,
    serverSelectionTimeoutMS: 5000
  });
  console.log('✅ Connesso a MongoDB');

  if (purge) {
    const del = await Contact.deleteMany({});
    console.log(`🧹 Pulizia: rimossi ${del.deletedCount} documenti`);
  }

  const docs = Array.from({ length: COUNT }, (_, i) => makeMessage(i + 1));
  const res = await Contact.insertMany(docs);
  console.log(`🌱 Inseriti ${res.length} contatti di test`);

  // Stat riepilogo
  const [total, unread, read] = await Promise.all([
    Contact.countDocuments({}),
    Contact.countDocuments({ isRead: false }),
    Contact.countDocuments({ isRead: true }),
  ]);
  console.log(`📊 Totale: ${total} | Unread: ${unread} | Read: ${read}`);

  await mongoose.connection.close();
  console.log('👋 Connessione chiusa. Done.');
}

main().catch(async (err) => {
  console.error('❌ Seed error:', err?.message || err);
  try { await mongoose.connection.close(); } catch {}
  process.exit(1);
});
