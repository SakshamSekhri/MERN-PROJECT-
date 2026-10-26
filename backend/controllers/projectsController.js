import mongoose from 'mongoose';
import { Canvas } from '../models/index.js';
import { validateProject } from '../models/projectValidation.js';

function bad(message) { return Object.assign(new Error(message), { status: 400 }); }
function validTitle(value) { return typeof value === 'string' && value.trim().length >= 1 && value.trim().length <= 120; }
function summary(doc) { return { id: String(doc.id), title: doc.title, gridSize: doc.gridSize, frames: doc.frameIds.length, updatedAt: doc.updatedAt }; }
function parseProject(request) {
  if (!validTitle(request.body?.title) || !validateProject(request.body?.project)) throw bad('Invalid project title or data');
  return { title: request.body.title.trim(), project: request.body.project };
}

export async function listProjects(request, response) {
  const docs = await Canvas.find({ ownerId: request.user.id }).sort({ updatedAt: -1 }).limit(100).select('title gridSize frameIds updatedAt');
  response.json({ projects: docs.map(summary) });
}

export async function createProject(request, response) {
  const { title, project } = parseProject(request);
  const doc = await Canvas.create({ title, ownerId: request.user.id, gridSize: project.gridSize, frameIds: project.frames.map(frame => frame.id), checkpoint: project, visibility: 'private' });
  response.status(201).json({ project: summary(doc) });
}

export async function getProject(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ error: 'Project not found' });
  const doc = await Canvas.findOne({ _id: request.params.id, ownerId: request.user.id });
  if (!doc) return response.status(404).json({ error: 'Project not found' });
  response.json({ project: { ...summary(doc), data: doc.checkpoint } });
}

export async function updateProject(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ error: 'Project not found' });
  const { title, project } = parseProject(request);
  const doc = await Canvas.findOneAndUpdate({ _id: request.params.id, ownerId: request.user.id }, {
    $set: { title, gridSize: project.gridSize, frameIds: project.frames.map(frame => frame.id), checkpoint: project },
  }, { new: true, runValidators: true });
  if (!doc) return response.status(404).json({ error: 'Project not found' });
  response.json({ project: summary(doc) });
}

export async function deleteProject(request, response) {
  if (!mongoose.isValidObjectId(request.params.id)) return response.status(404).json({ error: 'Project not found' });
  const doc = await Canvas.findOneAndDelete({ _id: request.params.id, ownerId: request.user.id });
  if (!doc) return response.status(404).json({ error: 'Project not found' });
  response.status(204).end();
}
