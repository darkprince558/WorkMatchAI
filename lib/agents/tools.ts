import type {
  AgentToolResult,
  DeterministicMatchScore,
  ReadOnlyAgentToolName,
  SourceRef,
} from './contracts';
import { READ_ONLY_AGENT_TOOL_NAMES } from './contracts';
import { matchToDeterministicScore } from './deterministic-score';
import type { Employee, ManagerPriorityWeights, Match, Task, TaskStatus } from '../types';
import { generateMatches } from '../workmatch';

type MaybePromise<T> = T | Promise<T>;

export type AgentReadonlySource<T> = readonly T[] | (() => MaybePromise<readonly T[]>);

export interface AgentRecentImport {
  id: string;
  organizationId?: string;
  sourceName: string;
  sourceType?: string;
  target: string;
  status: string;
  reviewRequired?: boolean;
  rowCount?: number;
  confirmedCount?: number;
  rejectedCount?: number;
  createdAt: string;
  completedAt?: string | null;
}

export interface AgentDocumentChunkLookupInput {
  organizationId?: string;
  query: string;
  documentIds?: string[];
  sourceDocumentIds?: string[];
  targetType?: 'employee' | 'task';
  targetId?: string;
  limit?: number;
}

export interface AgentDocumentChunkHit {
  chunkId: string;
  documentId: string;
  content: string;
  score?: number;
  chunkIndex?: number;
  page?: number;
  sectionTitle?: string;
  sourceRefs?: SourceRef[];
  metadata?: Record<string, unknown>;
}

export type AgentDocumentChunkLookup = (
  input: AgentDocumentChunkLookupInput
) => MaybePromise<readonly AgentDocumentChunkHit[]>;

export interface AgentRagSearchResultLike {
  chunkId?: string;
  sourceDocumentId: string;
  chunkIndex: number;
  content: string;
  contentHash?: string;
  contentCharStart?: number;
  contentCharEnd?: number;
  tokenCount?: number;
  pageNumber?: number;
  sectionTitle?: string;
  parserConfidence?: number;
  metadata?: Record<string, unknown>;
  score: number;
  sourceDocument?: {
    id: string;
    title?: string;
    fileName?: string;
    targetType?: 'employee' | 'task' | string;
    targetId?: string;
    metadata?: Record<string, unknown>;
  };
}

export type AgentRagDocumentChunkSearch = (input: {
  organizationId: string;
  query: string;
  limit?: number;
  sourceDocumentIds?: string[];
  targetType?: 'employee' | 'task';
  targetId?: string;
}) => MaybePromise<readonly AgentRagSearchResultLike[]>;

export interface AgentReadOnlyToolSources {
  employees?: AgentReadonlySource<Employee>;
  tasks?: AgentReadonlySource<Task>;
  recentImports?: AgentReadonlySource<AgentRecentImport>;
  documentChunkLookup?: AgentDocumentChunkLookup;
}

export interface AgentEmployeeSearchInput {
  organizationId?: string;
  employeeIds?: string[];
  query?: string;
  departments?: string[];
  skills?: string[];
  readiness?: Employee['readiness'][];
  minAvailability?: number;
  limit?: number;
}

export interface AgentEmployeesToolOutput {
  employees: Employee[];
  total: number;
  filters: AgentEmployeeSearchInput;
}

export interface AgentTaskSearchInput {
  organizationId?: string;
  taskIds?: string[];
  query?: string;
  statuses?: TaskStatus[];
  urgency?: Task['urgency'][];
  skills?: string[];
  limit?: number;
}

export interface AgentTasksToolOutput {
  tasks: Task[];
  total: number;
  filters: AgentTaskSearchInput;
}

export interface AgentMatchSearchInput {
  organizationId?: string;
  taskIds?: string[];
  employeeIds?: string[];
  minScore?: number;
  limit?: number;
  priorityWeights?: ManagerPriorityWeights;
}

export interface AgentMatchToolItem {
  match: Match;
  deterministicScore: DeterministicMatchScore;
  task: Task;
  employee: Employee;
}

export interface AgentMatchesToolOutput {
  matches: AgentMatchToolItem[];
  total: number;
  filters: AgentMatchSearchInput;
}

export interface AgentRecentImportsInput {
  organizationId?: string;
  query?: string;
  statuses?: string[];
  targets?: string[];
  limit?: number;
}

