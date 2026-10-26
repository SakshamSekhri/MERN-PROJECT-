import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { submitContact } from '../controllers/contactController.js';

export const contactRouter = Router();
contactRouter.post('/', rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: 'Too many messages. Please try again later.' },
}), submitContact);
