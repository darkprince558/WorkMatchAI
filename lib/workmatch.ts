import {
  Employee,
  ImportRecordType,
  ImportReviewRecord,
  ImportReviewStatus,
  ImportTarget,
  ManagerPriorityWeights,
  Match,
  MatchFactor,
  MatchLabel,
  MatchPriority,
  MatchScoringOptions,
  SkillImportance,
  SkillRequirement,
  Task,
  TaskStatus,
} from './types';
import { mergeDocumentLists } from './document-vault';

const taskStatuses: TaskStatus[] = ['New', 'Needs Review', 'Ready to Staff', 'In Progress', 'At Risk'];
const priorityKeys: MatchPriority[] = ['skillFit', 'availability', 'experience', 'location', 'urgency', 'growth'];

const defaultPriorityWeights: Required<ManagerPriorityWeights> = {
  skillFit: 1,
  availability: 1,
  experience: 1,
  location: 1,
  urgency: 1,
  growth: 1,
};

const scoringComponentWeights: Required<ManagerPriorityWeights> = {
  skillFit: 0.52,
  availability: 0.16,
  experience: 0.12,
  location: 0.08,
  urgency: 0.07,
  growth: 0.05,
};

const importanceWeights: Record<SkillImportance, number> = {
  low: 0.75,
  medium: 1,
  high: 1.25,
  critical: 1.5,
};

const matchLabelThresholds: Array<{ min: number; label: MatchLabel }> = [
  { min: 92, label: 'Perfect' },
  { min: 80, label: 'Strong' },
  { min: 68, label: 'Good' },
  { min: 55, label: 'Growth' },
  { min: 40, label: 'Risky' },
  { min: 0, label: 'Not Recommended' },
];

const matchLabelDisplayNames: Record<MatchLabel, string> = {
  Perfect: 'Perfect Match',
  Strong: 'Strong Match',
  Good: 'Good Match',
  Growth: 'Growth Match',
  Risky: 'Risky Match',
  'Not Recommended': 'Not Recommended',
};

export function formatMatchScoreLabel(match: Pick<Match, 'label' | 'score'>) {
  const label = match.label ? matchLabelDisplayNames[match.label] : 'Match';
  return `${label} (${match.score}%)`;
}

export function splitList(value?: string) {
  if (!value) return [];
  return value
    .split('|')
    .map((item) => item.trim())
    .filter(Boolean);
}

export function parseSkills(value?: string) {
  return splitList(value).map((item) => {
    const [name, rating] = item.split(':');
    return {
      name: name.trim(),
      rating: clamp(Number(rating) || 5, 1, 10),
    };
  });
}

export function parseSkillRequirements(value?: string): SkillRequirement[] {
  return splitList(value)
    .map((item) => {
      const [name, ...metadata] = item.split(':').map((part) => part.trim()).filter(Boolean);
      if (!name) return undefined;

      const requirement: SkillRequirement = { name };
      metadata.forEach((part) => {
        const numericValue = Number(part);
        const importance = normalizeImportance(part);

        if (!Number.isNaN(numericValue)) {
          requirement.minRating = clamp(numericValue, 1, 10);
        } else if (importance) {
          requirement.importance = importance;
        }
      });

      return requirement;
    })
    .filter((requirement): requirement is SkillRequirement => Boolean(requirement));
}

export function parseRequiredSkills(value?: string) {
  return parseSkillRequirements(value).map((item) => item.name);
}

export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let current = '';
  let row: string[] = [];
  let inQuotes = false;

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && inQuotes && next === '"') {
      current += '"';
      i += 1;
    } else if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      row.push(current.trim());
      current = '';
    } else if ((char === '\n' || char === '\r') && !inQuotes) {
      if (char === '\r' && next === '\n') i += 1;
      row.push(current.trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      current = '';
    } else {
      current += char;
    }
  }

  row.push(current.trim());
  if (row.some(Boolean)) rows.push(row);

  if (rows.length < 2) return [];
  const headers = rows[0].map((header) => header.trim());
  return rows.slice(1).map((values) => Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ''])));
}

