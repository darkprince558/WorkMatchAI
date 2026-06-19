'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  CalendarDays,
  CheckCircle2,
  FileText,
  Lightbulb,
  Loader2,
  MapPin,
  Plus,
  Save,
  ShieldCheck,
  Search,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react';
import type { DocumentExtractionAssistanceOutput } from '@/lib/agents/contracts';
import { requestAgentOutput } from '@/lib/agents/client';
import type { Employee, ResumeProfileChange, Skill, Task } from '@/lib/types';
import { scoreMatch } from '@/lib/workmatch';
import {
  applyResumeProfileChanges,
  buildResumeExtractionResult,
  defaultSelectedResumeChangeIds,
  extractResumeText,
  mergeResumeExtractionResult,
  type ResumeExtractionResult,
} from '@/lib/resume-extraction';

interface EmployeePortalViewProps {
  employee?: Employee;
  profileLoading?: boolean;
  profileOwnerName?: string;
  tasks: Task[];
  onUpdateEmployee: (employee: Employee) => void;
  onOpenTask: (taskId: string) => void;
}

type ProjectFilter = 'recommended' | 'open' | 'saved';
type SaveState = 'idle' | 'saving' | 'saved';

export default function EmployeePortalView({
  employee,
  profileLoading = false,
  profileOwnerName,
  tasks,
  onUpdateEmployee,
  onOpenTask,
}: EmployeePortalViewProps) {
  const [draft, setDraft] = useState<Employee | undefined>(employee);
  const [projectSearch, setProjectSearch] = useState('');
  const [projectFilter, setProjectFilter] = useState<ProjectFilter>('recommended');
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [resumeExtraction, setResumeExtraction] = useState<ResumeExtractionResult | null>(null);
  const [selectedResumeChangeIds, setSelectedResumeChangeIds] = useState<string[]>([]);
  const [resumeExtractionLoading, setResumeExtractionLoading] = useState(false);
  const [resumeExtractionError, setResumeExtractionError] = useState('');

  useEffect(() => {
    let active = true;
    queueMicrotask(() => {
      if (active) setDraft(employee);
    });
    return () => {
      active = false;
    };
  }, [employee]);

  const projectRows = useMemo(() => {
    if (!draft) return [];

    const normalizedSearch = projectSearch.trim().toLowerCase();
    const savedIds = new Set(draft.projectInterests ?? []);

    return tasks
      .filter((task) => task.status !== 'In Progress' && !(task.assignedEmployeeIds ?? []).includes(draft.id))
      .map((task) => {
        const match = scoreMatch(task, draft);
        const employeeSkills = new Set(draft.skills.map((skill) => skill.name.toLowerCase()));
        const matchedSkills = task.requiredSkills.filter((skill) => employeeSkills.has(skill.toLowerCase()));
        return {
          task,
          match,
          matchedSkills,
          isSaved: savedIds.has(task.id),
        };
      })
      .filter((row) => {
        if (projectFilter === 'recommended' && row.match.score < 55) return false;
        if (projectFilter === 'saved' && !row.isSaved) return false;
        if (!normalizedSearch) return true;
        return [row.task.name, row.task.type, row.task.location, row.task.status, ...row.task.requiredSkills]
          .filter((value): value is string => Boolean(value))
          .some((value) => value.toLowerCase().includes(normalizedSearch));
      })
      .sort((first, second) => Number(second.isSaved) - Number(first.isSaved) || second.match.score - first.match.score);
  }, [draft, projectFilter, projectSearch, tasks]);

  if (!draft) {
    return (
      <div className="w-full max-w-5xl mx-auto bg-white border border-gray-200 rounded p-8 text-center">
        <h1 className="text-xl font-bold text-gray-900">
          {profileLoading ? 'Loading your profile' : 'No employee profile linked'}
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          {profileLoading
            ? 'Finding the employee record for this signed-in account.'
            : profileOwnerName
              ? `${profileOwnerName} does not match an employee record yet. Ask an administrator to link this account to an employee profile.`
              : 'Import or add an employee record before opening the employee workspace.'}
        </p>
      </div>
    );
  }

  const updateDraft = (updates: Partial<Employee>) => {
    setDraft((current) => (current ? { ...current, ...updates } : current));
    setSaveState('idle');
  };

  const updateSkill = (index: number, updates: Partial<Skill>) => {
    updateDraft({
      skills: draft.skills.map((skill, currentIndex) => (currentIndex === index ? { ...skill, ...updates } : skill)),
    });
  };

  const removeSkill = (index: number) => {
    updateDraft({
      skills: draft.skills.filter((_, currentIndex) => currentIndex !== index),
    });
  };

  const saveProfile = (nextDraft = draft) => {
    setSaveState('saving');
    const normalized = normalizeEmployee(nextDraft);
    onUpdateEmployee(normalized);
    setDraft(normalized);
    setSaveState('saved');
  };

  const toggleProjectInterest = (taskId: string) => {
    const existing = new Set(draft.projectInterests ?? []);
    if (existing.has(taskId)) {
      existing.delete(taskId);
    } else {
      existing.add(taskId);
    }
    const nextDraft = {
      ...draft,
      projectInterests: Array.from(existing),
    };
    setDraft(nextDraft);
    saveProfile(nextDraft);
  };

  const handleResumeFile = async (file: File) => {
    setResumeExtractionError('');
    setResumeExtractionLoading(true);

    try {
      const extracted = await extractResumeText(file);
      const text = extracted.text.trim();
      if (!text) {
        setResumeExtractionError('No selectable resume text was found. Try a text PDF or DOCX so WorkMatch can extract profile changes.');
        updateDraft({
          resume: {
            fileName: file.name,
            updatedAt: new Date().toISOString(),
            note: draft.resume?.note,
          },
        });
        return;
      }

      const baseExtraction = buildResumeExtractionResult({
        employee: draft,
        fileName: file.name,
        text,
        tasks,
        extractionNotes: [
          ...extracted.warnings,
          `This upload updates ${draft.name}'s existing profile only; it does not create a new employee profile.`,
        ],
      });
      setResumeExtraction(baseExtraction);
      setSelectedResumeChangeIds(defaultSelectedResumeChangeIds(baseExtraction.changes));
      updateDraft({
        resume: {
          fileName: file.name,
          updatedAt: new Date().toISOString(),
          note: draft.resume?.note,
        },
      });

      const envelope = await requestAgentOutput<DocumentExtractionAssistanceOutput>('document_extraction_assistance', {
        uploadId: `${draft.id}-${file.name}-${Date.now()}`,
        fileName: file.name,
        mimeType: file.type || 'application/octet-stream',
        importMode: 'employees',
        extractionGoal: `Extract only profile updates for existing employee ${draft.name} (${draft.id}). Do not create a new profile.`,
        parserOutput: {
          parseId: `${draft.id}-${file.name}`,
          detectedType: 'employee_data',
          extractedText: text.slice(0, 18000),
          tables: [],
          parserWarnings: extracted.warnings.map((warning, index) => ({
            code: `RESUME_PARSE_WARNING_${index + 1}`,
            severity: 'warning' as const,
            message: warning,
          })),
        },
      });
      const merged = mergeResumeExtractionResult(baseExtraction, envelope.output);
      setResumeExtraction(merged);
      setSelectedResumeChangeIds(defaultSelectedResumeChangeIds(merged.changes));
    } catch (error) {
      setResumeExtractionError(error instanceof Error ? error.message : 'Resume extraction failed.');
    } finally {
      setResumeExtractionLoading(false);
    }
  };

  const toggleResumeChange = (changeId: string) => {
    setSelectedResumeChangeIds((current) =>
      current.includes(changeId) ? current.filter((id) => id !== changeId) : [...current, changeId]
    );
  };

  const applySelectedResumeChanges = () => {
    if (!resumeExtraction) return;
    const nextEmployee = applyResumeProfileChanges(draft, resumeExtraction.changes, selectedResumeChangeIds);
    const nextDraft = {
      ...nextEmployee,
      resume: resumeExtraction.proposedEmployee.resume,
    };
    saveProfile(nextDraft);
    setResumeExtraction({
      ...resumeExtraction,
      proposedEmployee: nextDraft,
      extractionNotes: [...resumeExtraction.extractionNotes, 'Selected changes were applied to the employee profile.'],
    });
  };

  const resumeUpdatedLabel = draft.resume?.updatedAt
    ? new Date(draft.resume.updatedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : 'Not posted';

  return (
    <div className="w-full max-w-7xl mx-auto flex flex-col gap-6">
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div className="flex items-center gap-4 min-w-0">
          <img src={draft.avatar} alt="" className="w-16 h-16 rounded border border-gray-200 object-cover bg-white" />
          <div className="min-w-0">
            <h1 className="text-2xl font-bold text-gray-900 truncate">My Profile</h1>
            <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-gray-500">
              <span className="flex items-center gap-1"><Briefcase className="w-4 h-4" /> {draft.role}</span>
              <span className="flex items-center gap-1"><MapPin className="w-4 h-4" /> {draft.location}</span>
              <span className="flex items-center gap-1"><Sparkles className="w-4 h-4" /> {draft.availability}% capacity</span>
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => saveProfile()}
          className="inline-flex items-center justify-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md text-sm font-bold hover:bg-red-700 transition-colors"
        >
          {saveState === 'saved' ? <CheckCircle2 className="w-4 h-4" /> : <Save className="w-4 h-4" />}
          {saveState === 'saving' ? 'Saving' : saveState === 'saved' ? 'Saved' : 'Save Profile'}
        </button>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_420px] gap-6">
        <div className="space-y-6 min-w-0">
          <section className="bg-white border border-gray-200 rounded shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-900 mb-4">Profile Details</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <LabeledInput label="Name" value={draft.name} onChange={(value) => updateDraft({ name: value })} />
              <LabeledInput label="Role" value={draft.role} onChange={(value) => updateDraft({ role: value })} />
              <LabeledInput label="Department" value={draft.department} onChange={(value) => updateDraft({ department: value })} />
              <LabeledInput label="Location" value={draft.location} onChange={(value) => updateDraft({ location: value })} />
              <LabeledInput label="Timezone" value={draft.timezone ?? ''} onChange={(value) => updateDraft({ timezone: value })} />
              <label className="text-xs font-bold text-gray-700">
                Readiness
                <select
                  value={draft.readiness}
                  onChange={(event) => updateDraft({ readiness: event.target.value as Employee['readiness'] })}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-white text-gray-900"
                >
                  <option>Ready</option>
                  <option>In Training</option>
                  <option>Busy</option>
                </select>
              </label>
            </div>

            <div className="mt-5 grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3 items-end">
              <label className="text-xs font-bold text-gray-700">
                Availability
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={draft.availability}
                  onChange={(event) => updateDraft({ availability: Number(event.target.value), availabilityStatus: availabilityStatus(Number(event.target.value)) })}
                  className="mt-3 w-full accent-red-600"
                />
              </label>
              <label className="text-xs font-bold text-gray-700">
                Percent
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={draft.availability}
                  onChange={(event) => {
                    const value = clamp(Number(event.target.value) || 0, 0, 100);
                    updateDraft({ availability: value, availabilityStatus: availabilityStatus(value) });
                  }}
                  className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-900"
                />
              </label>
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-bold text-gray-900">Skills</h2>
              <button
                type="button"
                onClick={() => updateDraft({ skills: [...draft.skills, { name: '', rating: 5 }] })}
                className="inline-flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md text-sm font-bold text-gray-700 hover:bg-gray-50"
              >
                <Plus className="w-4 h-4" /> Add
              </button>
            </div>
            <div className="space-y-3">
              {draft.skills.map((skill, index) => (
                <div key={`${skill.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_86px_36px] gap-2 items-end">
                  <LabeledInput label={index === 0 ? 'Skill' : ' '} value={skill.name} onChange={(value) => updateSkill(index, { name: value })} />
                  <label className="text-xs font-bold text-gray-700">
                    Rating
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={skill.rating}
                      onChange={(event) => updateSkill(index, { rating: clamp(Number(event.target.value) || 1, 1, 10) })}
                      className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-900"
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => removeSkill(index)}
                    aria-label={`Remove ${skill.name || 'skill'}`}
                    className="h-9 inline-flex items-center justify-center border border-gray-200 rounded-md text-gray-500 hover:text-red-700 hover:bg-red-50"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </section>

          <section className="bg-white border border-gray-200 rounded shadow-sm p-5">
            <h2 className="text-base font-bold text-gray-900 mb-4">Experience</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <LabeledTextarea label="Career Goals" value={draft.careerGoals ?? ''} onChange={(value) => updateDraft({ careerGoals: value })} />
              <LabeledTextarea label="Past Projects" value={formatList(draft.pastProjects)} onChange={(value) => updateDraft({ pastProjects: parseList(value) })} />
              <LabeledTextarea label="Interests" value={formatList(draft.interests)} onChange={(value) => updateDraft({ interests: parseList(value) })} />
              <LabeledTextarea label="Certifications" value={formatList(draft.certifications)} onChange={(value) => updateDraft({ certifications: parseList(value) })} />
            </div>
          </section>
        </div>

        <div className="space-y-6 min-w-0">
          <section className="bg-white border border-gray-200 rounded shadow-sm p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-bold text-gray-900">Resume</h2>
                <div className="mt-1 text-xs text-gray-500">{resumeUpdatedLabel}</div>
              </div>
              <FileText className="w-5 h-5 text-gray-400" />
            </div>
            <div className="mt-4 border border-gray-200 rounded p-3">
              <div className="text-sm font-bold text-gray-900 truncate">{draft.resume?.fileName ?? 'No resume posted'}</div>
              {draft.resume?.note && <div className="mt-1 text-xs text-gray-500 leading-relaxed">{draft.resume.note}</div>}
            </div>
            <div className="mt-3 rounded border border-blue-100 bg-blue-50 px-3 py-2 text-xs leading-relaxed text-blue-800">
              Uploading here updates <strong>{draft.name}</strong>&apos;s existing profile. WorkMatch will show proposed changes first and will not create a new employee profile from this upload.
            </div>
            <label className="mt-4 flex items-center justify-center gap-2 px-3 py-2 border border-gray-200 rounded-md text-sm font-bold text-gray-700 hover:bg-gray-50 cursor-pointer">
              {resumeExtractionLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              Upload Resume to Update My Profile
              <input
                type="file"
                accept=".pdf,.doc,.docx"
                className="sr-only"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (!file) return;
                  void handleResumeFile(file);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            {resumeExtractionError && (
              <div role="alert" className="mt-3 flex gap-2 rounded border border-yellow-200 bg-yellow-50 p-3 text-xs text-yellow-800">
                <AlertCircle className="w-4 h-4 shrink-0" /> {resumeExtractionError}
              </div>
            )}
            <LabeledTextarea
              label="Resume Note"
              value={draft.resume?.note ?? ''}
              onChange={(value) =>
                updateDraft({
                  resume: {
                    fileName: draft.resume?.fileName ?? 'Resume pending file',
                    updatedAt: draft.resume?.updatedAt ?? new Date().toISOString(),
                    note: value,
                  },
                })
              }
              className="mt-4"
            />
            {resumeExtraction && (
              <ResumeExtractionReview
                review={resumeExtraction}
                selectedChangeIds={selectedResumeChangeIds}
                loading={resumeExtractionLoading}
                toggleChange={toggleResumeChange}
                applyChanges={applySelectedResumeChanges}
                clearReview={() => setResumeExtraction(null)}
              />
            )}
          </section>

          <section className="bg-white border border-gray-200 rounded shadow-sm p-5">
            <div className="flex items-center justify-between gap-3 mb-4">
              <h2 className="text-base font-bold text-gray-900">Available Projects</h2>
              <span className="text-xs font-bold text-gray-500">{projectRows.length}</span>
            </div>
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={projectSearch}
                onChange={(event) => setProjectSearch(event.target.value)}
                placeholder="Search projects or skills"
                className="w-full pl-9 pr-3 py-2 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-red-500"
              />
            </div>
            <div className="grid grid-cols-3 gap-1 bg-gray-100 rounded p-1 mb-4">
              {(['recommended', 'open', 'saved'] as ProjectFilter[]).map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setProjectFilter(item)}
                  className={`px-2 py-1.5 rounded text-xs font-bold capitalize ${projectFilter === item ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-900'}`}
                >
                  {item}
                </button>
              ))}
            </div>
            <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
              {projectRows.map(({ task, match, matchedSkills, isSaved }) => (
                <article key={task.id} className="border border-gray-200 rounded p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-bold text-sm text-gray-900 leading-snug">{task.name}</h3>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-500">
                        <span className="flex items-center gap-1"><CalendarDays className="w-3 h-3" /> {task.deadline}</span>
                        <span>{task.location}</span>
                        <span>{task.teamSize} seat{task.teamSize === 1 ? '' : 's'}</span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-black text-gray-900">{match.score}%</div>
                      <div className="text-[10px] font-bold uppercase text-gray-500">Fit</div>
                    </div>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {task.requiredSkills.slice(0, 5).map((skill) => {
                      const matched = matchedSkills.includes(skill);
                      return (
                        <span
                          key={skill}
                          className={`px-2 py-1 rounded border text-[10px] font-bold ${matched ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 bg-gray-50 text-gray-600'}`}
                        >
                          {skill}
                        </span>
                      );
                    })}
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => toggleProjectInterest(task.id)}
                      className={`inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md text-xs font-bold border ${isSaved ? 'border-green-200 bg-green-50 text-green-700' : 'border-gray-200 text-gray-700 hover:bg-gray-50'}`}
                    >
                      <CheckCircle2 className="w-4 h-4" /> {isSaved ? 'Interested' : 'Mark Interest'}
                    </button>
                    <button
                      type="button"
                      onClick={() => onOpenTask(task.id)}
                      className="px-3 py-2 rounded-md text-xs font-bold border border-gray-200 text-gray-700 hover:bg-gray-50"
                    >
                      Details
                    </button>
                  </div>
                </article>
              ))}
              {projectRows.length === 0 && (
                <div className="border border-dashed border-gray-200 rounded p-6 text-center text-sm text-gray-500">
                  No projects match this filter.
                </div>
              )}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}

function LabeledInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="text-xs font-bold text-gray-700">
      {label}
      <input
        type="text"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-red-500"
      />
    </label>
  );
}

