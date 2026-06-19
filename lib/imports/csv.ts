import { importRowsFromCsv } from '../workmatch';
import { readSourceText } from './readers';
import type { LocalImportAdapter, LocalImportResult, LocalImportSource, ResolvedLocalImportOptions } from './types';

export const csvImportAdapter: LocalImportAdapter = {
  format: 'csv',
  async parse(source: LocalImportSource, options: ResolvedLocalImportOptions): Promise<LocalImportResult> {
    const text = await readSourceText(source);
    const records = importRowsFromCsv(text, source.name, options.target);

    return {
      sourceFile: source.name,
      format: 'csv',
      target: options.target,
      status: 'parsed',
      records,
      warnings: records.length ? [] : ['CSV parser did not find enough rows to create review records'],
      dependencyNotes: [],
    };
  },
};