export function importRowsFromCsv(text: string, sourceFile: string, target: ImportTarget = 'auto'): ImportReviewRecord[] {
  return parseCsv(text).map((row, index) => {
    if (usesEmployeeImportSchema(row, target)) {
      const employee = rowToEmployee(row, index);
      const issues = getImportIssues(employee, 'employee', row);
      const confidence = calculateImportConfidence(issues, employee.skills.length >= 3 ? 98 : 84);
      return {
        id: `${sourceFile}-employee-${employee.id}-${index}`,
        type: 'employee',
        reviewStatus: getInitialReviewStatus(issues, confidence),
        confidence,
        entity: employee,
        issues,
        sourceFile,
      };
    }

    const task = rowToTask(row, index);
    const issues = getImportIssues(task, 'task', row);
    const confidence = calculateImportConfidence(issues, task.requiredSkills.length >= 3 ? 97 : 82);
    return {
      id: `${sourceFile}-task-${task.id}-${index}`,
      type: 'task',
      reviewStatus: getInitialReviewStatus(issues, confidence),
      confidence,
      entity: task,
      issues,
      sourceFile,
    };
  });
}

export function getImportIssues(entity: Employee | Task, type: ImportRecordType, sourceRow?: Record<string, string>): string[] {
  const issues: string[] = [];

  if (type === 'employee') {
    const employee = entity as Employee;
    addMissingIssue(issues, sourceRow, ['employee_id', 'id'], employee.id, 'Employee ID');
    addMissingIssue(issues, sourceRow, ['name'], employee.name, 'Name');
    addMissingIssue(issues, sourceRow, ['role'], employee.role, 'Role');
    addMissingIssue(issues, sourceRow, ['department'], employee.department, 'Department');
    addMissingIssue(issues, sourceRow, ['capacity_percent', 'availability'], String(employee.availability), 'Availability');

    if (employee.name === 'Unnamed employee' && !issues.includes('Missing Name')) issues.push('Missing Name');
    if (!employee.skills.length) issues.push('No skills detected in skills column');
    if (!Number.isFinite(employee.availability) || employee.availability < 0 || employee.availability > 100) {
      issues.push('Availability must be between 0 and 100');
    }
    if (!Number.isFinite(employee.yearsExp) || employee.yearsExp < 0) {
      issues.push('Years experience must be zero or greater');
    }

    return issues;
  }

  const task = entity as Task;
  addMissingIssue(issues, sourceRow, ['task_id', 'id'], task.id, 'Task ID');
  addMissingIssue(issues, sourceRow, ['name'], task.name, 'Name');
  addMissingIssue(issues, sourceRow, ['required_skills', 'requiredSkills'], task.requiredSkills.join('|'), 'Required skills');
  addMissingIssue(issues, sourceRow, ['deadline'], task.deadline, 'Deadline');
  addMissingIssue(issues, sourceRow, ['estimated_hours', 'estimatedHours', 'estHours'], String(task.estHours), 'Estimated hours');

  if (task.name === 'Unnamed task' && !issues.includes('Missing Name')) issues.push('Missing Name');
  if (!task.requiredSkills.length) issues.push('No required skills detected in required_skills column');
  if (!Number.isFinite(task.estHours) || task.estHours <= 0) issues.push('Estimated hours must be greater than zero');
  if (!Number.isFinite(task.teamSize) || task.teamSize < 1) issues.push('Team size must be at least one');
  if (
    sourceRow &&
    normalize(task.staffingMode ?? '') === 'team' &&
    !hasSourceValue(sourceRow, ['team_size', 'teamSize', 'headcount', 'required_people', 'requiredPeople', 'staff_required', 'staffRequired'])
  ) {
    issues.push(`Inferred team size ${task.teamSize} from staffing mode, estimated hours, and required skills`);
  }

  return issues;
}

