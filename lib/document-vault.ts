import type { Task, WorkMatchDocument } from './types';

export interface ProjectDocument extends WorkMatchDocument {
  taskId: string;
  taskName: string;
}

export function getProjectDocuments(tasks: Task[]): ProjectDocument[] {
  const documents = new Map<string, ProjectDocument>();

  tasks.forEach((task) => {
    (task.sourceDocuments ?? []).forEach((document) => {
      documents.set(document.id, {
        ...document,
        taskId: task.id,
        taskName: task.name,
        targetType: 'task',
        targetId: task.id,
        targetName: task.name,
      });
    });
  });

  return Array.from(documents.values()).sort((a, b) => b.linkedAt.localeCompare(a.linkedAt));
}

export function downloadWorkMatchDocument(document: WorkMatchDocument) {
  if (!document.dataUrl) return false;

  const link = window.document.createElement('a');
  link.href = document.dataUrl;
  link.download = document.fileName;
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
}

export function formatFileSize(sizeBytes?: number) {
  if (!sizeBytes || sizeBytes <= 0) return 'Unknown size';
  if (sizeBytes < 1024) return `${sizeBytes} B`;
  if (sizeBytes < 1024 * 1024) return `${(sizeBytes / 1024).toFixed(1)} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function mergeDocumentLists(existing: WorkMatchDocument[] = [], incoming: WorkMatchDocument[] = []) {
  const documents = new Map(existing.map((document) => [document.id, document]));
  incoming.forEach((document) => documents.set(document.id, document));
  return Array.from(documents.values()).sort((a, b) => b.linkedAt.localeCompare(a.linkedAt));
}
