import { Router } from 'express';
import { sendMessage, getMessages, getMessageById, deleteMessage } from '../controller/contactController.js';
import { verifyToken, checkAdmin } from '../middleware/authMiddleware.js';

const router = Router();

// Pubblico
router.post('/', sendMessage);

// Admin
router.get('/', verifyToken, checkAdmin, getMessages);
router.get('/:id', verifyToken, checkAdmin, getMessageById);
router.delete('/:id', verifyToken, checkAdmin, deleteMessage);

export default router;
