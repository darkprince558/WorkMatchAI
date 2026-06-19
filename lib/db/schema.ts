import type {
  ImportRecordType,
  ImportTarget,
  EmployeeResume,
  ManagerPriorityWeights,
  MatchLabel,
  MatchPriority,
  Skill,
  SkillImportance,
  SkillRequirement,
  TaskStatus,
  WorkMatchDocument,
} from '../types';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export const PERSISTENCE_TABLES = {
  employees: 'employees',
  tasks: 'tasks',
  imports: 'imports',
  importedRecords: 'imported_records',
  assignments: 'assignments',
  settings: 'settings',
  agentRuns: 'agent_runs',
  auditEvents: 'audit_events',
} as const;

export type DbTableName = (typeof PERSISTENCE_TABLES)[keyof typeof PERSISTENCE_TABLES];

export type IsoTimestamp = string;
export type IsoDate = string;
export type Uuid = string;

export type EmployeeAvailabilityStatus = 'Available' | 'Partial' | 'Busy';
export type EmployeeReadiness = 'Ready' | 'In Training' | 'Busy';
export type TaskUrgency = 'Low' | 'Medium' | 'High';
export type StaffingMode = 'One Employee' | 'Team' | string;
export type ImportSourceType =
  | 'csv'
  | 'excel'
  | 'pdf'
  | 'word'
  | 'microsoft365'
  | 'roster'
  | 'manual';
export type ImportStatus =
  | 'uploaded'
  | 'parsed'
  | 'needs_review'
  | 'confirmed'
  | 'partially_confirmed'
  | 'rejected'
  | 'failed';
export type ImportedRecordType = ImportRecordType | 'assignment' | 'mixed' | 'unknown';
export type ImportedRecordReviewStatus = 'needs_review' | 'needs_correction' | 'confirmed' | 'rejected' | 'deferred';
export type AssignmentStatus =
  | 'proposed'
  | 'pending_review'
  | 'approved'
  | 'rejected'
  | 'active'
  | 'completed'
  | 'cancelled';
export type AssignmentSource = 'manager' | 'match_recommendation' | 'roster_import' | 'system';
export type SettingsScope = 'organization' | 'team' | 'user';
export type AgentName =
  | 'document_extraction_assistance'
  | 'skill_normalization'
  | 'employee_summary'
  | 'task_summary'
  | 'match_explanation'
  | 'dashboard_insights'
  | 'manager_copilot';
export type AgentRunStatus = 'queued' | 'running' | 'completed' | 'needs_review' | 'partial' | 'failed' | 'fallback';
export type AgentTriggerType = 'upload' | 'manual_request' | 'scheduled_insight' | 'system_retry';
export type AuditActorType = 'manager' | 'agent' | 'system';
export type AuditTargetType =
  | 'agent_run'
  | 'employee'
  | 'task'
  | 'import'
  | 'imported_record'
  | 'assignment'
  | 'settings'
  | 'match';
export type AuditEventType =
  | 'agent_run_started'
  | 'agent_run_completed'
  | 'fallback_used'
  | 'import_created'
  | 'import_record_reviewed'
  | 'import_confirmed'
  | 'employee_upserted'
  | 'task_upserted'
  | 'assignment_reviewed'
  | 'assignment_approved'
  | 'assignment_changed'
  | 'settings_changed'
  | 'manager_override_submitted';

export type SourceRef = {
  sourceType: 'upload' | 'database_record' | 'manager_input' | 'sample_data' | 'tool_result';
  sourceId: string;
  recordId?: string;
  page?: number;
  row?: number;
  column?: string;
  charRange?: {
    start: number;
    end: number;
  };
};

export type DuplicateCandidate = {
  recordType: 'employee' | 'task' | 'assignment' | 'imported_record';
  recordId: string;
  reason: string;
  confidence: number;
};

export type SkillSnapshot = Skill & {
  normalizedSkillId?: string;
  importance?: SkillImportance;
  sourceRefs?: SourceRef[];
  verifiedByUserId?: Uuid;
  verifiedAt?: IsoTimestamp;
};

