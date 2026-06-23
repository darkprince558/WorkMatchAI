import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import type { Employee, Task } from '../lib/types';

const require = createRequire(import.meta.url);
const { READ_ONLY_AGENT_TOOL_NAMES } = require('../lib/agents/contracts.ts') as typeof import('../lib/agents/contracts');
const { createDocumentChunkLookupFromRagSearch, createReadOnlyAgentTools } = require('../lib/agents/tools.ts') as typeof import('../lib/agents/tools');

function createEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    name: 'Maya Chen',
    role: 'Senior Engineer',
    department: 'Engineering',
    location: 'Toronto',
    timezone: 'America/Toronto',
    availability: 85,
    availabilityStatus: 'Available',
    skills: [
      { name: 'React', rating: 9 },
      { name: 'TypeScript', rating: 9 },
      { name: 'AI', rating: 8 },
    ],
    yearsExp: 8,
    readiness: 'Ready',
    avatar: '',
    certifications: ['Azure Developer Associate'],
    interests: ['Mentoring'],
    pastProjects: ['Client Portal'],
    ...overrides,
  };
}

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'AI Intake Build',
    type: 'Client Project',
    description: 'Build an AI intake workflow.',
    urgency: 'High',
    deadline: '2026-07-01',
    estHours: 80,
    requiredSkills: ['React', 'TypeScript', 'AI'],
    optionalSkills: ['Supabase'],
    requiredSkillSpecs: [
      { name: 'React', minRating: 8, importance: 'critical' },
      { name: 'TypeScript', minRating: 8, importance: 'high' },
      { name: 'AI', minRating: 7, importance: 'medium' },
    ],
    optionalSkillSpecs: [{ name: 'Supabase', minRating: 6, importance: 'low' }],
    location: 'Toronto',
    remote: false,
    teamSize: 1,
    seniority: 'Senior',
    staffingMode: 'One Employee',
    status: 'Ready to Staff',
    ...overrides,
  };
}

const employees = [
  createEmployee(),
  createEmployee({
    id: 'emp-2',
    name: 'Ava Wilson',
    role: 'Designer',
    department: 'Design',
    availability: 45,
    skills: [
      { name: 'Figma', rating: 9 },
      { name: 'React', rating: 5 },
    ],
    yearsExp: 5,
  }),
];

const tasks = [
  createTask(),
  createTask({
    id: 'task-2',
    name: 'Design System Audit',
    urgency: 'Medium',
    deadline: '2026-07-10',
    estHours: 60,
    requiredSkills: ['Figma', 'Accessibility'],
    optionalSkills: ['React'],
    requiredSkillSpecs: [
      { name: 'Figma', minRating: 8, importance: 'high' },
      { name: 'Accessibility', minRating: 7, importance: 'medium' },
    ],
    optionalSkillSpecs: [{ name: 'React', minRating: 5 }],
    location: 'Remote',
    remote: true,
    seniority: 'Intermediate',
    status: 'New',
  }),
];