function LabeledTextarea({
  label,
  value,
  onChange,
  className = '',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`text-xs font-bold text-gray-700 ${className}`}>
      {label}
      <textarea
        value={value}
        onChange={(event) => onChange(event.target.value)}
        rows={4}
        className="mt-1 w-full resize-none px-3 py-2 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-red-500"
      />
    </label>
  );
}

function ResumeExtractionReview({
  review,
  selectedChangeIds,
  loading,
  toggleChange,
  applyChanges,
  clearReview,
}: {
  review: ResumeExtractionResult;
  selectedChangeIds: string[];
  loading: boolean;
  toggleChange: (changeId: string) => void;
  applyChanges: () => void;
  clearReview: () => void;
}) {
  const selectedCount = review.changes.filter((change) => selectedChangeIds.includes(change.id)).length;

  return (
    <div className="mt-5 border-t border-gray-200 pt-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-gray-900">Resume Extraction Review</h3>
          <p className="mt-1 text-xs text-gray-500 leading-relaxed">
            Proposed updates for {review.targetEmployeeName}. Review selected items before saving them to your profile.
          </p>
        </div>
        <span className="rounded bg-gray-100 px-2 py-1 text-[10px] font-bold uppercase text-gray-600">
          {loading ? 'AI running' : `${review.changes.length} changes`}
        </span>
      </div>

      <div className="mt-3 rounded border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
        <div className="font-bold text-gray-900">Target profile: {review.targetEmployeeName}</div>
        <div className="mt-1">{review.matchReason}</div>
        {review.extractionNotes.length > 0 && (
          <ul className="mt-2 list-disc pl-4 space-y-1">
            {review.extractionNotes.slice(0, 3).map((note) => (
              <li key={note}>{note}</li>
            ))}
          </ul>
        )}
      </div>

      <div className="mt-4 space-y-2">
        {review.changes.map((change) => (
          <ResumeChangeRow
            key={change.id}
            change={change}
            checked={selectedChangeIds.includes(change.id)}
            toggleChange={toggleChange}
          />
        ))}
        {review.changes.length === 0 && (
          <div className="rounded border border-dashed border-gray-200 p-4 text-center text-xs text-gray-500">
            No profile changes were detected from this resume.
          </div>
        )}
      </div>

      {review.upskillingRecommendations.length > 0 && (
        <div className="mt-5 rounded border border-amber-200 bg-amber-50 p-3">
          <div className="flex items-center gap-2 text-xs font-bold uppercase text-amber-800">
            <Lightbulb className="w-4 h-4" /> Upskilling Recommendations
          </div>
          <div className="mt-3 space-y-2">
            {review.upskillingRecommendations.slice(0, 3).map((recommendation) => (
              <div key={recommendation.skillName} className="text-xs text-amber-900">
                <span className="font-bold">{recommendation.skillName}:</span> {recommendation.reason}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-4 grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={clearReview}
          className="px-3 py-2 rounded-md border border-gray-200 text-xs font-bold text-gray-700 hover:bg-gray-50"
        >
          Dismiss
        </button>
        <button
          type="button"
          onClick={applyChanges}
          disabled={selectedCount === 0}
          className="inline-flex items-center justify-center gap-2 rounded-md bg-red-600 px-3 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:bg-gray-300"
        >
          <Save className="w-4 h-4" /> Apply {selectedCount}
        </button>
      </div>
    </div>
  );
}

function ResumeChangeRow({
  change,
  checked,
  toggleChange,
}: {
  change: ResumeProfileChange;
  checked: boolean;
  toggleChange: (changeId: string) => void;
}) {
  return (
    <label className="block rounded border border-gray-200 bg-white p-3 text-xs">
      <div className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={checked}
          onChange={() => toggleChange(change.id)}
          className="mt-1 h-4 w-4 rounded border-gray-300 accent-red-600"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-gray-900">{change.label}</span>
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[10px] font-bold uppercase text-gray-600">{change.confidence}%</span>
            {change.autoConfirmed && (
              <span className="inline-flex items-center gap-1 rounded bg-green-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-green-700">
                <ShieldCheck className="w-3 h-3" /> Auto-confirmed
              </span>
            )}
            {change.source !== 'resume_text' && (
              <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-700">
                <Sparkles className="w-3 h-3" /> AI
              </span>
            )}
          </div>
          <div className="mt-2 grid grid-cols-[minmax(0,1fr)_18px_minmax(0,1fr)] items-center gap-2">
            <span className="truncate rounded bg-gray-50 px-2 py-1 text-gray-600">{change.currentValue}</span>
            <ArrowRight className="w-4 h-4 text-gray-400" />
            <span className="truncate rounded bg-green-50 px-2 py-1 font-bold text-green-800">{change.proposedValue}</span>
          </div>
          <p className="mt-2 leading-relaxed text-gray-500">{change.reason}</p>
        </div>
      </div>
    </label>
  );
}

function normalizeEmployee(employee: Employee): Employee {
  return {
    ...employee,
    name: employee.name.trim() || 'Unnamed Employee',
    role: employee.role.trim() || 'Unassigned',
    department: employee.department.trim() || 'Unassigned',
    location: employee.location.trim() || 'Remote',
    timezone: employee.timezone?.trim() || undefined,
    availability: clamp(employee.availability, 0, 100),
    availabilityStatus: availabilityStatus(employee.availability),
    skills: employee.skills
      .map((skill) => ({
        name: skill.name.trim(),
        rating: clamp(skill.rating, 1, 10),
      }))
      .filter((skill) => skill.name),
    interests: normalizeList(employee.interests),
    certifications: normalizeList(employee.certifications),
    pastProjects: normalizeList(employee.pastProjects),
    projectInterests: normalizeList(employee.projectInterests),
    careerGoals: employee.careerGoals?.trim() || undefined,
    resume: employee.resume?.fileName
      ? {
          fileName: employee.resume.fileName,
          updatedAt: employee.resume.updatedAt,
          note: employee.resume.note?.trim() || undefined,
        }
      : undefined,
  };
}

function normalizeList(values?: string[]) {
  return Array.from(new Set((values ?? []).map((value) => value.trim()).filter(Boolean)));
}

function parseList(value: string) {
  return value
    .split(/\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function formatList(values?: string[]) {
  return (values ?? []).join('\n');
}

function availabilityStatus(value: number): Employee['availabilityStatus'] {
  if (value >= 65) return 'Available';
  if (value >= 30) return 'Partial';
  return 'Busy';
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
