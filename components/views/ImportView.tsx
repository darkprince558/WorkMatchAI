'use client';

import { Fragment, useCallback, useEffect, useId, useRef, useState } from 'react';
import { Employee, ImportReviewRecord, ImportTarget, ResumeProfileUpdateReview, SkillRequirement, Task, WorkMatchDocument } from '@/lib/types';
import { formatFileSize } from '@/lib/document-vault';
import { getImportIssues, isTask, parseSkillRequirements, parseSkills } from '@/lib/workmatch';
import { requestAgentOutput } from '@/lib/agents/client';
import type { AgentOutputEnvelope, DocumentExtractionAssistanceOutput, SkillNormalizationInput, SkillNormalizationOutput } from '@/lib/agents/contracts';
import { parseLocalImportSource } from '@/lib/imports';
import { buildManagerResumeImportRecord, extractResumeText, mergeResumeImportRecordWithDocumentExtraction } from '@/lib/resume-extraction';
import type { DataSourceId, EnabledDataSources } from '@/lib/settings';
import { recordMonitoringEvent } from '@/lib/monitoring/client';
import {
  AlertCircle,
  CheckCircle,
  FileSpreadsheet,
  FileText,
  Loader2,
  Pencil,
  Sparkles,
  UploadCloud,
  X,
  ShieldCheck,
} from 'lucide-react';

interface ImportViewProps {
  commitImports: (records: ImportReviewRecord[]) => void;
  existingEmployees?: Employee[];
  existingTasks?: Task[];
  confidenceThreshold: number;
  setConfidenceThreshold: (confidenceThreshold: number) => void;
  requireReview: boolean;
  showAuditTrail: boolean;
  enabledDataSources: EnabledDataSources;
  queuedUpload?: {
    id: string;
    files: File[];
    documents?: WorkMatchDocument[];
    target: ImportTarget;
    context?: {
      taskId?: string;
      taskName?: string;
    };
  } | null;
  onQueuedUploadHandled?: (id: string) => void;
}

type QueuedUploadContext = NonNullable<ImportViewProps['queuedUpload']>['context'];

const duplicateIssuePrefix = 'Duplicate ';
const existingRecordIssuePrefix = 'Existing ';
const confidenceIssuePrefix = 'Below ';
const targetIssuePrefix = 'Target ';

const supportedImportSources: { id: Exclude<DataSourceId, 'microsoft365'>; label: string }[] = [
  { id: 'csv', label: 'CSV' },
  { id: 'excel', label: 'Excel' },
  { id: 'pdf', label: 'PDF' },
  { id: 'word', label: 'Word' },
];

