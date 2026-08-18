import express from 'express'
import authMiddleware from '../middleware/authMiddleware.js'
import {
  getMyNotifications,
  markNotificationRead,
  markAllNotificationsRead
} from '../controllers/notificationController.js'

const router = express.Router()

router.use(authMiddleware)
router.get('/', getMyNotifications)
router.put('/read-all', markAllNotificationsRead)
router.put('/:notificationId/read', markNotificationRead)

export default router
