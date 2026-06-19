import type { Employee, ImportRecordType, ImportReviewRecord, ImportTarget, Task } from '../types';
import type { LocalImportDependencyNote, LocalImportFormat, LocalImportResult } from './types';

export function createFallbackImportResult(input: {
  sourceFile: string;
  format: LocalImportFormat;
  target: ImportTarget;
  reason: string;
  packageName?: string;
  fallback: string;
  status?: 'fallback' | 'unsupported';
}): LocalImportResult {
  const dependencyNote: LocalImportDependencyNote = {
    format: input.format,
    packageName: input.packageName,
    reason: input.reason,
    fallback: input.fallback,
  };

  return {
    sourceFile: input.sourceFile,
    format: input.format,
    target: input.target,
    status: input.status ?? 'fallback',
    records: [
      createUnsupportedReviewRecord({
        sourceFile: input.sourceFile,
        format: input.format,
        target: input.target,
        reason: input.reason,
        fallback: input.fallback,
      }),
    ],
    warnings: [input.reason, input.fallback],
    dependencyNotes: [dependencyNote],
  };
}

export function createUnsupportedReviewRecord(input: {
  sourceFile: string;
  format: LocalImportFormat;
  target: ImportTarget;
  reason: string;
  fallback: string;
}): ImportReviewRecord {
  const recordType = fallbackRecordTypeForTarget(input.target);
  const formatLabel = formatDisplayName(input.format);
  const slug = slugify(input.sourceFile);
  const issues = [
    `No ${formatLabel} parser is configured in current dependencies`,
    input.reason,
    input.target === 'auto'
      ? 'No record type could be inferred from this upload'
      : `No ${targetDisplayName(input.target)} records were extracted from this upload`,
    input.fallback,
  ];

  return {
    id: `${slug}-${input.format}-${recordType}-fallback`,
    type: recordType,
    reviewStatus: 'Needs Correction',
    confidence: 5,
    entity: recordType === 'employee' ? createFallbackEmployee(input, slug, formatLabel) : createFallbackTask(input, slug, formatLabel),
    issues,
    sourceFile: input.sourceFile,
  };
}

function fallbackRecordTypeForTarget(target: ImportTarget): ImportRecordType {
  return target === 'task' ? 'task' : 'employee';
}

function createFallbackEmployee(
  input: { sourceFile: string; target: ImportTarget },
  slug: string,
  formatLabel: string
): Employee {
  return {
    id: fallbackEntityId(slug),
    name: `Unsupported ${formatLabel} import`,
    role: 'Manual Review Required',
    department: 'Unassigned',
    location: 'Remote',
    availability: 0,
    availabilityStatus: 'Busy',
    skills: [],
    yearsExp: 0,
    readiness: 'Busy',
    avatar: `https://picsum.photos/seed/${encodeURIComponent(`${input.target}-${slug}`)}/200/200`,
  };
}

function createFallbackTask(input: { sourceFile: string }, slug: string, formatLabel: string): Task {
  return {
    id: fallbackEntityId(slug),
    name: `Unsupported ${formatLabel} import`,
    type: 'Manual Review',
    description: `Parser fallback for ${input.sourceFile}`,
    urgency: 'Medium',
    deadline: new Date().toISOString().slice(0, 10),
    estHours: 0,
    requiredSkills: [],
    optionalSkills: [],
    requiredSkillSpecs: [],
    optionalSkillSpecs: [],
    location: 'Remote',
    remote: true,
    teamSize: 1,
    staffingMode: 'One Employee',
    status: 'Needs Review',
  };
}

function fallbackEntityId(slug: string) {
  return `UNSUPPORTED-${slug.toUpperCase().slice(0, 28) || 'UPLOAD'}`;
}

function targetDisplayName(target: ImportTarget) {
  if (target === 'task') return 'task';
  if (target === 'roster') return 'roster';
  return 'employee';
}

function formatDisplayName(format: LocalImportFormat) {
  if (format === 'csv') return 'CSV';
  if (format === 'excel') return 'Excel';
  if (format === 'pdf') return 'PDF';
  if (format === 'word') return 'Word';
  return 'file';
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'upload';
}
