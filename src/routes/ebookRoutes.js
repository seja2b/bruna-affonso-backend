import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import authMiddleware from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { createEbook, deleteEbook, downloadEbook, listEbooks } from '../controllers/ebookController.js'
import { objectStorageConfigured } from '../services/objectStorageService.js'

const router = express.Router()
const uploadDir = path.resolve(process.env.EBOOK_UPLOAD_DIR || 'private_uploads/ebooks')
const ebookMaxBytes = Number(process.env.EBOOK_MAX_BYTES || 60 * 1024 * 1024)
fs.mkdirSync(uploadDir, { recursive: true })
const storage = objectStorageConfigured()
  ? multer.memoryStorage()
  : multer.diskStorage({ destination: uploadDir, filename: (_req, _file, done) => done(null, `${crypto.randomUUID()}.pdf`) })
const upload = multer({ storage, limits: { fileSize: ebookMaxBytes, files: 1 }, fileFilter: (_req, file, done) => done(null, file.mimetype === 'application/pdf') })

function uploadPdf(req, res, next) {
  upload.single('file')(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `O PDF deve ter no máximo ${Math.floor(ebookMaxBytes / 1024 / 1024)} MB` })
    if (error) return res.status(400).json({ error: 'Não foi possível processar o PDF enviado' })
    return next()
  })
}

router.use(authMiddleware)
router.get('/', requireRole('STUDENT', 'ADMIN'), listEbooks)
router.get('/:id/file', requireRole('STUDENT', 'ADMIN'), downloadEbook)
router.post('/', requireRole('ADMIN'), uploadPdf, createEbook)
router.delete('/:id', requireRole('ADMIN'), deleteEbook)

export default router