export function generateMatches(tasks: Task[], employees: Employee[], options: MatchScoringOptions = {}): Match[] {
  const minScore = options.minScore ?? 35;

  return tasks.flatMap((task) => {
    const scoredMatches = employees
      .map((employee) => scoreMatch(task, employee, options))
      .filter((match) => match.score >= minScore)
      .sort(compareMatches);

    const rankedMatches = task.teamSize > 1 ? orderTeamMatches(task, employees, scoredMatches) : scoredMatches;
    return rankedMatches.slice(0, Math.max(3, task.teamSize + 1));
  });
}

export function scoreMatch(task: Task, employee: Employee, options: MatchScoringOptions = {}): Match {
  const weights = resolvePriorityWeights(options.priorityWeights);
  const requiredSpecs = getRequiredSkillSpecs(task);
  const optionalSpecs = getOptionalSkillSpecs(task);
  const skillMap = new Map(employee.skills.map((skill) => [normalize(skill.name), skill]));
  const requiredResults = requiredSpecs.map((spec) => {
    const skill = skillMap.get(normalize(spec.name));
    const minRating = spec.minRating;
    const meetsMinimum = Boolean(skill && (!minRating || skill.rating >= minRating));
    const ratingCredit = skill && minRating ? clamp(skill.rating / minRating, 0, 1) : skill ? 1 : 0;

    return {
      spec,
      skill,
      meetsMinimum,
      coverageCredit: meetsMinimum ? 1 : ratingCredit * 0.8,
      importance: importanceWeights[spec.importance ?? 'medium'],
    };
  });
  const optionalResults = optionalSpecs.map((spec) => {
    const skill = skillMap.get(normalize(spec.name));
    return {
      spec,
      skill,
      meetsMinimum: Boolean(skill && (!spec.minRating || skill.rating >= spec.minRating)),
    };
  });
  const matchedRequired = requiredResults.filter((result) => result.meetsMinimum).map((result) => result.spec.name);
  const matchedOptional = optionalResults.filter((result) => result.meetsMinimum).map((result) => result.spec.name);
  const missingSkills = requiredResults.filter((result) => !result.meetsMinimum).map((result) => result.spec.name);
  const totalRequiredImportance = requiredResults.reduce((sum, result) => sum + result.importance, 0);
  const requiredCoverage = totalRequiredImportance
    ? requiredResults.reduce((sum, result) => sum + result.coverageCredit * result.importance, 0) / totalRequiredImportance
    : 0.4;
  const averageRequiredRating = requiredResults.filter((result) => result.skill).length
    ? requiredResults.reduce((sum, result) => sum + (result.skill?.rating ?? 0) * result.importance, 0) /
      requiredResults.filter((result) => result.skill).reduce((sum, result) => sum + result.importance, 0)
    : 0;
  const optionalCoverage = optionalSpecs.length ? matchedOptional.length / optionalSpecs.length : 0;
  const skillFitScore = clamp(requiredCoverage * 72 + (averageRequiredRating / 10) * 18 + optionalCoverage * 10, 0, 100);
  const availabilityScore = clamp(employee.availability, 0, 100);
  const locationScore = calculateLocationScore(task, employee);
  const experienceScore = calculateExperienceScore(task, employee);
  const urgencyScore = calculateUrgencyScore(task, employee);
  const growthScore = calculateGrowthScore(task, employee, requiredResults);
  const score = calculateWeightedScore(
    {
      skillFit: skillFitScore,
      availability: availabilityScore,
      experience: experienceScore,
      location: locationScore,
      urgency: urgencyScore,
      growth: growthScore,
    },
    weights
  );
  const factors = buildFactors(task, employee, matchedRequired, matchedOptional, missingSkills, locationScore, options.priorityWeights);
  const label = getMatchLabel(score);

  return {
    id: `${task.id}-${employee.id}`,
    taskId: task.id,
    employeeId: employee.id,
    score,
    label,
    aiRecommended: score >= 68 && employee.availability >= 35 && missingSkills.length <= Math.max(1, Math.floor(requiredSpecs.length / 2)),
    aiExplanation: buildExplanation(task, employee, matchedRequired, missingSkills, score),
    factors,
    missingSkills,
    trainingSuggestion: missingSkills.length
      ? `Create a short enablement plan around ${missingSkills.slice(0, 2).join(' and ')} before assignment approval.`
      : undefined,
  };
}

