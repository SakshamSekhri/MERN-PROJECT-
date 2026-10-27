import { saveProject, peekProject, clearProject } from './project.js';

const PREFIX = 'project_cloud_backup_';
const LEGACY = 'project_cloud_backup';
const STORAGE_PREFIX = 'pixelverse:';

export function isRecoverySlot(slot) {
  return slot === LEGACY || (typeof slot === 'string' && slot.startsWith(PREFIX));
}

export function saveRecovery(state) {
  const slot = `${PREFIX}${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`;
  const result = saveProject(state, slot);
  if (!result.ok || result.degraded) {
    clearProject(slot);
    throw new Error('A complete local recovery copy could not be saved. Export your current project or free browser storage before replacing the canvas.');
  }
  return slot;
}

export function listRecoveries() {
  const backups = [];
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      const slot = key.slice(STORAGE_PREFIX.length);
      if (!isRecoverySlot(slot)) continue;
      const project = peekProject(slot);
      if (project) backups.push({ slot, ...project });
    }
  } catch (error) {
    console.warn('[recovery] cannot list local copies', error);
  }
  return backups.sort((a, b) => (b.savedAt ?? 0) - (a.savedAt ?? 0));
}

export function deleteRecovery(slot) {
  if (!isRecoverySlot(slot)) throw new Error('Invalid local recovery copy.');
  clearProject(slot);
}
