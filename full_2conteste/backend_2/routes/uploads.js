import { Router } from 'express';
import multer from 'multer';
import { verifyToken, checkAdmin } from '../middleware/authMiddleware.js';

const router = Router();
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, 'uploads/'),
  filename: (_req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});
const upload = multer({ storage });

router.post('/', verifyToken, checkAdmin, upload.single('image'), (req, res) => {
  res.json({ imageUrl: `/uploads/${req.file.filename}` });
});

export default router;