export interface AgentRecentImportsToolOutput {
  imports: AgentRecentImport[];
  total: number;
  filters: AgentRecentImportsInput;
  unavailableReason?: 'RECENT_IMPORTS_SOURCE_NOT_CONFIGURED';
}

export interface AgentDocumentChunksToolOutput {
  query: string;
  chunks: AgentDocumentChunkHit[];
  total: number;
  filters: AgentDocumentChunkLookupInput;
  unavailableReason?: 'DOCUMENT_LOOKUP_NOT_CONFIGURED' | 'EMPTY_QUERY';
}

export interface WorkMatchReadOnlyAgentTools {
  searchEmployees(input?: AgentEmployeeSearchInput): Promise<AgentToolResult<AgentEmployeesToolOutput>>;
  searchTasks(input?: AgentTaskSearchInput): Promise<AgentToolResult<AgentTasksToolOutput>>;
  scoreMatches(input?: AgentMatchSearchInput): Promise<AgentToolResult<AgentMatchesToolOutput>>;
  listRecentImports(input?: AgentRecentImportsInput): Promise<AgentToolResult<AgentRecentImportsToolOutput>>;
  lookupDocumentChunks(
    input: AgentDocumentChunkLookupInput
  ): Promise<AgentToolResult<AgentDocumentChunksToolOutput>>;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;
const DETERMINISTIC_TOOL_SCORE_CALCULATED_AT = '1970-01-01T00:00:00.000Z';

export function createReadOnlyAgentTools(sources: AgentReadOnlyToolSources): WorkMatchReadOnlyAgentTools {
  return {
    searchEmployees: (input = {}) => searchEmployeesForAgent(sources, input),
    searchTasks: (input = {}) => searchTasksForAgent(sources, input),
    scoreMatches: (input = {}) => scoreMatchesForAgent(sources, input),
    listRecentImports: (input = {}) => listRecentImportsForAgent(sources, input),
    lookupDocumentChunks: (input) => lookupDocumentChunksForAgent(sources, input),
  };
}

export function isReadOnlyAgentToolName(value: string): value is ReadOnlyAgentToolName {
  return (READ_ONLY_AGENT_TOOL_NAMES as readonly string[]).includes(value);
}

export function createDocumentChunkLookupFromRagSearch(search: AgentRagDocumentChunkSearch): AgentDocumentChunkLookup {
  return async (input) => {
    if (!input.organizationId) return [];

    const sourceDocumentIds = uniqueStrings([...(input.sourceDocumentIds ?? []), ...(input.documentIds ?? [])]);
    const results = await search({
      organizationId: input.organizationId,
      query: input.query,
      limit: input.limit,
      sourceDocumentIds: sourceDocumentIds.length ? sourceDocumentIds : undefined,
      targetType: input.targetType,
      targetId: input.targetId,
    });

    return results.map(ragSearchResultToDocumentChunkHit);
  };
}

export async function searchEmployeesForAgent(
  sources: AgentReadOnlyToolSources,
  input: AgentEmployeeSearchInput = {}
): Promise<AgentToolResult<AgentEmployeesToolOutput>> {
  const limit = normalizeLimit(input.limit);
  const filters = compactObject(input);
  const employeeIds = normalizedSet(input.employeeIds);
  const departments = normalizedSet(input.departments);
  const skills = normalizedSet(input.skills);
  const readiness = new Set(input.readiness ?? []);
  const queryTokens = tokenize(input.query);
  const minAvailability = finiteNumber(input.minAvailability);

  const employees = (await resolveSource(sources.employees))
    .filter((employee) => !employeeIds.size || employeeIds.has(normalize(employee.id)))
    .filter((employee) => !departments.size || departments.has(normalize(employee.department)))
    .filter((employee) => !readiness.size || readiness.has(employee.readiness))
    .filter((employee) => minAvailability === undefined || employee.availability >= minAvailability)
    .filter((employee) => hasAllSkills(employee.skills.map((skill) => skill.name), skills))
    .filter((employee) =>
      matchesQuery(queryTokens, [
        employee.id,
        employee.name,
        employee.role,
        employee.department,
        employee.location,
        employee.timezone,
        employee.careerGoals,
        ...(employee.skills ?? []).map((skill) => skill.name),
        ...(employee.certifications ?? []),
        ...(employee.interests ?? []),
        ...(employee.pastProjects ?? []),
      ])
    )
    .sort(compareEmployees);

  const selected = employees.slice(0, limit);
  return createToolResult('search_employees', filters, {
    employees: cloneToolValue(selected),
    total: employees.length,
    filters,
  }, refsForEmployees(selected));
}

export async function searchTasksForAgent(
  sources: AgentReadOnlyToolSources,
  input: AgentTaskSearchInput = {}
): Promise<AgentToolResult<AgentTasksToolOutput>> {
  const limit = normalizeLimit(input.limit);
  const filters = compactObject(input);
  const taskIds = normalizedSet(input.taskIds);
  const statuses = new Set(input.statuses ?? []);
  const urgency = new Set(input.urgency ?? []);
  const skills = normalizedSet(input.skills);
  const queryTokens = tokenize(input.query);

  const tasks = (await resolveSource(sources.tasks))
    .filter((task) => !taskIds.size || taskIds.has(normalize(task.id)))
    .filter((task) => !statuses.size || statuses.has(task.status))
    .filter((task) => !urgency.size || urgency.has(task.urgency))
    .filter((task) => hasAllSkills([...task.requiredSkills, ...task.optionalSkills], skills))
    .filter((task) =>
      matchesQuery(queryTokens, [
        task.id,
        task.name,
        task.type,
        task.description,
        task.urgency,
        task.deadline,
        task.location,
        task.seniority,
        task.staffingMode,
        task.status,
        ...task.requiredSkills,
        ...task.optionalSkills,
      ])
    )
    .sort(compareTasks);

  const selected = tasks.slice(0, limit);
  return createToolResult('search_tasks', filters, {
    tasks: cloneToolValue(selected),
    total: tasks.length,
    filters,
  }, refsForTasks(selected));
}

export async function scoreMatchesForAgent(
  sources: AgentReadOnlyToolSources,
  input: AgentMatchSearchInput = {}
): Promise<AgentToolResult<AgentMatchesToolOutput>> {
  const limit = normalizeLimit(input.limit);
  const filters = compactObject(input);
  const taskIds = normalizedSet(input.taskIds);
  const employeeIds = normalizedSet(input.employeeIds);
  const minScore = finiteNumber(input.minScore) ?? 0;
  const employees = (await resolveSource(sources.employees))
    .filter((employee) => !employeeIds.size || employeeIds.has(normalize(employee.id)))
    .sort(compareEmployees);
  const tasks = (await resolveSource(sources.tasks))
    .filter((task) => !taskIds.size || taskIds.has(normalize(task.id)))
    .sort(compareTasks);
  const employeesById = new Map(employees.map((employee) => [employee.id, employee]));
  const tasksById = new Map(tasks.map((task) => [task.id, task]));

  const matches = generateMatches(tasks, employees, {
    minScore,
    priorityWeights: input.priorityWeights,
  })
    .filter((match) => !employeeIds.size || employeeIds.has(normalize(match.employeeId)))
    .map((match) => {
      const task = tasksById.get(match.taskId);
      const employee = employeesById.get(match.employeeId);
      if (!task || !employee) return undefined;

      return {
        match,
        deterministicScore: createStableDeterministicScore(match, task, employee, input.priorityWeights),
        task,
        employee,
      };
    })
    .filter((item): item is AgentMatchToolItem => Boolean(item))
    .sort(compareMatchItems);

  const selected = matches.slice(0, limit);
  return createToolResult('score_matches', filters, {
    matches: cloneToolValue(selected),
    total: matches.length,
    filters,
  }, refsForMatchItems(selected));
}

export async function listRecentImportsForAgent(
  sources: AgentReadOnlyToolSources,
  input: AgentRecentImportsInput = {}
): Promise<AgentToolResult<AgentRecentImportsToolOutput>> {
  const limit = normalizeLimit(input.limit);
  const filters = compactObject(input);

  if (!sources.recentImports) {
    return createToolResult('list_recent_imports', filters, {
      imports: [],
      total: 0,
      filters,
      unavailableReason: 'RECENT_IMPORTS_SOURCE_NOT_CONFIGURED',
    }, []);
  }

  const statuses = normalizedSet(input.statuses);
  const targets = normalizedSet(input.targets);
  const queryTokens = tokenize(input.query);

  const imports = (await resolveSource(sources.recentImports))
    .filter((item) => !input.organizationId || !item.organizationId || item.organizationId === input.organizationId)
    .filter((item) => !statuses.size || statuses.has(normalize(item.status)))
    .filter((item) => !targets.size || targets.has(normalize(item.target)))
    .filter((item) =>
      matchesQuery(queryTokens, [item.id, item.sourceName, item.sourceType, item.target, item.status])
    )
    .sort(compareRecentImports);

  const selected = imports.slice(0, limit);
  return createToolResult('list_recent_imports', filters, {
    imports: cloneToolValue(selected),
    total: imports.length,
    filters,
  }, selected.map<SourceRef>((item) => ({ sourceType: 'database_record', sourceId: 'import', recordId: item.id })));
}

export async function lookupDocumentChunksForAgent(
  sources: AgentReadOnlyToolSources,
  input: AgentDocumentChunkLookupInput
): Promise<AgentToolResult<AgentDocumentChunksToolOutput>> {
  const limit = normalizeLimit(input.limit);
  const filters = compactObject({ ...input, limit });
  const query = input.query.trim();

  if (!query) {
    return createToolResult('lookup_document_chunks', filters, {
      query,
      chunks: [],
      total: 0,
      filters,
      unavailableReason: 'EMPTY_QUERY',
    }, []);
  }

  if (!sources.documentChunkLookup) {
    return createToolResult('lookup_document_chunks', filters, {
      query,
      chunks: [],
      total: 0,
      filters,
      unavailableReason: 'DOCUMENT_LOOKUP_NOT_CONFIGURED',
    }, []);
  }

  const documentIds = normalizedSet([...(input.documentIds ?? []), ...(input.sourceDocumentIds ?? [])]);
  const chunks = (await sources.documentChunkLookup({ ...input, query, limit }))
    .filter((chunk) => !documentIds.size || documentIds.has(normalize(chunk.documentId)))
    .map(normalizeDocumentChunk)
    .sort(compareDocumentChunks);
  const selected = chunks.slice(0, limit);

  return createToolResult('lookup_document_chunks', filters, {
    query,
    chunks: cloneToolValue(selected),
    total: chunks.length,
    filters,
  }, selected.flatMap((chunk) => chunk.sourceRefs ?? []));
}

async function resolveSource<T>(source: AgentReadonlySource<T> | undefined): Promise<T[]> {
  if (!source) return [];
  const records = typeof source === 'function' ? await source() : source;
  return Array.from(records);
}

function createStableDeterministicScore(
  match: Match,
  task: Task,
  employee: Employee,
  priorityWeights?: ManagerPriorityWeights
): DeterministicMatchScore {
  return {
    ...matchToDeterministicScore({ match, task, employee, priorityWeights }),
    calculatedAt: DETERMINISTIC_TOOL_SCORE_CALCULATED_AT,
  };
}

function normalizeDocumentChunk(chunk: AgentDocumentChunkHit): AgentDocumentChunkHit {
  const fallbackRef: SourceRef = {
    sourceType: 'database_record',
    sourceId: 'document_chunk',
    recordId: chunk.chunkId || `${chunk.documentId}:${chunk.chunkIndex ?? 'chunk'}`,
  };
  if (chunk.page !== undefined) fallbackRef.page = chunk.page;

  return {
    ...chunk,
    chunkId: chunk.chunkId || `${chunk.documentId}:${chunk.chunkIndex ?? 'chunk'}`,
    sourceRefs: chunk.sourceRefs?.length ? chunk.sourceRefs : [fallbackRef],
  };
}

function ragSearchResultToDocumentChunkHit(result: AgentRagSearchResultLike): AgentDocumentChunkHit {
  const chunkId = result.chunkId || `${result.sourceDocumentId}:${result.chunkIndex}`;
  const sourceRef: SourceRef = {
    sourceType: 'database_record',
    sourceId: 'document_chunk',
    recordId: chunkId,
  };
  if (result.pageNumber !== undefined) sourceRef.page = result.pageNumber;
  if (result.contentCharStart !== undefined && result.contentCharEnd !== undefined) {
    sourceRef.charRange = {
      start: result.contentCharStart,
      end: result.contentCharEnd,
    };
  }

  return {
    chunkId,
    documentId: result.sourceDocumentId,
    content: result.content,
    score: result.score,
    chunkIndex: result.chunkIndex,
    page: result.pageNumber,
    sectionTitle: result.sectionTitle,
    sourceRefs: [sourceRef],
    metadata: compactObject({
      ...(result.metadata ?? {}),
      contentHash: result.contentHash,
      tokenCount: result.tokenCount,
      parserConfidence: result.parserConfidence,
      sourceDocument: result.sourceDocument,
    }) as Record<string, unknown>,
  };
}

function createToolResult<TOutput>(
  toolName: ReadOnlyAgentToolName,
  input: unknown,
  output: TOutput,
  sourceRefs: SourceRef[]
): AgentToolResult<TOutput> {
  const refs = dedupeSourceRefs(sourceRefs);
  const resultRef = `tool-result:${toolName}:${stableHash({ toolName, input, output, sourceRefs: refs })}`;

  return {
    toolCallId: resultRef.replace('tool-result:', 'tool-call:'),
    toolName,
    resultRef,
    sourceRefs: refs,
    output,
  };
}

function refsForEmployees(employees: readonly Employee[]): SourceRef[] {
  return employees.map<SourceRef>((employee) => ({ sourceType: 'database_record', sourceId: 'employee', recordId: employee.id }));
}

function refsForTasks(tasks: readonly Task[]): SourceRef[] {
  return tasks.map<SourceRef>((task) => ({ sourceType: 'database_record', sourceId: 'task', recordId: task.id }));
}

function refsForMatchItems(items: readonly AgentMatchToolItem[]): SourceRef[] {
  return items.flatMap((item) => [
    { sourceType: 'deterministic_score' as const, sourceId: item.deterministicScore.scoreId, recordId: item.task.id },
    { sourceType: 'database_record' as const, sourceId: 'task', recordId: item.task.id },
    { sourceType: 'database_record' as const, sourceId: 'employee', recordId: item.employee.id },
  ]);
}

function dedupeSourceRefs(refs: readonly SourceRef[]): SourceRef[] {
  const seen = new Set<string>();
  const output: SourceRef[] = [];

  refs.forEach((ref) => {
    const key = stableStringify(ref);
    if (seen.has(key)) return;
    seen.add(key);
    output.push(ref);
  });

  return output;
}

function compareEmployees(a: Employee, b: Employee) {
  return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function compareTasks(a: Task, b: Task) {
  return a.deadline.localeCompare(b.deadline) || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
}

function compareMatchItems(a: AgentMatchToolItem, b: AgentMatchToolItem) {
  return (
    b.match.score - a.match.score ||
    a.task.id.localeCompare(b.task.id) ||
    a.employee.id.localeCompare(b.employee.id)
  );
}

function compareRecentImports(a: AgentRecentImport, b: AgentRecentImport) {
  return b.createdAt.localeCompare(a.createdAt) || a.id.localeCompare(b.id);
}

function compareDocumentChunks(a: AgentDocumentChunkHit, b: AgentDocumentChunkHit) {
  return (
    (b.score ?? 0) - (a.score ?? 0) ||
    a.documentId.localeCompare(b.documentId) ||
    (a.chunkIndex ?? 0) - (b.chunkIndex ?? 0) ||
    a.chunkId.localeCompare(b.chunkId)
  );
}

function hasAllSkills(candidateSkills: readonly string[], requiredSkills: Set<string>) {
  if (!requiredSkills.size) return true;
  const candidateSet = normalizedSet(candidateSkills);
  return Array.from(requiredSkills).every((skill) => candidateSet.has(skill));
}

function matchesQuery(queryTokens: readonly string[], fields: readonly (string | undefined)[]) {
  if (!queryTokens.length) return true;
  const haystack = normalize(fields.filter(Boolean).join(' '));
  return queryTokens.every((token) => haystack.includes(token));
}

function tokenize(value: string | undefined) {
  return normalize(value ?? '')
    .split(' ')
    .filter(Boolean);
}

function normalizedSet(values: readonly string[] | undefined) {
  return new Set((values ?? []).map(normalize).filter(Boolean));
}

function uniqueStrings(values: readonly string[]) {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function finiteNumber(value: number | undefined) {
  return value === undefined || !Number.isFinite(value) ? undefined : value;
}

function normalizeLimit(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(MAX_LIMIT, Math.floor(value));
}

function compactObject<T extends object>(value: T): T {
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).filter(
      ([, item]) => item !== undefined && (!Array.isArray(item) || item.length > 0)
    )
  ) as T;
}

function cloneToolValue<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function stableHash(value: unknown) {
  const input = stableStringify(value);
  let hash = 0x811c9dc5;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }

  return hash.toString(16).padStart(8, '0');
}

function stableStringify(value: unknown): string {
  if (value === undefined) return 'undefined';
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;

  return `{${Object.entries(value as Record<string, unknown>)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`)
    .join(',')}}`;
}
