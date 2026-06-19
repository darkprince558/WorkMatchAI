import type { ImportReviewRecord, ImportTarget } from '../types';

export type LocalImportFormat = 'csv' | 'excel' | 'pdf' | 'word' | 'unsupported';
export type LocalImportStatus = 'parsed' | 'fallback' | 'unsupported';

export interface LocalImportSource {
  name: string;
  type?: string;
  mimeType?: string;
  size?: number;
  content?: string | ArrayBuffer | Uint8Array;
  text?: () => string | Promise<string>;
  arrayBuffer?: () => ArrayBuffer | Promise<ArrayBuffer>;
}

export interface LocalImportOptions {
  target?: ImportTarget;
}

export interface ResolvedLocalImportOptions {
  target: ImportTarget;
}

export interface LocalImportDependencyNote {
  format: LocalImportFormat;
  packageName?: string;
  reason: string;
  fallback: string;
}

export interface LocalImportResult {
  sourceFile: string;
  format: LocalImportFormat;
  target: ImportTarget;
  status: LocalImportStatus;
  records: ImportReviewRecord[];
  warnings: string[];
  dependencyNotes: LocalImportDependencyNote[];
}

export interface LocalImportAdapter {
  readonly format: LocalImportFormat;
  parse(source: LocalImportSource, options: ResolvedLocalImportOptions): Promise<LocalImportResult>;
}

export function resolveLocalImportOptions(options: LocalImportOptions = {}): ResolvedLocalImportOptions {
  return {
    target: options.target ?? 'auto',
  };
}