describe('read-only WorkMatch agent tools', () => {
  it('exposes only read-oriented tool names', () => {
    assert.deepEqual(READ_ONLY_AGENT_TOOL_NAMES, [
      'search_employees',
      'search_tasks',
      'score_matches',
      'list_recent_imports',
      'lookup_document_chunks',
    ]);

    READ_ONLY_AGENT_TOOL_NAMES.forEach((toolName) => {
      assert.doesNotMatch(toolName, /create|update|delete|write|approve|commit|mutate|insert|upsert|patch|post/i);
    });
  });

  it('searches employees deterministically without returning mutable source objects', async () => {
    const tools = createReadOnlyAgentTools({ employees, tasks });
    const input = { query: 'maya react', departments: ['Engineering'], skills: ['React'], limit: 5 };
    const result = await tools.searchEmployees(input);

    assert.equal(result.toolName, 'search_employees');
    assert.deepEqual(result.output.employees.map((employee) => employee.id), ['emp-1']);
    assert.deepEqual(result.sourceRefs, [{ sourceType: 'database_record', sourceId: 'employee', recordId: 'emp-1' }]);
    assert.deepEqual(await tools.searchEmployees(input), result);

    result.output.employees[0].name = 'Changed Locally';
    assert.equal((await tools.searchEmployees(input)).output.employees[0].name, 'Maya Chen');
  });

  it('searches tasks by deterministic task filters', async () => {
    const tools = createReadOnlyAgentTools({ employees, tasks });
    const result = await tools.searchTasks({ statuses: ['Ready to Staff'], skills: ['AI'], query: 'intake', limit: 10 });

    assert.equal(result.toolName, 'search_tasks');
    assert.deepEqual(result.output.tasks.map((task) => task.id), ['task-1']);
    assert.deepEqual(result.sourceRefs, [{ sourceType: 'database_record', sourceId: 'task', recordId: 'task-1' }]);
  });

  it('scores matches with stable deterministic score metadata', async () => {
    const tools = createReadOnlyAgentTools({ employees, tasks });
    const input = { taskIds: ['task-1'], employeeIds: ['emp-1', 'emp-2'], minScore: 0, limit: 2 };
    const result = await tools.scoreMatches(input);

    assert.equal(result.toolName, 'score_matches');
    assert.deepEqual(
      result.output.matches.map((item) => item.employee.id),
      ['emp-1', 'emp-2']
    );
    assert.equal(result.output.matches[0].deterministicScore.calculatedAt, '1970-01-01T00:00:00.000Z');
    assert.equal(result.output.matches[0].deterministicScore.totalScore, result.output.matches[0].match.score);
    assert.ok(result.sourceRefs.some((ref) => ref.sourceType === 'deterministic_score'));
    assert.deepEqual(await tools.scoreMatches(input), result);
  });

  it('lists recent imports from an injected read source only', async () => {
    const tools = createReadOnlyAgentTools({
      employees,
      tasks,
      recentImports: [
        {
          id: 'import-old',
          organizationId: 'org-1',
          sourceName: 'old.csv',
          target: 'employee',
          status: 'confirmed',
          createdAt: '2026-06-20T00:00:00.000Z',
        },
        {
          id: 'import-new',
          organizationId: 'org-1',
          sourceName: 'new.csv',
          target: 'employee',
          status: 'confirmed',
          createdAt: '2026-06-22T00:00:00.000Z',
        },
        {
          id: 'import-other-org',
          organizationId: 'org-2',
          sourceName: 'other.csv',
          target: 'task',
          status: 'confirmed',
          createdAt: '2026-06-23T00:00:00.000Z',
        },
      ],
    });

    const result = await tools.listRecentImports({ organizationId: 'org-1', statuses: ['confirmed'], limit: 1 });

    assert.deepEqual(result.output.imports.map((item) => item.id), ['import-new']);
    assert.equal(result.output.total, 2);
    assert.deepEqual(result.sourceRefs, [{ sourceType: 'database_record', sourceId: 'import', recordId: 'import-new' }]);
  });

  it('uses an injected document chunk lookup and reports when none is configured', async () => {
    let receivedLimit: number | undefined;
    const tools = createReadOnlyAgentTools({
      employees,
      tasks,
      documentChunkLookup: (input) => {
        receivedLimit = input.limit;
        return [
          { chunkId: 'low', documentId: 'doc-1', content: 'React mention.', score: 0.4, chunkIndex: 0 },
          { chunkId: 'high', documentId: 'doc-1', content: 'React and AI staffing evidence.', score: 0.9, chunkIndex: 1 },
          { chunkId: 'other', documentId: 'doc-2', content: 'Filtered out.', score: 1, chunkIndex: 0 },
        ];
      },
    });

    const result = await tools.lookupDocumentChunks({ query: 'React', documentIds: ['doc-1'], limit: 1 });

    assert.equal(receivedLimit, 1);
    assert.deepEqual(result.output.chunks.map((chunk) => chunk.chunkId), ['high']);
    assert.deepEqual(result.sourceRefs, [{ sourceType: 'database_record', sourceId: 'document_chunk', recordId: 'high' }]);

    const unavailable = await createReadOnlyAgentTools({ employees, tasks }).lookupDocumentChunks({ query: 'React' });
    assert.equal(unavailable.output.unavailableReason, 'DOCUMENT_LOOKUP_NOT_CONFIGURED');
    assert.deepEqual(unavailable.output.chunks, []);
  });

  it('adapts an injected RAG chunk search helper without coupling to RAG writes', async () => {
    let receivedSourceDocumentIds: string[] | undefined;
    const documentChunkLookup = createDocumentChunkLookupFromRagSearch(async (input) => {
      receivedSourceDocumentIds = input.sourceDocumentIds;
      return [
        {
          chunkId: 'chunk-rag',
          sourceDocumentId: 'doc-rag',
          chunkIndex: 3,
          content: 'RAG search result for React staffing.',
          contentHash: 'hash-rag',
          contentCharStart: 10,
          contentCharEnd: 42,
          tokenCount: 6,
          pageNumber: 2,
          score: 7,
          metadata: { source: 'unit-test' },
        },
      ];
    });
    const tools = createReadOnlyAgentTools({ employees, tasks, documentChunkLookup });

    const result = await tools.lookupDocumentChunks({
      organizationId: 'org-1',
      query: 'React',
      documentIds: ['doc-rag'],
      limit: 1,
    });

    assert.deepEqual(receivedSourceDocumentIds, ['doc-rag']);
    assert.equal(result.output.chunks[0].documentId, 'doc-rag');
    assert.equal(result.output.chunks[0].metadata?.contentHash, 'hash-rag');
    assert.deepEqual(result.sourceRefs, [
      {
        sourceType: 'database_record',
        sourceId: 'document_chunk',
        recordId: 'chunk-rag',
        page: 2,
        charRange: { start: 10, end: 42 },
      },
    ]);
  });
});
