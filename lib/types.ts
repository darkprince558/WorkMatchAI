export interface Skill {
  name: string;
  rating: number; // 1-10
}

export interface EmployeeResume {
  fileName: string;
  updatedAt: string;
  note?: string;
}

export interface WorkMatchDocument {
  id: string;
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  linkedAt: string;
  targetType?: 'task' | 'employee';
  targetId?: string;
  targetName?: string;
  sourceRecordId?: string;
  dataUrl?: string;
  storagePath?: string;
  note?: string;
}

export type SkillImportance = 'low' | 'medium' | 'high' | 'critical';

export interface SkillRequirement {
  name: string;
  minRating?: number; // 1-10 when the source provides a target level
  importance?: SkillImportance;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  department: string;
  location: string;
  timezone?: string;
  availability: number; // 0-100%
  availabilityStatus?: 'Available' | 'Partial' | 'Busy';
  skills: Skill[];
  yearsExp: number;
  readiness: 'Ready' | 'In Training' | 'Busy';
  avatar: string;
  interests?: string[];
  careerGoals?: string;
  certifications?: string[];
  pastProjects?: string[];
  resume?: EmployeeResume;
  projectInterests?: string[];
}

export type TaskStatus = 'New' | 'Needs Review' | 'Ready to Staff' | 'In Progress' | 'At Risk';

export interface Task {
  id: string;
  name: string;
  type?: 'Client Project' | 'Internal Work' | string;
  description?: string;
  urgency: 'Low' | 'Medium' | 'High';
  deadline: string;
  estHours: number;
  requiredSkills: string[];
  optionalSkills: string[];
  requiredSkillSpecs?: SkillRequirement[];
  optionalSkillSpecs?: SkillRequirement[];
  location: string;
  remote: boolean;
  teamSize: number;
  seniority?: string;
  staffingMode?: 'One Employee' | 'Team' | string;
  status: TaskStatus;
  assignedEmployeeIds?: string[];
  sourceDocuments?: WorkMatchDocument[];
}

export interface MatchFactor {
  label: string;
  type: 'positive' | 'negative' | 'warning';
  description: string;
}

export interface Match {
  id: string;
  taskId: string;
  employeeId: string;
  score: number; // 0-100
  label?: MatchLabel;
  aiRecommended?: boolean;
  aiExplanation: string;
  factors: MatchFactor[];
  missingSkills?: string[];
  trainingSuggestion?: string;
}

export type MatchLabel =
  | 'Perfect'
  | 'Strong'
  | 'Good'
  | 'Growth'
  | 'Risky'
  | 'Not Recommended';

export type MatchPriority = 'skillFit' | 'availability' | 'experience' | 'location' | 'urgency' | 'growth';

export type ManagerPriorityWeights = Partial<Record<MatchPriority, number>>;

export interface MatchScoringOptions {
  priorityWeights?: ManagerPriorityWeights;
  minScore?: number;
}

export type ImportRecordType = 'employee' | 'task';
export type ImportReviewStatus = 'Needs Review' | 'Needs Correction' | 'Confirmed';
export type ImportTarget = 'auto' | 'employee' | 'task' | 'roster';

export type ResumeProfileChangeKind = 'field' | 'list-add' | 'skill-add' | 'skill-upgrade' | 'certification';

export interface ResumeProfileChange {
  id: string;
  kind: ResumeProfileChangeKind;
  field: keyof Employee | `skill:${string}`;
  label: string;
  currentValue: string;
  proposedValue: string;
  confidence: number;
  source: 'ai' | 'resume_text' | 'ai_resume_text';
  reason: string;
  autoConfirmed?: boolean;
  requiresReview?: boolean;
}

export interface ResumeUpskillingRecommendation {
  skillName: string;
  reason: string;
  relatedTaskIds: string[];
  priority: 'high' | 'medium' | 'low';
}

export interface ResumeProfileUpdateReview {
  sourceFile: string;
  targetEmployeeId: string;
  targetEmployeeName: string;
  matchConfidence: number;
  matchReason: string;
  changes: ResumeProfileChange[];
  upskillingRecommendations: ResumeUpskillingRecommendation[];
  extractionNotes: string[];
}

export interface ImportReviewRecord {
  id: string;
  type: ImportRecordType;
  reviewStatus: ImportReviewStatus;
  confidence: number;
  entity: Employee | Task;
  issues: string[];
  sourceFile: string;
  sourceDocument?: WorkMatchDocument;
  profileUpdate?: ResumeProfileUpdateReview;
}
