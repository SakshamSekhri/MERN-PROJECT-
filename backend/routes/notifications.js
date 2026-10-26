import { Router } from 'express';
import { requireAuth } from '../controllers/authController.js';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../controllers/notificationsController.js';

export const notificationsRouter = Router();
notificationsRouter.get('/', requireAuth,getNotifications);
notificationsRouter.patch('/:id/read', requireAuth,markNotificationRead);
notificationsRouter.post('/read-all', requireAuth,markAllNotificationsRead);
