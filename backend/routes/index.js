import { healthStatus } from '../controllers/healthController.js';
import { authRouter } from '../auth.js';
import { projectsRouter } from './projects.js';
import { galleryRouter } from '../gallery.js';
import { contactRouter } from '../contact.js';
import { notificationsRouter } from '../notifications.js';

export function mountApiRoutes(app) {
  app.get('/api/health', healthStatus);
  app.use('/api/auth', authRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/gallery', galleryRouter);
  app.use('/api/contact', contactRouter);
  app.use('/api/notifications', notificationsRouter);
}
