import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import { getVideos } from '../controllers/videoController.js'

const router = express.Router()

router.get('/', authMiddleware, getVideos)

export default router