export function getDashboardMetrics(employees: Employee[], tasks: Task[], matches: Match[]) {
  const availableCapacity = Math.round(employees.reduce((sum, employee) => sum + employee.availability, 0) / Math.max(employees.length, 1));
  const openTasks = tasks.filter((task) => task.status !== 'In Progress').length;
  const recommendedMatches = matches.filter((match) => match.aiRecommended).length;
  const skillGaps = getSkillGaps(employees, tasks);
  const atRiskTasks = tasks.filter((task) => task.status === 'At Risk' || (bestMatchForTask(matches, task.id)?.score ?? 100) < 55).length;

  return {
    totalEmployees: employees.length,
    availableCapacity,
    openTasks,
    recommendedMatches,
    skillGaps,
    atRiskTasks,
  };
}

export function getDepartmentCapacity(employees: Employee[]) {
  const grouped = new Map<string, { total: number; count: number }>();
  employees.forEach((employee) => {
    const current = grouped.get(employee.department) ?? { total: 0, count: 0 };
    grouped.set(employee.department, { total: current.total + employee.availability, count: current.count + 1 });
  });

  return Array.from(grouped, ([name, value]) => ({
    name,
    value: Math.round(value.total / value.count),
  }));
}

export function getSkillGaps(employees: Employee[], tasks: Task[]) {
  const supply = new Map<string, number>();
  employees.forEach((employee) => {
    const capacity = getEmployeeSupplyCapacity(employee);
    employee.skills.forEach((skill) => {
      if (skill.rating >= 6 && capacity > 0) {
        supply.set(skill.name, (supply.get(skill.name) ?? 0) + capacity);
      }
    });
  });

  const demand = new Map<string, number>();
  tasks
    .filter((task) => task.status !== 'In Progress')
    .forEach((task) =>
      getRequiredSkillSpecs(task).forEach((skill) => demand.set(skill.name, (demand.get(skill.name) ?? 0) + task.teamSize))
    );

  return Array.from(demand, ([name, needed]) => {
    const available = supply.get(name) ?? 0;
    const gap = Math.max(needed - available, 0);
    return {
      name,
      needed,
      available: Number(available.toFixed(1)),
      gap: Number(gap.toFixed(1)),
    };
  })
    .filter((skill) => skill.gap > 0)
    .sort((a, b) => Number(a.available > 0) - Number(b.available > 0) || b.gap - a.gap || b.needed - a.needed);
}

export function bestMatchForTask(matches: Match[], taskId: string) {
  return matches.filter((match) => match.taskId === taskId).sort((a, b) => b.score - a.score)[0];
}

export function upsertEmployees(current: Employee[], incoming: Employee[]) {
  const map = new Map(current.map((employee) => [employee.id, employee]));
  incoming.forEach((employee) => map.set(employee.id, employee));
  return Array.from(map.values());
}

export function upsertTasks(current: Task[], incoming: Task[]) {
  const map = new Map(current.map((task) => [task.id, task]));
  incoming.forEach((task) => {
    const existing = map.get(task.id);
    map.set(task.id, {
      ...task,
      sourceDocuments: mergeDocumentLists(existing?.sourceDocuments, task.sourceDocuments),
    });
  });
  return Array.from(map.values());
}

export function isTask(entity: Employee | Task): entity is Task {
  return 'requiredSkills' in entity;
}

function usesEmployeeImportSchema(row: Record<string, string>, target: ImportTarget) {
  if (target === 'employee' || target === 'roster') return true;
  if (target === 'task') return false;
  return 'employee_id' in row || 'capacity_percent' in row || 'availability_status' in row || 'skills' in row;
}

