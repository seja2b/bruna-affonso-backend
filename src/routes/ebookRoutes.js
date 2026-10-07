import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import authMiddleware from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { createEbook, deleteEbook, downloadEbook, getEbookCover, listEbooks, updateEbookCover } from '../controllers/ebookController.js'
import { objectStorageConfigured } from '../services/objectStorageService.js'

const router = express.Router()
const uploadDir = path.resolve(process.env.EBOOK_UPLOAD_DIR || 'private_uploads/ebooks')
const ebookMaxBytes = Number(process.env.EBOOK_MAX_BYTES || 60 * 1024 * 1024)
fs.mkdirSync(uploadDir, { recursive: true })
const storage = objectStorageConfigured()
  ? multer.memoryStorage()
  : multer.diskStorage({ destination: uploadDir, filename: (_req, file, done) => done(null, `${crypto.randomUUID()}${file.fieldname === 'cover' ? '.webp' : '.pdf'}`) })
const upload = multer({
  storage,
  limits: { fileSize: ebookMaxBytes, files: 2 },
  fileFilter: (_req, file, done) => {
    const valid = file.fieldname === 'file' ? file.mimetype === 'application/pdf' : file.fieldname === 'cover' && ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)
    return done(null, valid)
  },
})

function handleUpload(middleware) {
  return (req, res, next) => middleware(req, res, (error) => {
    if (error?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: `O PDF deve ter no máximo ${Math.floor(ebookMaxBytes / 1024 / 1024)} MB` })
    if (error) return res.status(400).json({ error: 'Não foi possível processar o arquivo enviado' })
    return next()
  })
}

router.use(authMiddleware)
router.get('/', requireRole('STUDENT', 'ADMIN'), listEbooks)
router.get('/:id/file', requireRole('STUDENT', 'ADMIN'), downloadEbook)
router.get('/:id/cover', requireRole('STUDENT', 'ADMIN'), getEbookCover)
router.post('/', requireRole('ADMIN'), handleUpload(upload.fields([{ name: 'file', maxCount: 1 }, { name: 'cover', maxCount: 1 }])), createEbook)
router.post('/:id/cover', requireRole('ADMIN'), handleUpload(upload.single('cover')), updateEbookCover)
router.delete('/:id', requireRole('ADMIN'), deleteEbook)

export default router
