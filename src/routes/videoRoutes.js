import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { requireRole } from '../middleware/roleMiddleware.js'
import { getVideos, createVideo, updateVideo, deleteVideo } from '../controllers/videoController.js'

const router = express.Router()

router.use(authMiddleware)
router.get('/', getVideos)
router.post('/', requireRole('ADMIN'), createVideo)
router.put('/:videoId', requireRole('ADMIN'), updateVideo)
router.delete('/:videoId', requireRole('ADMIN'), deleteVideo)

export default router