function calculateImportConfidence(issues: string[], baseConfidence: number) {
  return clamp(baseConfidence - issues.length * 12, 35, 99);
}

function getInitialReviewStatus(issues: string[], confidence: number): ImportReviewStatus {
  if (issues.length) return 'Needs Correction';
  return confidence < 90 ? 'Needs Correction' : 'Needs Review';
}

function addMissingIssue(
  issues: string[],
  sourceRow: Record<string, string> | undefined,
  sourceKeys: string[],
  parsedValue: string,
  label: string
) {
  const sourceHasValue = sourceRow ? hasSourceValue(sourceRow, sourceKeys) : Boolean(parsedValue);
  if (!sourceHasValue || !parsedValue.trim()) issues.push(`Missing ${label}`);
}

function hasSourceValue(sourceRow: Record<string, string>, sourceKeys: string[]) {
  return sourceKeys.some((key) => Boolean(sourceRow[key]?.trim()));
}

function rowToEmployee(row: Record<string, string>, index: number): Employee {
  const availability = clamp(Number(row.capacity_percent || row.availability || 0), 0, 100);
  const availabilityStatus = normalizeAvailability(row.availability_status, availability);

  return {
    id: row.employee_id || row.id || `EMP-${index + 1}`,
    name: row.name || 'Unnamed employee',
    role: row.role || 'Consultant',
    department: row.department || 'Unassigned',
    location: row.location || 'Remote',
    timezone: row.timezone,
    availability,
    availabilityStatus,
    readiness: availabilityStatus === 'Busy' ? 'Busy' : 'Ready',
    yearsExp: Number(row.years_experience || row.yearsExp || 0),
    avatar: `https://picsum.photos/seed/${encodeURIComponent(row.name || `employee-${index}`)}/200/200`,
    skills: parseSkills(row.skills),
    certifications: splitList(row.certifications),
    pastProjects: splitList(row.past_projects),
    interests: splitList(row.interests),
    careerGoals: row.career_goals,
  };
}

function rowToTask(row: Record<string, string>, index: number): Task {
  const requiredSkillSpecs = parseSkillRequirements(row.required_skills || row.requiredSkills);
  const optionalSkillSpecs = parseSkillRequirements(row.optional_skills || row.optionalSkills);
  const estHours = Number(row.estimated_hours || row.estimatedHours || row.estHours || 0);
  const staffingMode = row.staffing_mode || row.staffingMode;

  return {
    id: row.task_id || row.id || `TASK-${index + 1}`,
    name: row.name || 'Unnamed task',
    type: row.type,
    description: row.description,
    requiredSkills: requiredSkillSpecs.map((skill) => skill.name),
    optionalSkills: optionalSkillSpecs.map((skill) => skill.name),
    requiredSkillSpecs,
    optionalSkillSpecs,
    urgency: normalizeUrgency(row.urgency),
    deadline: row.deadline || new Date().toISOString().slice(0, 10),
    estHours,
    location: row.location || 'Remote',
    remote: (row.remote_status || '').toLowerCase() !== 'onsite',
    seniority: row.seniority_required,
    staffingMode,
    teamSize: parseTeamSize(row, staffingMode, estHours, requiredSkillSpecs.length),
    status: taskStatuses.includes(row.status as TaskStatus) ? (row.status as TaskStatus) : 'New',
  };
}

