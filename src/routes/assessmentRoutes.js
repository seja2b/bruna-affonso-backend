import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import express from 'express'
import multer from 'multer'
import authMiddleware from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { getMyAssessments, getPrivatePhoto, markAssessmentIntroductionSeen, saveStage, uploadPhoto } from '../controllers/assessmentController.js'
const router = express.Router()
const uploadDir = path.resolve(process.env.ASSESSMENT_UPLOAD_DIR || 'private_uploads/assessments')
fs.mkdirSync(uploadDir, { recursive: true })
const upload = multer({ storage: multer.diskStorage({ destination: uploadDir, filename: (_req, file, done) => done(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`) }), limits: { fileSize: Number(process.env.ASSESSMENT_PHOTO_MAX_BYTES || 8 * 1024 * 1024), files: 1 }, fileFilter: (_req, file, done) => done(null, ['image/jpeg', 'image/png', 'image/webp'].includes(file.mimetype)) })
router.use(authMiddleware)
router.get('/', requireRole('STUDENT'), getMyAssessments)
router.patch('/introduction-seen', requireRole('STUDENT'), markAssessmentIntroductionSeen)
router.patch('/:cycleId/stages/:stage', requireRole('STUDENT'), saveStage)
router.post('/:cycleId/photos/:view', requireRole('STUDENT'), upload.single('photo'), uploadPhoto)
router.get('/photos/:photoId', requireRole('STUDENT', 'ADMIN'), getPrivatePhoto)
export default router