export type SkillRequirementSnapshot = SkillRequirement & {
  normalizedSkillId?: string;
  sourceRefs?: SourceRef[];
  requiresManagerReview?: boolean;
};

export type ImportedEmployeePayload = {
  externalEmployeeId?: string;
  name?: string;
  role?: string;
  department?: string;
  location?: string;
  timezone?: string;
  availabilityPercent?: number;
  availabilityStatus?: EmployeeAvailabilityStatus;
  skills?: SkillSnapshot[];
  yearsExperience?: number;
  readiness?: EmployeeReadiness;
  avatarUrl?: string;
  interests?: string[];
  careerGoals?: string;
  certifications?: string[];
  pastProjects?: string[];
  resume?: EmployeeResume;
  projectInterests?: string[];
};

export type ImportedTaskPayload = {
  externalTaskId?: string;
  name?: string;
  type?: string;
  description?: string;
  urgency?: TaskUrgency;
  deadlineDate?: IsoDate;
  estimatedHours?: number;
  requiredSkills?: SkillRequirementSnapshot[];
  optionalSkills?: SkillRequirementSnapshot[];
  location?: string;
  remote?: boolean;
  teamSize?: number;
  seniority?: string;
  staffingMode?: StaffingMode;
  status?: TaskStatus;
};

export type ImportedAssignmentPayload = {
  externalTaskId?: string;
  taskId?: Uuid;
  externalEmployeeId?: string;
  employeeId?: Uuid;
  allocationPercent?: number;
  startDate?: IsoDate;
  endDate?: IsoDate;
  notes?: string;
};

export type ImportedRecordPayload = ImportedEmployeePayload | ImportedTaskPayload | ImportedAssignmentPayload | Json;

export type WorkMatchSettings = {
  aiProvider?: 'environment' | 'openai' | 'gemini';
  defaultPriority?: MatchPriority;
  priorityWeights?: ManagerPriorityWeights;
  importConfidenceThreshold?: number;
  requireManagerReview?: boolean;
  auditVisibility?: 'admins_only' | 'managers' | 'reviewers';
  enabledDataSources?: Partial<Record<ImportSourceType, boolean>>;
  agentFallbackMode?: 'deterministic_only' | 'allow_ai_when_configured';
};