function buildFactors(
  task: Task,
  employee: Employee,
  matchedRequired: string[],
  matchedOptional: string[],
  missingSkills: string[],
  locationScore: number,
  priorityWeights?: ManagerPriorityWeights
): MatchFactor[] {
  const factors: MatchFactor[] = [
    {
      label: 'Skill Fit',
      type: matchedRequired.length >= Math.ceil(task.requiredSkills.length * 0.75) ? 'positive' : 'warning',
      description: `${matchedRequired.length}/${task.requiredSkills.length} required skills matched`,
    },
    {
      label: 'Availability',
      type: employee.availability >= 50 ? 'positive' : employee.availability >= 25 ? 'warning' : 'negative',
      description: `${employee.availability}% available capacity`,
    },
    {
      label: 'Location',
      type: locationScore >= 80 ? 'positive' : 'warning',
      description: task.remote ? 'Remote or hybrid compatible' : `${employee.location} vs ${task.location}`,
    },
  ];

  if (matchedOptional.length) {
    factors.push({
      label: 'Bonus Skills',
      type: 'positive',
      description: matchedOptional.join(', '),
    });
  }

  if (missingSkills.length) {
    factors.push({
      label: 'Missing Skills',
      type: missingSkills.length > 2 ? 'negative' : 'warning',
      description: missingSkills.join(', '),
    });
  }

  const activePriorities = describePriorityWeights(priorityWeights);
  if (activePriorities) {
    factors.push({
      label: 'Manager Priorities',
      type: 'positive',
      description: activePriorities,
    });
  }

  return factors;
}

function buildExplanation(task: Task, employee: Employee, matchedRequired: string[], missingSkills: string[], score: number) {
  const matched = matchedRequired.length ? matchedRequired.join(', ') : 'adjacent experience';
  const risk = missingSkills.length ? ` Main gap: ${missingSkills.slice(0, 2).join(', ')}.` : '';
  const capacity = employee.availability >= 50 ? 'has enough near-term capacity' : 'has limited capacity, so manager review is recommended';
  return `${employee.name} scores ${score}% for ${task.name} because they match ${matched} and ${capacity}.${risk}`;
}

function getRequiredSkillSpecs(task: Task): SkillRequirement[] {
  return task.requiredSkillSpecs?.length
    ? task.requiredSkillSpecs
    : task.requiredSkills.map((name) => ({ name, importance: 'medium' }));
}

function getOptionalSkillSpecs(task: Task): SkillRequirement[] {
  return task.optionalSkillSpecs?.length
    ? task.optionalSkillSpecs
    : task.optionalSkills.map((name) => ({ name, importance: 'medium' }));
}

function getMatchLabel(score: number): MatchLabel {
  return matchLabelThresholds.find((threshold) => score >= threshold.min)?.label ?? 'Not Recommended';
}

function calculateWeightedScore(componentScores: Required<ManagerPriorityWeights>, managerWeights: Required<ManagerPriorityWeights>) {
  const weighted = priorityKeys.reduce(
    (total, key) => {
      const weight = scoringComponentWeights[key] * managerWeights[key];
      return {
        score: total.score + componentScores[key] * weight,
        weight: total.weight + weight,
      };
    },
    { score: 0, weight: 0 }
  );

  return Math.round(clamp(weighted.weight ? weighted.score / weighted.weight : 0, 0, 100));
}

function resolvePriorityWeights(priorityWeights?: ManagerPriorityWeights): Required<ManagerPriorityWeights> {
  return priorityKeys.reduce<Required<ManagerPriorityWeights>>(
    (resolved, key) => ({
      ...resolved,
      [key]: clamp(priorityWeights?.[key] ?? defaultPriorityWeights[key], 0, 3),
    }),
    { ...defaultPriorityWeights }
  );
}

function describePriorityWeights(priorityWeights?: ManagerPriorityWeights) {
  if (!priorityWeights) return '';

  return priorityKeys
    .filter((key) => priorityWeights[key] !== undefined && priorityWeights[key] !== defaultPriorityWeights[key])
    .map((key) => `${formatPriorityName(key)} x${clamp(priorityWeights[key] ?? 0, 0, 3).toFixed(1)}`)
    .join(', ');
}

function formatPriorityName(priority: MatchPriority) {
  return priority.replace(/([A-Z])/g, ' $1').replace(/^./, (letter) => letter.toUpperCase());
}

