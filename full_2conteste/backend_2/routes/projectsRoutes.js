import express from 'express';
import multer from 'multer';
import Project from '../models/Project.js';
import { verifyToken, checkAdmin } from '../middleware/authMiddleware.js';
import path from 'path';
import fs from 'fs';

const router = express.Router();
const uploadDir = 'uploads/projects';
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname)),
});
const upload = multer({ storage });

function toClient(p) { const obj = p.toObject ? p.toObject() : p; return { id: obj._id, title: obj.title, description: obj.description, technologies: obj.technologies || [], github: obj.github || '', demo: obj.liveDemo || '', image: obj.image || '', createdAt: obj.createdAt }; }

// GET pubblico
router.get('/', async (_req, res) => { const projects = await Project.find().sort({ createdAt: -1 }); res.json(projects.map(toClient)); });
router.get('/:id', async (req, res) => { const p = await Project.findById(req.params.id); if (!p) return res.status(404).json({ error: 'Progetto non trovato' }); res.json(toClient(p)); });

// Admin solo
router.post('/', verifyToken, checkAdmin, upload.single('image'), async (req, res) => {
  const { title, description, technologies, github, liveDemo } = req.body;
  const project = await Project.create({ title, description, technologies: technologies?.split(',').map(t=>t.trim()).filter(Boolean), github, liveDemo, image: req.file ? `/${uploadDir}/${req.file.filename}` : '' });
  res.status(201).json(toClient(project));
});
router.put('/:id', verifyToken, checkAdmin, upload.single('image'), async (req, res) => {
  const { title, description, technologies, github, liveDemo } = req.body;
  const payload = { title, description, technologies: technologies?.split(',').map(t=>t.trim()).filter(Boolean), github, liveDemo };
  if (req.file) payload.image = `/${uploadDir}/${req.file.filename}`;
  const updated = await Project.findByIdAndUpdate(req.params.id, payload, { new: true });
  if (!updated) return res.status(404).json({ error: 'Progetto non trovato' });
  res.json(toClient(updated));
});
router.delete('/:id', verifyToken, checkAdmin, async (req, res) => { const deleted = await Project.findByIdAndDelete(req.params.id); if (!deleted) return res.status(404).json({ error: 'Progetto non trovato' }); res.json({ message: 'Progetto eliminato' }); });

export default router;
