import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import authMiddleware from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { createEbook, deleteEbook, downloadEbook, listEbooks } from '../controllers/ebookController.js'

const router = express.Router()
const uploadDir = path.resolve(process.env.EBOOK_UPLOAD_DIR || 'private_uploads/ebooks')
fs.mkdirSync(uploadDir, { recursive: true })
const upload = multer({ storage: multer.diskStorage({ destination: uploadDir, filename: (_req, _file, done) => done(null, `${crypto.randomUUID()}.pdf`) }), limits: { fileSize: Number(process.env.EBOOK_MAX_BYTES || 20 * 1024 * 1024), files: 1 }, fileFilter: (_req, file, done) => done(null, file.mimetype === 'application/pdf') })

router.use(authMiddleware)
router.get('/', requireRole('STUDENT', 'ADMIN'), listEbooks)
router.get('/:id/file', requireRole('STUDENT', 'ADMIN'), downloadEbook)
router.post('/', requireRole('ADMIN'), upload.single('file'), createEbook)
router.delete('/:id', requireRole('ADMIN'), deleteEbook)

export default router
