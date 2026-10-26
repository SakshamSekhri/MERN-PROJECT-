import { Router } from 'express';
import { requireAuth } from '../controllers/authController.js';
import { listProjects, createProject, getProject, updateProject, deleteProject } from '../controllers/projectsController.js';

export const projectsRouter = Router();
projectsRouter.use(requireAuth);
projectsRouter.get('/', listProjects);
projectsRouter.post('/', createProject);
projectsRouter.get('/:id', getProject);
projectsRouter.put('/:id', updateProject);
projectsRouter.delete('/:id', deleteProject);
