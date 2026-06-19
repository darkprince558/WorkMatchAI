import type { AgentMatchLabel, DeterministicMatchScore } from './contracts';
import type { Employee, ManagerPriorityWeights, Match, MatchLabel, Task } from '../types';

const defaultPriorityWeights: Required<ManagerPriorityWeights> = {
  skillFit: 1,
  availability: 1,
  experience: 1,
  location: 1,
  urgency: 1,
  growth: 1,
};

const labelMap: Record<MatchLabel, AgentMatchLabel> = {
  Perfect: 'Perfect Match',
  Strong: 'Strong Match',
  Good: 'Good Match',
  Growth: 'Growth Match',
  Risky: 'Risky Match',
  'Not Recommended': 'Not Recommended',
};

export function matchToDeterministicScore({
  match,
  task,
  employee,
  priorityWeights,
}: {
  match: Match;
  task: Task;
  employee?: Employee;
  priorityWeights?: ManagerPriorityWeights;
}): DeterministicMatchScore {
  const requiredSkillCoverage = calculateRequiredSkillCoverage(task, employee);
  const optionalSkillBonus = calculateOptionalSkillBonus(task, employee);

  return {
    scoreId: `score-${match.id}`,
    employeeId: match.employeeId,
    taskId: match.taskId,
    totalScore: match.score,
    label: labelMap[match.label ?? 'Good'],
    componentScores: {
      skillFit: clamp(Math.round(requiredSkillCoverage * 0.8 + optionalSkillBonus * 0.2), 0, 100),
      requiredSkillCoverage,
      optionalSkillBonus,
      availability: clamp(employee?.availability ?? 0, 0, 100),
      experience: clamp((employee?.yearsExp ?? 0) * 10, 0, 100),
      locationTimezone: task.remote || employee?.location === task.location ? 90 : 45,
      urgencyDeadline: task.urgency === 'High' ? 90 : task.urgency === 'Medium' ? 70 : 55,
      growthOpportunity: match.trainingSuggestion ? 75 : 45,
    },
    weights: {
      ...defaultPriorityWeights,
      ...priorityWeights,
    },
    hardConstraintResults: [
      {
        constraintId: 'availability',
        passed: (employee?.availability ?? 0) > 0,
        message: employee ? `${employee.name} has ${employee.availability}% availability.` : 'Employee profile was not found.',
      },
      {
        constraintId: 'required-skills',
        passed: (match.missingSkills?.length ?? 0) === 0,
        message: match.missingSkills?.length
          ? `Missing required skills: ${match.missingSkills.join(', ')}.`
          : 'Required skills are covered or near-covered.',
      },
    ],
    calculatedAt: new Date().toISOString(),
    scoringVersion: 'workmatch-deterministic-v1',
  };
}

function calculateRequiredSkillCoverage(task: Task, employee?: Employee) {
  if (!employee || !task.requiredSkills.length) return 0;
  const employeeSkills = new Set(employee.skills.map((skill) => normalize(skill.name)));
  const covered = task.requiredSkills.filter((skill) => employeeSkills.has(normalize(skill))).length;
  return Math.round((covered / task.requiredSkills.length) * 100);
}

function calculateOptionalSkillBonus(task: Task, employee?: Employee) {
  if (!employee || !task.optionalSkills.length) return 0;
  const employeeSkills = new Set(employee.skills.map((skill) => normalize(skill.name)));
  const covered = task.optionalSkills.filter((skill) => employeeSkills.has(normalize(skill))).length;
  return Math.round((covered / task.optionalSkills.length) * 100);
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
