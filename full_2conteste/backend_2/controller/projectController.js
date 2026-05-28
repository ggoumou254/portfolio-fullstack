// backend/controllers/projectController.js
import Project from '../models/Project.js';
import fs from 'fs';
import path from 'path';

function toClient(p) {
  const obj = p.toObject ? p.toObject() : p;
  return {
    id: obj._id,
    title: obj.title,
    description: obj.description,
    technologies: obj.technologies || [],
    github: obj.github || '',
    demo: obj.liveDemo || '',
    image: obj.image || '',
    createdAt: obj.createdAt,
    updatedAt: obj.updatedAt
  };
}

// GET list (pubblico)
export async function listProjects(req, res) {
  try {
    const projects = await Project.find().sort({ createdAt: -1 }).lean();
    res.json(projects.map(p => toClient(p)));
  } catch (err) {
    console.error('listProjects error:', err);
    res.status(500).json({ message: 'Errore caricamento progetti' });
  }
}

// GET single
export async function getProject(req, res) {
  try {
    const p = await Project.findById(req.params.id);
    if (!p) return res.status(404).json({ message: 'Progetto non trovato' });
    res.json(toClient(p));
  } catch (err) {
    console.error('getProject error:', err);
    res.status(500).json({ message: 'Errore caricamento progetto' });
  }
}

// CREATE (admin) - req.file opzionale (multer)
export async function createProject(req, res) {
  try {
    const { title, description, technologies, github, liveDemo } = req.body || {};
    if (!title || !description) return res.status(400).json({ message: 'Titolo e descrizione obbligatori' });

    const techArr = Array.isArray(technologies)
      ? technologies
      : String(technologies || '').split(',').map(t => t.trim()).filter(Boolean);

    const image = req.file ? `/${path.posix.join('uploads/projects', req.file.filename)}` : '';

    const project = await Project.create({
      title,
      description,
      technologies: techArr,
      github,
      liveDemo,
      image
    });

    res.status(201).json(toClient(project));
  } catch (err) {
    console.error('createProject error:', err);
    res.status(500).json({ message: 'Errore creazione progetto' });
  }
}

// UPDATE (admin)
export async function updateProject(req, res) {
  try {
    const { title, description, technologies, github, liveDemo } = req.body || {};
    if (!title || !description) return res.status(400).json({ message: 'Titolo e descrizione obbligatori' });

    const techArr = Array.isArray(technologies)
      ? technologies
      : String(technologies || '').split(',').map(t => t.trim()).filter(Boolean);

    const payload = { title, description, technologies: techArr, github, liveDemo };
    if (req.file) payload.image = `/${path.posix.join('uploads/projects', req.file.filename)}`;

    const updated = await Project.findByIdAndUpdate(req.params.id, payload, { new: true });
    if (!updated) return res.status(404).json({ message: 'Progetto non trovato' });

    res.json(toClient(updated));
  } catch (err) {
    console.error('updateProject error:', err);
    res.status(500).json({ message: 'Errore aggiornamento progetto' });
  }
}

// DELETE (admin)
export async function deleteProject(req, res) {
  try {
    const deleted = await Project.findByIdAndDelete(req.params.id);
    if (!deleted) return res.status(404).json({ message: 'Progetto non trovato' });

    // opzionale: rimuovi file immagine dal disco
    if (deleted.image) {
      const p = deleted.image.startsWith('/') ? deleted.image.slice(1) : deleted.image;
      try { fs.unlinkSync(p); } catch (e) { /* ignore */ }
    }

    res.json({ message: 'Progetto eliminato' });
  } catch (err) {
    console.error('deleteProject error:', err);
    res.status(500).json({ message: 'Errore eliminazione progetto' });
  }
}