function calculateLocationScore(task: Task, employee: Employee) {
  const taskLocation = normalize(task.location);
  const employeeLocation = normalize(employee.location);

  if (taskLocation === employeeLocation) return 100;
  if (task.remote || taskLocation === 'remote') return employeeLocation === 'remote' ? 95 : 90;
  if (employeeLocation === 'remote') return 70;
  return 45;
}

function calculateExperienceScore(task: Task, employee: Employee) {
  const seniority = normalize(task.seniority ?? '');

  if (seniority.includes('senior')) {
    if (employee.yearsExp >= 7) return 100;
    if (employee.yearsExp >= 5) return 78;
    if (employee.yearsExp >= 3) return 58;
    return 35;
  }

  if (seniority.includes('intermediate') || seniority.includes('mid')) {
    if (employee.yearsExp >= 4) return 100;
    if (employee.yearsExp >= 2) return 72;
    return 48;
  }

  return clamp(60 + employee.yearsExp * 5, 60, 100);
}

function calculateUrgencyScore(task: Task, employee: Employee) {
  if (task.urgency === 'High') {
    if (employee.availability >= 50) return 100;
    if (employee.availability >= 35) return 75;
    if (employee.availability >= 20) return 45;
    return 15;
  }

  if (task.urgency === 'Medium') {
    if (employee.availability >= 35) return 90;
    if (employee.availability >= 20) return 65;
    return 45;
  }

  if (employee.availability >= 20) return 90;
  return 65;
}

function calculateGrowthScore(
  task: Task,
  employee: Employee,
  requiredResults: Array<{ spec: SkillRequirement; skill?: { rating: number }; meetsMinimum: boolean }>
) {
  const nearMisses = requiredResults.filter((result) => result.skill && !result.meetsMinimum).length;
  const matchedRequired = requiredResults.filter((result) => result.meetsMinimum).length;
  const missingRequired = requiredResults.length - matchedRequired;
  const normalizedInterests = [...(employee.interests ?? []), employee.careerGoals ?? ''].map(normalize).filter(Boolean);
  const interestMatches = [...getRequiredSkillSpecs(task), ...getOptionalSkillSpecs(task)].filter((spec) =>
    normalizedInterests.some((interest) => interest.includes(normalize(spec.name)) || normalize(spec.name).includes(interest))
  ).length;
  const readinessBonus = employee.readiness === 'Ready' && employee.availability >= 35 ? 18 : 0;
  const nearFitBonus = nearMisses ? Math.min(nearMisses * 20, 45) : 0;
  const interestBonus = Math.min(interestMatches * 12, 24);
  const coverageBonus = requiredResults.length ? (matchedRequired / requiredResults.length) * 28 : 10;
  const riskPenalty = Math.max(0, missingRequired - nearMisses - 1) * 18;

  return clamp(readinessBonus + nearFitBonus + interestBonus + coverageBonus - riskPenalty, 0, 100);
}

function orderTeamMatches(task: Task, employees: Employee[], matches: Match[]) {
  const requiredSpecs = getRequiredSkillSpecs(task);
  const selected: Match[] = [];
  const remaining = [...matches];
  const covered = new Set<string>();

  while (selected.length < task.teamSize && remaining.length) {
    let bestIndex = 0;
    let bestValue = Number.NEGATIVE_INFINITY;

    remaining.forEach((match, index) => {
      const employee = employees.find((item) => item.id === match.employeeId);
      const newCoverage = employee ? getNewRequiredCoverage(employee, requiredSpecs, covered) : [];
      const coverageValue = newCoverage.reduce((sum, item) => sum + importanceWeights[item.importance ?? 'medium'], 0);
      const value = match.score + coverageValue * 18 + newCoverage.length * 6;

      if (value > bestValue || (value === bestValue && compareMatches(match, remaining[bestIndex]) < 0)) {
        bestValue = value;
        bestIndex = index;
      }
    });

    const [nextMatch] = remaining.splice(bestIndex, 1);
    const employee = employees.find((item) => item.id === nextMatch.employeeId);
    const newCoverage = employee ? getNewRequiredCoverage(employee, requiredSpecs, covered) : [];
    selected.push(addTeamCoverageFactor(nextMatch, newCoverage, covered.size === 0));

    if (employee) {
      addCoveredRequiredSkills(employee, requiredSpecs, covered);
    }
  }

  return [...selected, ...remaining.sort(compareMatches)];
}

