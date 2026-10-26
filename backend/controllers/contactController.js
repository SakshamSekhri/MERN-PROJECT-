import { sendContactMail } from '../mail.js';

const categories = new Set(['bug', 'account', 'feedback', 'other']);

export async function submitContact(request, response) {
  const { name, email, category, message, website } = request.body ?? {};
  if (website) return response.status(202).json({ message: 'Message sent.' });
  if (typeof name !== 'string' || typeof email !== 'string' ||
      typeof category !== 'string' || typeof message !== 'string')
    return response.status(400).json({ error: 'Complete all contact fields.' });

  const cleanName = name.trim();
  const cleanEmail = email.trim();
  const cleanMessage = message.trim();
  if (cleanName.length < 2 || cleanName.length > 80 || /[\r\n]/.test(cleanName) ||
      cleanEmail.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail) ||
      !categories.has(category) || cleanMessage.length < 10 || cleanMessage.length > 4000)
    return response.status(400).json({ error: 'Check your name, email, category, and message length.' });

  await sendContactMail({ name: cleanName, email: cleanEmail, category, message: cleanMessage });
  response.status(202).json({ message: 'Message sent.' });
}
