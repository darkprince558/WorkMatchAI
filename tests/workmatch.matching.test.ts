import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import type { Employee, Task } from '../lib/types';

const require = createRequire(import.meta.url);
const { formatMatchScoreLabel, generateMatches, scoreMatch } = require('../lib/workmatch.ts') as typeof import('../lib/workmatch');

function createTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 'task-1',
    name: 'AI Intake Build',
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
    status: 'Ready to Staff',
    ...overrides,
  };
}

function createEmployee(overrides: Partial<Employee> = {}): Employee {
  return {
    id: 'emp-1',
    name: 'Maya Chen',
    role: 'Senior Engineer',
    department: 'Product',
    location: 'Toronto',
    availability: 85,
    availabilityStatus: 'Available',
    skills: [
      { name: 'React', rating: 9 },
      { name: 'TypeScript', rating: 9 },
      { name: 'AI', rating: 8 },
      { name: 'Supabase', rating: 7 },
    ],
    yearsExp: 8,
    readiness: 'Ready',
    avatar: '',
    ...overrides,
  };
}

describe('deterministic WorkMatch scoring', () => {
  it('locks the current high-confidence match score, label, and display text', () => {
    const match = scoreMatch(createTask(), createEmployee());

    assert.equal(match.id, 'task-1-emp-1');
    assert.equal(match.score, 94);
    assert.equal(match.label, 'Perfect');
    assert.equal(match.aiRecommended, true);
    assert.deepEqual(match.missingSkills, []);
    assert.equal(formatMatchScoreLabel(match), 'Perfect Match (94%)');
    assert.match(match.aiExplanation, /Maya Chen scores 94% for AI Intake Build/);
    assert.deepEqual(
      match.factors.map((factor) => factor.label),
      ['Skill Fit', 'Availability', 'Location', 'Bonus Skills']
    );
  });

  it('treats below-minimum required ratings as missing skills with review guidance', () => {
    const match = scoreMatch(
      createTask(),
      createEmployee({
        id: 'emp-2',
        name: 'Sam Patel',
        availability: 30,
        availabilityStatus: 'Partial',
        skills: [
          { name: 'React', rating: 6 },
          { name: 'TypeScript', rating: 8 },
        ],
        yearsExp: 3,
      })
    );

    assert.equal(match.score, 52);
    assert.equal(match.label, 'Risky');
    assert.equal(match.aiRecommended, false);
    assert.deepEqual(match.missingSkills, ['React', 'AI']);
    assert.equal(match.trainingSuggestion, 'Create a short enablement plan around React and AI before assignment approval.');
    assert.ok(match.factors.some((factor) => factor.label === 'Missing Skills' && factor.description === 'React, AI'));
  });

  it('applies manager priority weights to the deterministic score', () => {
    const task = createTask();
    const strongEmployee = createEmployee();
    const constrainedEmployee = createEmployee({
      id: 'emp-2',
      name: 'Sam Patel',
      availability: 30,
      availabilityStatus: 'Partial',
      skills: [
        { name: 'React', rating: 6 },
        { name: 'TypeScript', rating: 8 },
      ],
      yearsExp: 3,
    });
    const weightedConstrainedScore = scoreMatch(task, constrainedEmployee, { priorityWeights: { availability: 3 } }).score;

    assert.equal(scoreMatch(task, strongEmployee, { priorityWeights: { availability: 3 } }).score, 92);
    assert.equal(weightedConstrainedScore, 47);
    assert.ok(weightedConstrainedScore < scoreMatch(task, constrainedEmployee).score);
  });

  it('sorts generated matches by score and honors minimum score filtering', () => {
    const task = createTask();
    const candidates = [
      createEmployee({
        id: 'emp-2',
        name: 'Sam Patel',
        availability: 30,
        availabilityStatus: 'Partial',
        skills: [
          { name: 'React', rating: 6 },
          { name: 'TypeScript', rating: 8 },
        ],
        yearsExp: 3,
      }),
      createEmployee(),
      createEmployee({
        id: 'emp-3',
        name: 'Riley Gomez',
        location: 'Remote',
        availability: 60,
        skills: [
          { name: 'React', rating: 8 },
          { name: 'TypeScript', rating: 8 },
          { name: 'AI', rating: 7 },
        ],
      }),
    ];
    const matches = generateMatches([task], candidates, { minScore: 35 });

    assert.deepEqual(
      matches.map((match) => ({
        employeeId: match.employeeId,
        score: match.score,
        label: match.label,
        missingSkills: match.missingSkills,
      })),
      [
        { employeeId: 'emp-1', score: 94, label: 'Perfect', missingSkills: [] },
        { employeeId: 'emp-3', score: 81, label: 'Strong', missingSkills: [] },
        { employeeId: 'emp-2', score: 52, label: 'Risky', missingSkills: ['React', 'AI'] },
      ]
    );

    assert.deepEqual(generateMatches([task], candidates, { minScore: 80 }).map((match) => match.employeeId), ['emp-1', 'emp-3']);
  });

  it('prioritizes team matches that add required-skill coverage', () => {
    const teamTask = createTask({
      id: 'task-team',
      name: 'Platform Migration',
      urgency: 'Medium',
      deadline: '2026-08-01',
      estHours: 160,
      requiredSkills: ['React', 'Supabase', 'Security', 'Data'],
      optionalSkills: [],
      requiredSkillSpecs: [
        { name: 'React', minRating: 8, importance: 'high' },
        { name: 'Supabase', minRating: 7, importance: 'critical' },
        { name: 'Security', minRating: 7, importance: 'high' },
        { name: 'Data', minRating: 6, importance: 'medium' },
      ],
      optionalSkillSpecs: [],
      location: 'Remote',
      remote: true,
      teamSize: 2,
      staffingMode: 'Team',
    });
    const employees = [
      createEmployee({
        id: 'emp-react',
        name: 'React Lead',
        location: 'Remote',
        availability: 70,
        skills: [
          { name: 'React', rating: 9 },
          { name: 'TypeScript', rating: 9 },
        ],
      }),
      createEmployee({
        id: 'emp-data',
        name: 'Data Sec',
        department: 'Platform',
        location: 'Remote',
        availability: 65,
        skills: [
          { name: 'Data', rating: 8 },
          { name: 'Security', rating: 8 },
        ],
        yearsExp: 7,
      }),
      createEmployee({
        id: 'emp-supa',
        name: 'Supa Specialist',
        department: 'Platform',
        location: 'Remote',
        availability: 60,
        skills: [
          { name: 'Supabase', rating: 8 },
          { name: 'Security', rating: 7 },
        ],
        yearsExp: 6,
      }),
    ];

    const matches = generateMatches([teamTask], employees, { minScore: 35 });

    assert.deepEqual(
      matches.map((match) => ({ employeeId: match.employeeId, score: match.score, label: match.label })),
      [
        { employeeId: 'emp-supa', score: 62, label: 'Growth' },
        { employeeId: 'emp-data', score: 62, label: 'Growth' },
        { employeeId: 'emp-react', score: 55, label: 'Growth' },
      ]
    );
    assert.equal(matches[0].factors[0].label, 'Team Coverage');
    assert.equal(matches[0].factors[0].description, 'Starts team coverage for Supabase, Security');
    assert.equal(matches[1].factors[0].description, 'Adds team coverage for Data');
  });
});