function getNewRequiredCoverage(employee: Employee, requiredSpecs: SkillRequirement[], covered: Set<string>) {
  const skillMap = new Map(employee.skills.map((skill) => [normalize(skill.name), skill]));
  return requiredSpecs.filter((spec) => {
    const key = normalize(spec.name);
    const skill = skillMap.get(key);
    return !covered.has(key) && skill && (!spec.minRating || skill.rating >= spec.minRating);
  });
}

function addTeamCoverageFactor(match: Match, newCoverage: SkillRequirement[], isFirstSelection: boolean): Match {
  const coverageNames = newCoverage.map((spec) => spec.name);
  const description = coverageNames.length
    ? `${isFirstSelection ? 'Starts' : 'Adds'} team coverage for ${coverageNames.join(', ')}`
    : 'Ranks by score and capacity after required-skill coverage is already represented';

  return {
    ...match,
    factors: [
      {
        label: 'Team Coverage',
        type: coverageNames.length ? 'positive' : 'warning',
        description,
      },
      ...match.factors,
    ],
  };
}

function addCoveredRequiredSkills(employee: Employee, requiredSpecs: SkillRequirement[], covered: Set<string>) {
  const skillMap = new Map(employee.skills.map((skill) => [normalize(skill.name), skill]));
  requiredSpecs.forEach((spec) => {
    const key = normalize(spec.name);
    const skill = skillMap.get(key);
    if (skill && (!spec.minRating || skill.rating >= spec.minRating)) covered.add(key);
  });
}

function compareMatches(a: Match, b: Match) {
  return b.score - a.score || a.employeeId.localeCompare(b.employeeId) || a.taskId.localeCompare(b.taskId);
}

function getEmployeeSupplyCapacity(employee: Employee) {
  if (employee.availability <= 0) return 0;

  const capacity = clamp(employee.availability / 100, 0, 1);
  if (employee.availabilityStatus === 'Busy' || employee.readiness === 'Busy') {
    return Math.min(capacity, 0.25);
  }

  return capacity;
}

function parseTeamSize(row: Record<string, string>, staffingMode?: string, estHours = 0, requiredSkillCount = 0) {
  const sourceSize = Number(
    row.team_size || row.teamSize || row.headcount || row.required_people || row.requiredPeople || row.staff_required || row.staffRequired || 0
  );

  if (Number.isFinite(sourceSize) && sourceSize > 0) return Math.round(clamp(sourceSize, 1, 12));
  if (normalize(staffingMode ?? '') !== 'team') return 1;

  const hoursBasedSize = estHours > 0 ? Math.ceil(estHours / 60) : 2;
  const skillsBasedSize = requiredSkillCount > 0 ? Math.ceil(requiredSkillCount / 2) : 2;
  return Math.round(clamp(Math.max(2, hoursBasedSize, skillsBasedSize), 2, 5));
}

function normalizeImportance(value?: string): SkillImportance | undefined {
  const normalized = value?.toLowerCase().trim();
  if (normalized === 'low' || normalized === 'medium' || normalized === 'high' || normalized === 'critical') return normalized;
}

function normalizeAvailability(value?: string, availability = 0): Employee['availabilityStatus'] {
  if (value === 'Available' || value === 'Partial' || value === 'Busy') return value;
  if (availability >= 65) return 'Available';
  if (availability >= 30) return 'Partial';
  return 'Busy';
}

function normalizeUrgency(value?: string): Task['urgency'] {
  if (value === 'High' || value === 'Medium' || value === 'Low') return value;
  return 'Medium';
}

function normalize(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}
