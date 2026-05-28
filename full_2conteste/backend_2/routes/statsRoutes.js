import { Router } from 'express';
import Project from '../models/Project.js';
import Contact from '../models/Contact.js';
import Subscriber from '../models/Subscriber.js';

const router = Router();

router.get('/', async (_req, res) => {
  try {
    const [projects, contacts, subscribers] = await Promise.all([
      Project.find().lean(),
      Contact.find().lean(),
      Subscriber.find().lean(),
    ]);

    const techUsage = {};
    projects.forEach(p => {
      if (!p.technologies) return;
      const arr = Array.isArray(p.technologies) ? p.technologies : String(p.technologies).split(',').map(t => t.trim()).filter(Boolean);
      arr.forEach(tech => { const k = tech.toLowerCase(); techUsage[k] = (techUsage[k] || 0) + 1; });
    });

    res.json({ projectsCount: projects.length, contactsCount: contacts.length, subscribersCount: subscribers.length, techUsage });
  } catch (err) {
    console.error('Errore nel calcolo delle statistiche:', err);
    res.status(500).json({ message: 'Errore nel server' });
  }
});

export default router;
