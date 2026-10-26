import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { requireAuth, authConfig, register, verifyEmail, resendVerification, login, googleLogin, googleTransfer, redeemGoogleTransfer, linkGoogle, googleLinkIntent, completeGoogleLink, refresh, logout, logoutAll, forgotPassword, resetPassword, me, updateMe } from '../controllers/authController.js';

export const authRouter = Router();
const authLimit = () => rateLimit({ windowMs: 15 * 60 * 1000, limit: 20, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many attempts. Try again later.' } });
const refreshLimit = () => rateLimit({ windowMs: 15 * 60 * 1000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Too many session checks. Try again later.' } });

authRouter.get('/config', authConfig);
authRouter.post('/register', authLimit(),register);
authRouter.post('/verify', authLimit(),verifyEmail);
authRouter.post('/resend-verification', authLimit(),resendVerification);
authRouter.post('/login', authLimit(),login);
authRouter.post('/google', authLimit(),googleLogin);
authRouter.post('/google-transfer', authLimit(),googleTransfer);
authRouter.post('/redeem-google-transfer', authLimit(),redeemGoogleTransfer);
authRouter.post('/link-google', authLimit(), requireAuth,linkGoogle);
authRouter.post('/google-link-intent', authLimit(), requireAuth,googleLinkIntent);
authRouter.post('/complete-google-link', authLimit(),completeGoogleLink);
authRouter.post('/refresh', refreshLimit(),refresh);
authRouter.post('/logout', requireAuth,logout);
authRouter.post('/logout-all', requireAuth,logoutAll);
authRouter.post('/forgot-password', authLimit(),forgotPassword);
authRouter.post('/reset-password', authLimit(),resetPassword);
authRouter.get('/me', requireAuth, me);
authRouter.patch('/me', requireAuth,updateMe);