export type EmployeeRow = {
  id: Uuid;
  organization_id: Uuid;
  external_employee_id: string | null;
  name: string;
  role: string;
  department: string;
  location: string;
  timezone: string | null;
  availability_percent: number;
  availability_status: EmployeeAvailabilityStatus | null;
  skills: SkillSnapshot[];
  years_experience: number;
  readiness: EmployeeReadiness;
  avatar_url: string | null;
  interests: string[];
  career_goals: string | null;
  certifications: string[];
  past_projects: string[];
  resume_file_name: string | null;
  resume_updated_at: IsoTimestamp | null;
  resume_note: string | null;
  project_interests: string[];
  source_import_id: Uuid | null;
  source_record_id: Uuid | null;
  is_active: boolean;
  created_by_user_id: Uuid | null;
  updated_by_user_id: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type TaskRow = {
  id: Uuid;
  organization_id: Uuid;
  external_task_id: string | null;
  name: string;
  type: string | null;
  description: string | null;
  urgency: TaskUrgency;
  deadline_date: IsoDate;
  estimated_hours: number;
  required_skills: SkillRequirementSnapshot[];
  optional_skills: SkillRequirementSnapshot[];
  location: string;
  remote: boolean;
  team_size: number;
  seniority: string | null;
  staffing_mode: StaffingMode;
  status: TaskStatus;
  source_documents: WorkMatchDocument[];
  source_import_id: Uuid | null;
  source_record_id: Uuid | null;
  created_by_user_id: Uuid | null;
  updated_by_user_id: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type ImportRow = {
  id: Uuid;
  organization_id: Uuid;
  source_type: ImportSourceType;
  source_name: string;
  source_uri: string | null;
  storage_path: string | null;
  target: ImportTarget;
  status: ImportStatus;
  review_required: boolean;
  confidence_threshold: number;
  row_count: number;
  confirmed_count: number;
  rejected_count: number;
  triggered_by_user_id: Uuid | null;
  agent_run_id: Uuid | null;
  error_message: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
  completed_at: IsoTimestamp | null;
};

export type ImportedRecordRow = {
  id: Uuid;
  organization_id: Uuid;
  import_id: Uuid;
  record_type: ImportedRecordType;
  review_status: ImportedRecordReviewStatus;
  confidence: number;
  issues: string[];
  source_refs: SourceRef[];
  source_row_number: number | null;
  source_sheet: string | null;
  raw_payload: Json;
  normalized_payload: ImportedRecordPayload;
  duplicate_candidates: DuplicateCandidate[];
  reviewer_user_id: Uuid | null;
  reviewed_at: IsoTimestamp | null;
  creates_record_id: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type AssignmentRow = {
  id: Uuid;
  organization_id: Uuid;
  task_id: Uuid;
  employee_id: Uuid;
  status: AssignmentStatus;
  source: AssignmentSource;
  allocation_percent: number;
  match_score: number | null;
  match_label: MatchLabel | null;
  start_date: IsoDate | null;
  end_date: IsoDate | null;
  reviewed_by_user_id: Uuid | null;
  approved_at: IsoTimestamp | null;
  rejected_at: IsoTimestamp | null;
  notes: string | null;
  import_id: Uuid | null;
  imported_record_id: Uuid | null;
  agent_run_id: Uuid | null;
  created_by_user_id: Uuid | null;
  updated_by_user_id: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type SettingsRow = {
  id: Uuid;
  organization_id: Uuid;
  scope: SettingsScope;
  team_id: Uuid | null;
  user_id: Uuid | null;
  key: string;
  value: WorkMatchSettings | Json;
  schema_version: number;
  updated_by_user_id: Uuid | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type AgentRunRow = {
  id: Uuid;
  organization_id: Uuid;
  agent_name: AgentName;
  workflow_version: string;
  status: AgentRunStatus;
  started_at: IsoTimestamp;
  completed_at: IsoTimestamp | null;
  triggered_by_user_id: Uuid | null;
  trigger_type: AgentTriggerType;
  input_hash: string;
  input_summary: string;
  input_ref: string | null;
  output_ref: string | null;
  output_summary: string | null;
  model_provider: string | null;
  model_name: string | null;
  model_version: string | null;
  prompt_version: string | null;
  token_input_count: number | null;
  token_output_count: number | null;
  estimated_cost_usd: number | null;
  tool_call_count: number;
  fallback_used: boolean;
  deterministic_score_used: boolean;
  error_code: string | null;
  error_message: string | null;
  created_at: IsoTimestamp;
  updated_at: IsoTimestamp;
};

export type AuditEventRow = {
  id: Uuid;
  organization_id: Uuid;
  actor_type: AuditActorType;
  actor_id: Uuid | string | null;
  event_type: AuditEventType;
  target_type: AuditTargetType;
  target_id: Uuid | string;
  before_ref: string | null;
  after_ref: string | null;
  before_snapshot: Json;
  after_snapshot: Json;
  agent_run_id: Uuid | null;
  manager_user_id: Uuid | null;
  reason: string | null;
  metadata: Json;
  created_at: IsoTimestamp;
};

type ImmutableRecordKey = 'id' | 'organization_id' | 'created_at';
type MutableKeys<Row> = Exclude<keyof Row, ImmutableRecordKey>;
type DbInsert<Row, RequiredKeys extends keyof Row> = Pick<Row, RequiredKeys> & Partial<Omit<Row, RequiredKeys>>;
type DbUpdate<Row> = Partial<Pick<Row, MutableKeys<Row>>>;

export type EmployeeInsert = DbInsert<
  EmployeeRow,
  'organization_id' | 'name' | 'role' | 'department' | 'location' | 'availability_percent' | 'skills' | 'years_experience' | 'readiness'
>;
export type EmployeeUpdate = DbUpdate<EmployeeRow>;

export type TaskInsert = DbInsert<
  TaskRow,
  | 'organization_id'
  | 'name'
  | 'urgency'
  | 'deadline_date'
  | 'estimated_hours'
  | 'required_skills'
  | 'optional_skills'
  | 'location'
  | 'remote'
  | 'team_size'
  | 'staffing_mode'
  | 'status'
>;
export type TaskUpdate = DbUpdate<TaskRow>;

export type ImportInsert = DbInsert<
  ImportRow,
  'organization_id' | 'source_type' | 'source_name' | 'target' | 'status' | 'review_required' | 'confidence_threshold'
>;
export type ImportUpdate = DbUpdate<ImportRow>;

export type ImportedRecordInsert = DbInsert<
  ImportedRecordRow,
  'organization_id' | 'import_id' | 'record_type' | 'review_status' | 'confidence' | 'issues' | 'source_refs' | 'raw_payload' | 'normalized_payload'
>;
export type ImportedRecordUpdate = DbUpdate<ImportedRecordRow>;

export type AssignmentInsert = DbInsert<
  AssignmentRow,
  'organization_id' | 'task_id' | 'employee_id' | 'status' | 'source' | 'allocation_percent'
>;
export type AssignmentUpdate = DbUpdate<AssignmentRow>;

export type SettingsInsert = DbInsert<SettingsRow, 'organization_id' | 'scope' | 'key' | 'value' | 'schema_version'>;
export type SettingsUpdate = DbUpdate<SettingsRow>;

export type AgentRunInsert = DbInsert<
  AgentRunRow,
  | 'organization_id'
  | 'agent_name'
  | 'workflow_version'
  | 'status'
  | 'started_at'
  | 'trigger_type'
  | 'input_hash'
  | 'input_summary'
  | 'tool_call_count'
  | 'fallback_used'
  | 'deterministic_score_used'
>;
export type AgentRunUpdate = DbUpdate<AgentRunRow>;

export type AuditEventInsert = DbInsert<
  AuditEventRow,
  'organization_id' | 'actor_type' | 'event_type' | 'target_type' | 'target_id' | 'created_at'
>;
export type AuditEventUpdate = DbUpdate<AuditEventRow>;

export type DatabaseTable<Row, Insert, Update> = {
  Row: Row;
  Insert: Insert;
  Update: Update;
  Relationships: [];
};

export type Database = {
  public: {
    Tables: {
      employees: DatabaseTable<EmployeeRow, EmployeeInsert, EmployeeUpdate>;
      tasks: DatabaseTable<TaskRow, TaskInsert, TaskUpdate>;
      imports: DatabaseTable<ImportRow, ImportInsert, ImportUpdate>;
      imported_records: DatabaseTable<ImportedRecordRow, ImportedRecordInsert, ImportedRecordUpdate>;
      assignments: DatabaseTable<AssignmentRow, AssignmentInsert, AssignmentUpdate>;
      settings: DatabaseTable<SettingsRow, SettingsInsert, SettingsUpdate>;
      agent_runs: DatabaseTable<AgentRunRow, AgentRunInsert, AgentRunUpdate>;
      audit_events: DatabaseTable<AuditEventRow, AuditEventInsert, AuditEventUpdate>;
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: {
      assignment_source: AssignmentSource;
      assignment_status: AssignmentStatus;
      audit_actor_type: AuditActorType;
      audit_event_type: AuditEventType;
      audit_target_type: AuditTargetType;
      import_source_type: ImportSourceType;
      import_status: ImportStatus;
      imported_record_review_status: ImportedRecordReviewStatus;
      imported_record_type: ImportedRecordType;
      settings_scope: SettingsScope;
    };
    CompositeTypes: Record<string, never>;
  };
};

export type TableRow<TableName extends keyof Database['public']['Tables']> = Database['public']['Tables'][TableName]['Row'];
export type TableInsert<TableName extends keyof Database['public']['Tables']> = Database['public']['Tables'][TableName]['Insert'];
export type TableUpdate<TableName extends keyof Database['public']['Tables']> = Database['public']['Tables'][TableName]['Update'];