export default function ImportView({
  commitImports,
  existingEmployees = [],
  existingTasks = [],
  confidenceThreshold,
  setConfidenceThreshold,
  requireReview,
  showAuditTrail,
  enabledDataSources,
  queuedUpload,
  onQueuedUploadHandled,
}: ImportViewProps) {
  const [step, setStep] = useState(1);
  const [reviewRecords, setReviewRecords] = useState<ImportReviewRecord[]>([]);
  const [expandedRecordId, setExpandedRecordId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [importTarget, setImportTarget] = useState<ImportTarget>('auto');
  const [profileUpdateMode, setProfileUpdateMode] = useState(false);
  const [skillNormalization, setSkillNormalization] = useState<AgentOutputEnvelope<SkillNormalizationOutput> | null>(null);
  const [skillNormalizationLoading, setSkillNormalizationLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const handledQueuedUploadId = useRef<string | null>(null);

  const confirmedRecords = reviewRecords.filter((record) => record.reviewStatus === 'Confirmed');
  const needsReviewCount = reviewRecords.length - confirmedRecords.length;
  const csvEnabled = enabledDataSources.csv;

  const applyBatchReview = useCallback(
    (records: ImportReviewRecord[]) => {
      const idCounts = new Map<string, number>();
      const nameCounts = new Map<string, number>();
      const existingEmployeeIds = new Set(existingEmployees.map((employee) => normalizeReviewKey(employee.id)));
      const existingTaskIds = new Set(existingTasks.map((task) => normalizeReviewKey(task.id)));

      records.forEach((record) => {
        const entity = record.entity;
        bumpCount(idCounts, duplicateKey(record.type, entity.id));
        const normalizedName = normalizeReviewKey(entity.name);
        if (normalizedName && !normalizedName.startsWith('unnamed ')) bumpCount(nameCounts, duplicateKey(record.type, normalizedName));
      });

      return records.map((record) => {
        const entity = record.entity;
        const issues = record.issues.filter(
          (issue) =>
            !issue.startsWith(duplicateIssuePrefix) &&
            !issue.startsWith(confidenceIssuePrefix) &&
            !issue.startsWith(existingRecordIssuePrefix)
        );
        const idKey = duplicateKey(record.type, entity.id);
        const nameKey = duplicateKey(record.type, normalizeReviewKey(entity.name));

        if ((idCounts.get(idKey) ?? 0) > 1) issues.push(`Duplicate ${record.type} ID "${entity.id}" in uploaded batch`);
        if ((nameCounts.get(nameKey) ?? 0) > 1) issues.push(`Duplicate ${record.type} name "${entity.name}" in uploaded batch`);
        if (record.type === 'employee') {
          const updatesExistingEmployee = existingEmployeeIds.has(normalizeReviewKey(entity.id));
          if (updatesExistingEmployee) {
            issues.push(`Existing employee ID "${entity.id}" will be updated on commit`);
          }
          if (record.profileUpdate && !updatesExistingEmployee) {
            issues.push('No existing employee match found. Choose an existing employee ID before confirming.');
          }
        }
        if (record.type === 'task' && existingTaskIds.has(normalizeReviewKey(entity.id))) {
          issues.push(`Existing task ID "${entity.id}" will be updated on commit`);
        }

        const belowConfidenceThreshold = record.confidence < confidenceThreshold;
        if (belowConfidenceThreshold) issues.push(`Below ${confidenceThreshold}% confidence threshold`);

        const hasBlockingReviewIssue = issues.some(isBlockingReviewIssue);
        const reviewStatus: ImportReviewRecord['reviewStatus'] = hasBlockingReviewIssue
          ? 'Needs Correction'
          : belowConfidenceThreshold
            ? 'Needs Review'
            : requireReview
              ? record.reviewStatus === 'Confirmed'
                ? 'Confirmed'
                : 'Needs Review'
              : 'Confirmed';

        return { ...record, issues, reviewStatus };
      });
    },
    [confidenceThreshold, existingEmployees, existingTasks, requireReview]
  );

  useEffect(() => {
    queueMicrotask(() => setReviewRecords((current) => (current.length ? applyBatchReview(current) : current)));
  }, [applyBatchReview]);

  const normalizeImportedSkills = useCallback(async (records: ImportReviewRecord[]) => {
    const rawSkills: SkillNormalizationInput['rawSkills'] = records.flatMap((record) => getRawSkillInputs(record));
    if (!rawSkills.length) return;

    setSkillNormalizationLoading(true);
    requestAgentOutput<SkillNormalizationOutput>('skill_normalization', { rawSkills })
      .then(setSkillNormalization)
      .catch(() => undefined)
      .finally(() => setSkillNormalizationLoading(false));
  }, []);

  const handleFiles = useCallback(async (
    files: FileList | File[],
    options: { target?: ImportTarget; profileUpdateMode?: boolean; context?: QueuedUploadContext; documents?: WorkMatchDocument[] } = {}
  ) => {
    const activeImportTarget = options.target ?? importTarget;
    const activeProfileUpdateMode = options.profileUpdateMode ?? profileUpdateMode;

    setError('');
    setSkillNormalization(null);

    if (!activeProfileUpdateMode && activeImportTarget === 'roster') {
      setError('Project roster files are not accepted by this upload workflow. Choose Auto-Detect, Employees, or Tasks.');
      return;
    }

    const fileList = Array.from(files).filter((file) => isEnabledUploadSource(file, enabledDataSources));

    if (!fileList.length) {
      setError('No enabled import source matched the selected file type. Enable the source in Settings, or upload CSV, XLSX, PDF, or DOCX.');
      return;
    }

    setStep(2);
    if (activeProfileUpdateMode) {
      const parsedResumeUpdates = await Promise.all(
        fileList.map(async (file) => {
          try {
            const extracted = await extractResumeText(file);
            if (!extracted.text.trim()) {
              return {
                records: [] as ImportReviewRecord[],
                warnings: [`${file.name}: no selectable resume text was found. Use a text PDF or DOCX.`],
              };
            }

            const baseRecord = buildManagerResumeImportRecord({
              fileName: file.name,
              text: extracted.text,
              existingEmployees,
              tasks: existingTasks,
            });
            const envelope = await requestAgentOutput<DocumentExtractionAssistanceOutput>('document_extraction_assistance', {
              uploadId: `manager-resume-${file.name}-${Date.now()}`,
              fileName: file.name,
              mimeType: file.type || 'application/octet-stream',
              importMode: 'employees',
              extractionGoal:
                'Extract profile updates from this resume. Match and update an existing employee profile only; do not create a new employee profile.',
              parserOutput: {
                parseId: `manager-resume-${file.name}`,
                detectedType: 'employee_data',
                extractedText: extracted.text.slice(0, 18000),
                tables: [],
                parserWarnings: extracted.warnings.map((warning, index) => ({
                  code: `RESUME_PARSE_WARNING_${index + 1}`,
                  severity: 'warning' as const,
                  message: warning,
                })),
              },
            }).catch(() => undefined);

            return {
              records: [envelope ? mergeResumeImportRecordWithDocumentExtraction(baseRecord, envelope.output) : baseRecord],
              warnings: extracted.warnings.map((warning) => `${file.name}: ${warning}`),
            };
          } catch (error) {
            return {
              records: [] as ImportReviewRecord[],
              warnings: [`${file.name}: ${error instanceof Error ? error.message : 'resume extraction failed'}.`],
            };
          }
        })
      );
      const nextRecords = applyBatchReview(parsedResumeUpdates.flatMap((result) => result.records));
      const warnings = parsedResumeUpdates.flatMap((result) => result.warnings);

      setError(
        [
          'Resume/Profile Updates mode updates matched employee profiles only. Unmatched resumes must be corrected before commit.',
          ...warnings,
        ].join(' ')
      );
      setReviewRecords(nextRecords);
      setExpandedRecordId(nextRecords[0]?.id ?? null);
      setStep(3);
      void normalizeImportedSkills(nextRecords);
      return;
    }

    const uploadDocuments = options.documents ?? await buildUploadDocuments(fileList, options.context);
    const parsed = await Promise.all(fileList.map((file) => parseLocalImportSource(file, { target: activeImportTarget })));
    const warnings = parsed.flatMap((result) => [
      ...result.warnings,
      ...result.dependencyNotes.map((note) => `${note.format.toUpperCase()}: ${note.reason}. ${note.fallback}.`),
    ]);
    parsed
      .filter((result) => result.status !== 'parsed' || result.warnings.length || result.dependencyNotes.length)
      .forEach((result) => {
        void recordMonitoringEvent({
          eventType: 'parser_failure',
          severity: result.status === 'unsupported' ? 'warning' : 'info',
          source: result.format,
          message: `${result.sourceFile} imported with parser warnings or fallback behavior.`,
          metadata: {
            sourceFile: result.sourceFile,
            format: result.format,
            status: result.status,
            warnings: result.warnings,
            dependencyNotes: result.dependencyNotes,
          },
        });
      });
    const nextRecords = applyBatchReview(
      applyUploadContext(attachSourceDocuments(parsed.flatMap((result) => result.records), uploadDocuments), options.context)
    );

    setError(warnings.join(' '));
    setReviewRecords(nextRecords);
    setExpandedRecordId(null);
    setStep(3);
    void normalizeImportedSkills(nextRecords);
  }, [applyBatchReview, enabledDataSources, existingEmployees, existingTasks, importTarget, normalizeImportedSkills, profileUpdateMode]);

  useEffect(() => {
    if (!queuedUpload || handledQueuedUploadId.current === queuedUpload.id) return;

    handledQueuedUploadId.current = queuedUpload.id;
    setProfileUpdateMode(false);
    setImportTarget(queuedUpload.target);
    void handleFiles(queuedUpload.files, {
      target: queuedUpload.target,
      profileUpdateMode: false,
      context: queuedUpload.context,
      documents: queuedUpload.documents,
    }).finally(() => onQueuedUploadHandled?.(queuedUpload.id));
  }, [handleFiles, onQueuedUploadHandled, queuedUpload]);

  const commitRecords = () => {
    commitImports(confirmedRecords);

    const remaining = reviewRecords.filter((record) => record.reviewStatus !== 'Confirmed');
    setReviewRecords(remaining);
    if (!remaining.length) {
      setExpandedRecordId(null);
      setStep(1);
    }
  };

  const removeRecord = (id: string) => {
    setReviewRecords((current) => applyBatchReview(current.filter((record) => record.id !== id)));
    if (expandedRecordId === id) setExpandedRecordId(null);
  };

  const confirmRecord = (id: string) => {
    setReviewRecords((current) =>
      applyBatchReview(
        current.map((record) =>
          record.id === id && !hasBlockingIssue(record) ? { ...record, reviewStatus: 'Confirmed' } : record
        )
      )
    );
  };

  const updateEmployeeRecord = (id: string, updates: Partial<Employee>) => {
    setReviewRecords((current) =>
      applyBatchReview(
        current.map((record) => {
          if (record.id !== id || record.type !== 'employee') return record;
          const entity = { ...(record.entity as Employee), ...updates };
          return {
            ...record,
            entity,
            profileUpdate: record.profileUpdate
              ? {
                  ...record.profileUpdate,
                  targetEmployeeId: entity.id,
                  targetEmployeeName: entity.name,
                }
              : undefined,
            issues: getImportIssues(entity, 'employee'),
            reviewStatus: 'Needs Review',
          };
        })
      )
    );
  };

  const updateTaskRecord = (id: string, updates: Partial<Task>) => {
    setReviewRecords((current) =>
      applyBatchReview(
        current.map((record) => {
          if (record.id !== id || record.type !== 'task') return record;
          const entity = { ...(record.entity as Task), ...updates };
          return {
            ...record,
            entity,
            issues: getImportIssues(entity, 'task'),
            reviewStatus: 'Needs Review',
          };
        })
      )
    );
  };

  const retargetRecord = (id: string, targetValue: string) => {
    const normalizedTarget = normalizeReviewKey(targetValue);
    if (!normalizedTarget) return;

    setReviewRecords((current) =>
      applyBatchReview(
        current.map((record) => {
          if (record.id !== id) return record;

          const issues = record.issues.filter(
            (issue) =>
              !issue.startsWith(targetIssuePrefix) &&
              !issue.startsWith('Missing Task ID') &&
              !issue.startsWith('Missing Employee ID')
          );

          if (record.type === 'employee') {
            const targetEmployee = existingEmployees.find(
              (employee) => normalizeReviewKey(employee.id) === normalizedTarget || normalizeReviewKey(employee.name) === normalizedTarget
            );
            const entity = record.entity as Employee;

            return {
              ...record,
              entity: {
                ...entity,
                id: targetEmployee?.id ?? targetValue.trim(),
              },
              profileUpdate: record.profileUpdate && targetEmployee
                ? {
                    ...record.profileUpdate,
                    targetEmployeeId: targetEmployee.id,
                    targetEmployeeName: targetEmployee.name,
                    matchReason: `Manager routed this upload to ${targetEmployee.name}.`,
                  }
                : record.profileUpdate,
              issues,
              reviewStatus: 'Needs Review',
            };
          }

          const targetTask = existingTasks.find(
            (task) => normalizeReviewKey(task.id) === normalizedTarget || normalizeReviewKey(task.name) === normalizedTarget
          );
          const entity = record.entity as Task;

          return {
            ...record,
            entity: {
              ...entity,
              id: targetTask?.id ?? targetValue.trim(),
            },
            issues,
            reviewStatus: 'Needs Review',
          };
        })
      )
    );
  };

  const resetImport = () => {
    setReviewRecords([]);
    setExpandedRecordId(null);
    setStep(1);
  };

  return (
    <div className="max-w-5xl mx-auto py-6 w-full">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Data Imports & Review</h1>
        <p className="text-gray-500 text-sm mt-1">Upload workforce or task CSVs, review extracted records, then commit them to WorkMatch.</p>
      </div>

      {step === 1 && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div className="bg-white border border-gray-200 rounded shadow-sm p-6 space-y-6 md:col-span-1 h-fit">
            <h3 className="font-bold text-gray-900 border-b border-gray-100 pb-3">Import Settings</h3>

            <div className="space-y-4">
              <div>
                <label htmlFor="import-target" className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">Import Target</label>
                <select
                  id="import-target"
                  value={importTarget}
                  disabled={profileUpdateMode}
                  onChange={(event) => setImportTarget(event.target.value as ImportTarget)}
                  className="w-full text-sm border border-gray-200 rounded p-2 focus:ring-1 focus:ring-red-500 focus:border-red-500 outline-none disabled:bg-gray-100 disabled:text-gray-500"
                >
                  <option value="auto">Auto-Detect Schema</option>
                  <option value="employee">Employee Records</option>
                  <option value="task">Task/Project Definitions</option>
                </select>
              </div>

              <label className={`block rounded border p-3 text-xs cursor-pointer ${profileUpdateMode ? 'border-blue-200 bg-blue-50 text-blue-800' : 'border-gray-200 bg-white text-gray-600'}`}>
                <span className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    checked={profileUpdateMode}
                    onChange={(event) => {
                      setProfileUpdateMode(event.target.checked);
                      if (event.target.checked) setImportTarget('employee');
                    }}
                    className="mt-0.5 h-4 w-4 accent-red-600"
                  />
                  <span>
                    <span className="block font-bold text-gray-900">Resume/Profile Updates</span>
                    <span className="mt-1 block leading-relaxed">
                      Match resumes to existing employees and review exactly what fields, skills, certifications, and projects would change.
                    </span>
                  </span>
                </span>
              </label>

              <div>
                <label htmlFor="review-confidence-threshold" className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">Review Confidence Threshold</label>
                <div className="flex items-center gap-3">
                  <input
                    id="review-confidence-threshold"
                    type="range"
                    min="50"
                    max="99"
                    value={confidenceThreshold}
                    onChange={(event) => setConfidenceThreshold(Number(event.target.value))}
                    className="w-full accent-red-600"
                  />
                  <span className="text-xs font-bold text-gray-700 bg-gray-100 px-2 py-1 rounded">{confidenceThreshold}%</span>
                </div>
              </div>

              <div className="pt-2 border-t border-gray-100">
                <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-2">Supported Formats</label>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {supportedImportSources.map((source) => (
                    <span
                      key={source.id}
                      className="px-2 py-1 rounded border bg-green-50 text-green-700 border-green-200"
                    >
                      {source.label}
                    </span>
                  ))}
                </div>
              </div>

              {error && (
                <div role="alert" className="bg-red-50 border border-red-100 text-red-700 rounded p-3 text-xs leading-relaxed">
                  {error}
                </div>
              )}
            </div>
          </div>

          <div
            className="border border-dashed border-gray-300 rounded bg-white p-16 text-center hover:bg-gray-50 hover:border-red-200 transition-all cursor-pointer shadow-sm group md:col-span-2 flex flex-col justify-center items-center h-full min-h-[400px]"
            onClick={() => inputRef.current?.click()}
            onKeyDown={(event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault();
                inputRef.current?.click();
              }
            }}
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void handleFiles(event.dataTransfer.files);
            }}
            role="button"
            tabIndex={0}
            aria-label="Upload workforce files"
          >
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xls,.xlsx,.pdf,.doc,.docx"
              multiple
              className="hidden"
              onChange={(event) => {
                if (event.target.files) void handleFiles(event.target.files);
              }}
            />
            <div className="w-20 h-20 bg-gray-100 group-hover:bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6 transition-colors">
              <UploadCloud className="w-10 h-10 text-gray-400 group-hover:text-red-600 transition-colors" />
            </div>
            <h2 className="text-xl font-bold text-gray-900">Drag & Drop Workforce Files</h2>
            <p className="text-gray-500 mt-2 max-w-md mx-auto text-sm leading-relaxed">
              {profileUpdateMode
                ? 'PDF and DOCX resumes are extracted into existing-profile update proposals before anything is committed.'
                : 'CSV, XLSX, DOCX, and text PDFs are parsed locally into manager review records before anything is committed.'}
            </p>
            <div className="mt-8 flex justify-center gap-4">
              <button type="button" className="bg-red-600 text-white px-6 py-2.5 rounded text-sm font-bold shadow-sm hover:bg-red-700 transition-colors relative z-10" onClick={(event) => { event.stopPropagation(); inputRef.current?.click(); }}>
                Browse Files
              </button>
            </div>

            <div className="mt-10 flex flex-wrap justify-center items-center gap-4 text-sm text-gray-400 font-medium">
              <span className="flex items-center gap-1.5 text-green-700"><FileSpreadsheet className="w-4 h-4" /> CSV / XLSX</span>
              <span className="flex items-center gap-1.5 text-green-700"><FileText className="w-4 h-4" /> PDF / DOCX</span>
            </div>
          </div>
        </div>
      )}

      {step === 2 && (
        <div role="status" aria-live="polite" className="border border-gray-200 rounded bg-white p-16 text-center shadow-sm">
          <div className="relative w-24 h-24 mx-auto mb-6 flex items-center justify-center">
            <div className="absolute inset-0 border-4 border-gray-100 rounded-full"></div>
            <div className="absolute inset-0 border-4 border-red-600 rounded-full border-t-transparent animate-spin"></div>
            <Sparkles className="w-8 h-8 text-red-600 animate-pulse" />
          </div>
          <h2 className="text-xl font-bold text-gray-900">Extracting File Structure...</h2>
          <p className="text-gray-500 mt-2 text-sm">Detecting schema, mapping skills, and preparing manager review rows.</p>

          <div className="max-w-sm mx-auto mt-8 bg-gray-50 border border-gray-100 rounded p-3 text-left space-y-2">
            <div className="flex items-center gap-2 text-xs font-medium text-gray-600">
              <CheckCircle className="w-3 h-3 text-green-500" /> Read uploaded files
            </div>
            <div className="flex items-center gap-2 text-xs font-medium text-gray-900 animate-pulse">
              <Loader2 className="w-3 h-3 animate-spin text-red-600" /> Building review screen
            </div>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
          <div role="status" aria-live="polite" className="bg-green-50 border border-green-200 p-4 rounded flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 text-green-800">
            <div className="flex items-center gap-3">
              <CheckCircle className="w-6 h-6 flex-shrink-0" />
              <div>
                <h3 className="font-bold">Extraction Complete</h3>
                <p className="text-sm opacity-90">
                  {confirmedRecords.length} confirmed. {needsReviewCount} still need manager review before import.
                </p>
                <p className="text-xs opacity-80 mt-1">
                  Skill normalization: {skillNormalizationLoading ? 'working' : skillNormalization ? 'checked' : 'ready'}
                  {skillNormalization ? ` - ${skillNormalization.output.normalizedSkills.length} skills checked` : ''}
                </p>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" className="px-4 py-2 bg-white text-green-700 font-bold text-sm rounded border border-green-200 shadow-sm hover:bg-green-100 transition-colors" onClick={resetImport}>
                Discard All
              </button>
              <button type="button" disabled={!confirmedRecords.length} className="px-4 py-2 bg-green-600 disabled:bg-gray-300 text-white font-bold text-sm rounded shadow-sm hover:bg-green-700 transition-colors" onClick={commitRecords}>
                Commit {confirmedRecords.length} Confirmed
              </button>
            </div>
          </div>

          <div className="bg-white border border-gray-200 shadow-sm rounded overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium">
                  <tr>
                    <th className="px-6 py-4">Extracted Identity</th>
                    <th className="px-6 py-4">Data Type</th>
                    <th className="px-6 py-4">Target</th>
                    <th className="px-6 py-4">Inferred Skills</th>
                    <th className="px-6 py-4">Confidence</th>
                    <th className="px-6 py-4">Status</th>
                    <th className="px-6 py-4">Review</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {reviewRecords.map((record) => {
                    const entity = record.entity;
                    const skills = getReviewSkillSummary(entity);
                    const isExpanded = expandedRecordId === record.id;

                    return (
                      <Fragment key={record.id}>
                        <tr className={`hover:bg-gray-50 transition-colors ${record.issues.length ? 'bg-yellow-50/30' : ''}`}>
                          <td className="px-6 py-4">
                            <div className="font-bold text-gray-900">{entity.name}</div>
                            <div className="text-xs text-gray-500">{entity.id} - {record.sourceFile}</div>
                            {record.sourceDocument && (
                              <div className="mt-1 text-[11px] text-gray-500">
                                Vault file: {formatFileSize(record.sourceDocument.sizeBytes)}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4 text-gray-500 font-medium">
                            <span className={`${record.type === 'employee' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'} px-2 py-0.5 rounded text-[10px] uppercase tracking-wider`}>
                              {record.type}
                            </span>
                          </td>
                          <td className="px-6 py-4 min-w-[240px]">
                            <TargetPicker
                              record={record}
                              existingEmployees={existingEmployees}
                              existingTasks={existingTasks}
                              onRetarget={retargetRecord}
                            />
                          </td>
                          <td className="px-6 py-4 max-w-[320px]">
                            <div className="truncate" title={skills.join(', ')}>{skills.join(', ') || 'No skills detected'}</div>
                            {record.issues.length > 0 && (
                              <div className="mt-1 space-y-0.5 text-xs text-yellow-800">
                                {record.issues.map((issue) => (
                                  <div key={issue} className="flex items-center gap-1">
                                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" /> {issue}
                                  </div>
                                ))}
                              </div>
                            )}
                          </td>
                          <td className="px-6 py-4">
                            <span className={`flex items-center gap-1.5 font-bold w-max px-2 py-1 rounded ${record.confidence >= confidenceThreshold ? 'text-green-600 bg-green-50' : 'text-yellow-700 bg-yellow-50 border border-yellow-100'}`}>
                              {record.confidence >= confidenceThreshold ? <Sparkles className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />} {record.confidence}%
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <span className={`px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider ${statusClass(record.reviewStatus)}`}>
                              {record.reviewStatus}
                            </span>
                          </td>
                          <td className="px-6 py-4">
                            <div className="flex flex-wrap gap-2">
                              <button
                                onClick={() => confirmRecord(record.id)}
                                disabled={hasBlockingIssue(record)}
                                title={hasBlockingIssue(record) ? 'Resolve duplicate, missing, or invalid fields before confirming.' : 'Confirm this record for commit.'}
                                className="text-green-700 disabled:text-gray-400 hover:underline font-bold text-[10px] uppercase tracking-wider flex items-center gap-1"
                              >
                                <CheckCircle className="w-3 h-3" /> Confirm
                              </button>
                              <button onClick={() => setExpandedRecordId(isExpanded ? null : record.id)} className="text-gray-700 hover:underline font-bold text-[10px] uppercase tracking-wider flex items-center gap-1">
                                <Pencil className="w-3 h-3" /> Correct
                              </button>
                              <button onClick={() => removeRecord(record.id)} className="text-red-600 hover:underline font-bold text-[10px] uppercase tracking-wider flex items-center gap-1">
                                <X className="w-3 h-3" /> Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-gray-50">
                            <td colSpan={7} className="px-6 py-5">
                              {record.type === 'employee' ? (
                                <div className="space-y-4">
                                  {record.profileUpdate && <ProfileUpdateSummary profileUpdate={record.profileUpdate} />}
                                  <EmployeeEditor record={record} updateEmployeeRecord={updateEmployeeRecord} />
                                </div>
                              ) : (
                                <TaskEditor record={record} updateTaskRecord={updateTaskRecord} />
                              )}
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                  {reviewRecords.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">No records remain in the review queue.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function EmployeeEditor({
  record,
  updateEmployeeRecord,
}: {
  record: ImportReviewRecord;
  updateEmployeeRecord: (id: string, updates: Partial<Employee>) => void;
}) {
  const employee = record.entity as Employee;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <ReviewInput label="Employee ID" value={employee.id} onChange={(value) => updateEmployeeRecord(record.id, { id: value })} />
      <ReviewInput label="Name" value={employee.name} onChange={(value) => updateEmployeeRecord(record.id, { name: value })} />
      <ReviewInput label="Role" value={employee.role} onChange={(value) => updateEmployeeRecord(record.id, { role: value })} />
      <ReviewInput label="Department" value={employee.department} onChange={(value) => updateEmployeeRecord(record.id, { department: value })} />
      <ReviewInput label="Location" value={employee.location} onChange={(value) => updateEmployeeRecord(record.id, { location: value })} />
      <ReviewInput label="Availability %" value={String(employee.availability)} type="number" onChange={(value) => updateEmployeeRecord(record.id, { availability: clampNumber(value, 0, 100) })} />
      <ReviewInput label="Years Exp" value={String(employee.yearsExp)} type="number" onChange={(value) => updateEmployeeRecord(record.id, { yearsExp: Math.max(0, Number(value) || 0) })} />
      <div className="md:col-span-4">
        <ReviewTextarea
          label="Skills"
          defaultValue={formatEmployeeSkills(employee)}
          onBlur={(value) => updateEmployeeRecord(record.id, { skills: parseSkills(value) })}
        />
      </div>
    </div>
  );
}

function ProfileUpdateSummary({ profileUpdate }: { profileUpdate: ResumeProfileUpdateReview }) {
  return (
    <div className="rounded border border-blue-200 bg-blue-50 p-4">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div>
          <div className="flex items-center gap-2 text-sm font-bold text-blue-950">
            <ShieldCheck className="w-4 h-4" /> Existing Profile Update
          </div>
          <p className="mt-1 text-xs leading-relaxed text-blue-800">
            Target: {profileUpdate.targetEmployeeName} ({profileUpdate.targetEmployeeId}). {profileUpdate.matchReason}
          </p>
        </div>
        <span className="w-max rounded bg-white px-2 py-1 text-[10px] font-bold uppercase text-blue-700">
          {profileUpdate.matchConfidence}% match
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
        {profileUpdate.changes.slice(0, 8).map((change) => (
          <div key={change.id} className="rounded border border-blue-100 bg-white p-3 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-bold text-gray-900">{change.label}</span>
              <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-600">{change.confidence}%</span>
              {change.autoConfirmed && <span className="rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-green-700">Auto-confirmed</span>}
            </div>
            <div className="mt-2 text-gray-500">
              <span className="line-through">{change.currentValue}</span>
              <span className="mx-2 text-gray-400">to</span>
              <span className="font-bold text-green-700">{change.proposedValue}</span>
            </div>
            <p className="mt-2 leading-relaxed text-gray-500">{change.reason}</p>
          </div>
        ))}
      </div>

      {profileUpdate.upskillingRecommendations.length > 0 && (
        <div className="mt-4 rounded border border-amber-200 bg-amber-50 p-3">
          <div className="text-[10px] font-bold uppercase text-amber-800">Upskilling recommendations</div>
          <div className="mt-2 space-y-1 text-xs text-amber-900">
            {profileUpdate.upskillingRecommendations.slice(0, 3).map((recommendation) => (
              <div key={recommendation.skillName}>
                <strong>{recommendation.skillName}:</strong> {recommendation.reason}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TargetPicker({
  record,
  existingEmployees,
  existingTasks,
  onRetarget,
}: {
  record: ImportReviewRecord;
  existingEmployees: Employee[];
  existingTasks: Task[];
  onRetarget: (id: string, targetValue: string) => void;
}) {
  const targetInputId = useId();
  const targetListId = useId();
  const entity = record.entity;
  const targets = record.type === 'employee' ? existingEmployees : existingTasks;
  const matchedTarget = targets.find((target) => normalizeReviewKey(target.id) === normalizeReviewKey(entity.id));
  const targetTypeLabel = record.type === 'employee' ? 'employee' : 'project';

  return (
    <div className="space-y-1.5">
      <label htmlFor={targetInputId} className="sr-only">Target {targetTypeLabel}</label>
      <input
        key={entity.id}
        id={targetInputId}
        list={targetListId}
        defaultValue={entity.id}
        onBlur={(event) => onRetarget(record.id, event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            onRetarget(record.id, event.currentTarget.value);
            event.currentTarget.blur();
          }
        }}
        className="w-full rounded border border-gray-200 bg-white px-2 py-1.5 text-xs font-bold text-gray-900 outline-none focus:border-red-500 focus:ring-1 focus:ring-red-500"
        aria-label={`Target ${targetTypeLabel}`}
      />
      <datalist id={targetListId}>
        {targets.map((target) => (
          <option key={target.id} value={target.id} label={target.name} />
        ))}
      </datalist>
      <div className="text-[11px] leading-snug text-gray-500">
        {matchedTarget ? (
          <>
            Updates <span className="font-bold text-gray-800">{matchedTarget.name}</span>
          </>
        ) : (
          <>Creates or updates ID after review</>
        )}
      </div>
    </div>
  );
}

function TaskEditor({
  record,
  updateTaskRecord,
}: {
  record: ImportReviewRecord;
  updateTaskRecord: (id: string, updates: Partial<Task>) => void;
}) {
  const task = record.entity as Task;

  return (
    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
      <ReviewInput label="Task ID" value={task.id} onChange={(value) => updateTaskRecord(record.id, { id: value })} />
      <ReviewInput label="Name" value={task.name} onChange={(value) => updateTaskRecord(record.id, { name: value })} />
      <ReviewInput label="Deadline" value={task.deadline} type="date" onChange={(value) => updateTaskRecord(record.id, { deadline: value })} />
      <ReviewInput label="Hours" value={String(task.estHours)} type="number" onChange={(value) => updateTaskRecord(record.id, { estHours: Math.max(0, Number(value) || 0) })} />
      <ReviewInput label="Team Size" value={String(task.teamSize)} type="number" onChange={(value) => updateTaskRecord(record.id, { teamSize: Math.max(1, Number(value) || 1) })} />
      <ReviewInput label="Location" value={task.location} onChange={(value) => updateTaskRecord(record.id, { location: value })} />
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Urgency</label>
        <select
          value={task.urgency}
          onChange={(event) => updateTaskRecord(record.id, { urgency: event.target.value as Task['urgency'] })}
          className="w-full text-sm border border-gray-200 rounded p-2 bg-white outline-none focus:ring-1 focus:ring-red-500"
        >
          <option>Low</option>
          <option>Medium</option>
          <option>High</option>
        </select>
      </div>
      <div>
        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">Staffing Mode</label>
        <select
          value={task.staffingMode || 'One Employee'}
          onChange={(event) => updateTaskRecord(record.id, { staffingMode: event.target.value })}
          className="w-full text-sm border border-gray-200 rounded p-2 bg-white outline-none focus:ring-1 focus:ring-red-500"
        >
          <option>One Employee</option>
          <option>Team</option>
        </select>
      </div>
      <div className="md:col-span-2">
        <ReviewTextarea
          label="Required Skills"
          defaultValue={formatSkillRequirements(task.requiredSkillSpecs, task.requiredSkills)}
          onBlur={(value) => {
            const specs = parseSkillRequirements(value);
            updateTaskRecord(record.id, { requiredSkillSpecs: specs, requiredSkills: specs.map((skill) => skill.name) });
          }}
        />
      </div>
      <div className="md:col-span-2">
        <ReviewTextarea
          label="Optional Skills"
          defaultValue={formatSkillRequirements(task.optionalSkillSpecs, task.optionalSkills)}
          onBlur={(value) => {
            const specs = parseSkillRequirements(value);
            updateTaskRecord(record.id, { optionalSkillSpecs: specs, optionalSkills: specs.map((skill) => skill.name) });
          }}
        />
      </div>
    </div>
  );
}

function ReviewInput({
  label,
  value,
  type = 'text',
  onChange,
}: {
  label: string;
  value: string;
  type?: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();

  return (
    <div>
      <label htmlFor={inputId} className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">{label}</label>
      <input
        id={inputId}
        value={value}
        type={type}
        onChange={(event) => onChange(event.target.value)}
        className="w-full text-sm border border-gray-200 rounded p-2 outline-none focus:ring-1 focus:ring-red-500"
      />
    </div>
  );
}

function ReviewTextarea({
  label,
  defaultValue,
  onBlur,
}: {
  label: string;
  defaultValue: string;
  onBlur: (value: string) => void;
}) {
  const textareaId = useId();

  return (
    <div>
      <label htmlFor={textareaId} className="text-[10px] font-bold text-gray-500 uppercase tracking-wider block mb-1">{label}</label>
      <textarea
        id={textareaId}
        defaultValue={defaultValue}
        onBlur={(event) => onBlur(event.target.value)}
        rows={2}
        className="w-full text-sm border border-gray-200 rounded p-2 outline-none focus:ring-1 focus:ring-red-500"
      />
    </div>
  );
}

function hasBlockingIssue(record: ImportReviewRecord) {
  return record.issues.some(isBlockingReviewIssue);
}

function isBlockingReviewIssue(issue: string) {
  return (
    issue.startsWith(duplicateIssuePrefix) ||
    issue.startsWith('Missing ') ||
    issue.startsWith('No ') ||
    issue.includes(' must ')
  );
}

function statusClass(status: ImportReviewRecord['reviewStatus']) {
  if (status === 'Confirmed') return 'bg-green-100 text-green-800';
  if (status === 'Needs Correction') return 'bg-yellow-100 text-yellow-800';
  return 'bg-gray-100 text-gray-700';
}

function bumpCount(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function duplicateKey(type: ImportReviewRecord['type'], value: string) {
  return `${type}:${normalizeReviewKey(value)}`;
}

function normalizeReviewKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

async function buildUploadDocuments(files: File[], context?: QueuedUploadContext): Promise<WorkMatchDocument[]> {
  const linkedAt = new Date().toISOString();

  const documents = await Promise.all(
    files.map(async (file, index) => ({
      id: `upload-${linkedAt}-${index}-${slugify(file.name)}`,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      linkedAt,
      targetType: context?.taskId ? 'task' : undefined,
      targetId: context?.taskId,
      targetName: context?.taskName,
      dataUrl: await readFileAsDataUrl(file),
      storagePath: `browser-vault/${linkedAt}/${slugify(file.name)}`,
      note: context?.taskName ? `Uploaded from ${context.taskName}` : 'Uploaded through Import Review',
    })).map((promise) => promise.catch(() => undefined))
  );

  return documents.filter(Boolean) as WorkMatchDocument[];
}

function attachSourceDocuments(records: ImportReviewRecord[], documents: WorkMatchDocument[]) {
  if (!documents.length) return records;

  return records.map((record) => {
    const sourceName = sourceFileBaseName(record.sourceFile);
    const document = documents.find((item) => item.fileName === sourceName);
    return document ? { ...record, sourceDocument: document } : record;
  });
}

function sourceFileBaseName(sourceFile: string) {
  return sourceFile.split(':')[0];
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function applyUploadContext(records: ImportReviewRecord[], context?: QueuedUploadContext) {
  const taskId = context?.taskId;
  if (!taskId) return records;

  const taskName = context.taskName;

  return records.map((record) => {
    if (record.type !== 'task') return record;

    const task = record.entity as Task;
    const issues = record.issues.filter((issue) => !issue.startsWith(targetIssuePrefix));
    const contextLabel = taskName ? `${taskName} (${taskId})` : taskId;
    const extractedTaskId = task.id;
    const hasConflictingExtractedId = !isPlaceholderTaskId(extractedTaskId) && normalizeReviewKey(extractedTaskId) !== normalizeReviewKey(taskId);

    if (hasConflictingExtractedId) {
      issues.push(`Target project is ${contextLabel}; extracted document ID was ${extractedTaskId}`);
    }

    const name = isFallbackTaskName(task.name) && taskName ? taskName : task.name;

    return {
      ...record,
      entity: {
        ...task,
        id: taskId,
        name,
      },
      issues,
    };
  });
}

function isPlaceholderTaskId(value: string) {
  const normalized = value.trim();
  return /^TASK-\d+$/i.test(normalized) || /^UNSUPPORTED-/i.test(normalized);
}

function isFallbackTaskName(value: string) {
  return /^Unsupported .* import$/i.test(value.trim());
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file';
}

function formatEmployeeSkills(employee: Employee) {
  return employee.skills.map((skill) => `${skill.name}:${skill.rating}`).join('|');
}

function getReviewSkillSummary(entity: Employee | Task) {
  if (isTask(entity)) {
    const specs: SkillRequirement[] = entity.requiredSkillSpecs?.length
      ? entity.requiredSkillSpecs
      : entity.requiredSkills.map((name) => ({ name }));

    return specs.map((skill) => {
      const rating = skill.minRating ? `>=${skill.minRating}` : '';
      return [skill.name, rating, skill.importance].filter(Boolean).join(' ');
    });
  }

  return entity.skills.map((skill) => `${skill.name} ${skill.rating}/10`);
}

function formatSkillRequirements(specs: Task['requiredSkillSpecs'], fallback: string[]) {
  if (!specs?.length) return fallback.join('|');
  return specs
    .map((skill) => [skill.name, skill.minRating, skill.importance].filter((part) => part !== undefined && part !== '').join(':'))
    .join('|');
}

function clampNumber(value: string, min: number, max: number) {
  return Math.max(min, Math.min(max, Number(value) || 0));
}

function isEnabledUploadSource(file: File, enabledDataSources: EnabledDataSources) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension === 'csv') return enabledDataSources.csv;
  if (extension === 'xls' || extension === 'xlsx' || extension === 'xlsm' || extension === 'xlsb') return enabledDataSources.excel;
  if (extension === 'pdf') return enabledDataSources.pdf;
  if (extension === 'doc' || extension === 'docx') return enabledDataSources.word;
  return false;
}

function getRawSkillInputs(record: ImportReviewRecord): SkillNormalizationInput['rawSkills'] {
  const entity = record.entity;

  if (isTask(entity)) {
    return [...entity.requiredSkills, ...entity.optionalSkills].map((skillName) => ({
      rawSkillId: `${record.id}:${skillName}`,
      rawName: skillName,
      recordType: 'task' as const,
      sourceRefs: [{ sourceType: 'upload' as const, sourceId: record.sourceFile, recordId: record.id }],
    }));
  }

  return entity.skills.map((skill) => ({
    rawSkillId: `${record.id}:${skill.name}`,
    rawName: skill.name,
    recordType: 'employee' as const,
    sourceRefs: [{ sourceType: 'upload' as const, sourceId: record.sourceFile, recordId: record.id }],
  }));
}
