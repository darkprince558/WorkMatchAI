import type {
  Employee,
  ImportReviewRecord,
  ResumeProfileChange,
  ResumeProfileUpdateReview,
  ResumeUpskillingRecommendation,
  Skill,
  Task,
} from './types';
import type { DocumentExtractionAssistanceOutput, ExtractedSkillValue, ProposedEmployeeRecord } from './agents/contracts';
import { getImportIssues } from './workmatch';
import { detectLocalImportFormat } from './imports/detect';
import { readSourceBytes, readSourceText } from './imports/readers';
import type { LocalImportSource } from './imports/types';
import { extractPdfText } from './imports/pdf';
import { extractWordText } from './imports/word';

type ResumeChangeValue = string | number | string[] | Skill;

type ResumeChangeInput = {
  kind: ResumeProfileChange['kind'];
  field: ResumeProfileChange['field'];
  label: string;
  currentValue: string;
  proposedValue: string;
  rawValue: ResumeChangeValue;
  confidence: number;
  source: ResumeProfileChange['source'];
  reason: string;
  autoConfirmed?: boolean;
  requiresReview?: boolean;
};

export type ResumeExtractionResult = ResumeProfileUpdateReview & {
  extractedText: string;
  proposedEmployee: Employee;
};

const commonSkillNames = [
  'Accessibility',
  'Agile Delivery',
  'AI Governance',
  'API Design',
  'Azure',
  'Azure DevOps',
  'Budgeting',
  'Change Management',
  'CI/CD',
  'Cloud Security',
  'Compliance',
  'Data Modeling',
  'Design Systems',
  'Documentation',
  'Excel',
  'Figma',
  'Java',
  'Kubernetes',
  'Mainframe COBOL',
  'Model Risk',
  'Monitoring',
  'Node.js',
  'Power BI',
  'Process Mapping',
  'Python',
  'React',
  'Requirements Gathering',
  'Risk Assessment',
  'Risk Management',
  'Service Design',
  'Spring Boot',
  'SQL',
  'Stakeholder Communication',
  'Stakeholder Management',
  'Terraform',
  'Training',
  'UX Research',
];

const certificationPatterns = [
  /\bAzure Developer Associate\b/i,
  /\bAzure Security Engineer\b/i,
  /\bAzure Administrator\b/i,
  /\bAWS Cloud Practitioner\b/i,
  /\bSecurity\+\b/i,
  /\bCKA\b/i,
  /\bPMP\b/i,
  /\bCSM\b/i,
  /\bCBAP\b/i,
  /\bPL-300\b(?:\s+Power BI Data Analyst)?/i,
  /\bGoogle UX Design Certificate\b/i,
  /\bOracle Java Associate\b/i,
  /\bProsci Change Practitioner\b/i,
];

export async function extractResumeText(source: LocalImportSource) {
  const format = detectLocalImportFormat(source);

  if (format === 'pdf') {
    return {
      text: await extractPdfText(await readSourceBytes(source)),
      warnings: [] as string[],
      format,
    };
  }

  if (format === 'word') {
    return {
      text: await extractWordText(source),
      warnings: [] as string[],
      format,
    };
  }

  if (format === 'csv' || format === 'unsupported') {
    return {
      text: await readSourceText(source),
      warnings: format === 'unsupported' ? ['Unsupported extension; attempted plain text extraction.'] : [],
      format,
    };
  }

  return {
    text: await readSourceText(source),
    warnings: ['Spreadsheet resumes are treated as plain text for profile extraction.'],
    format,
  };
}

export function buildResumeExtractionResult(input: {
  employee: Employee;
  fileName: string;
  text: string;
  tasks: Task[];
  extractionNotes?: string[];
  source?: ResumeProfileChange['source'];
}): ResumeExtractionResult {
  const source = input.source ?? 'resume_text';
  const changes = mergeResumeProfileChanges([
    ...buildFieldChanges(input.employee, input.text, source),
    ...buildCertificationChanges(input.employee, input.text, source),
    ...buildSkillChanges(input.employee, input.text, input.tasks, source),
    ...buildListChanges(input.employee, input.text, source),
  ]);
  const upskillingRecommendations = buildUpskillingRecommendations(
    applyResumeProfileChanges(input.employee, changes, changes.map((change) => change.id)),
    input.tasks
  );
  const proposedEmployee = applyResumeProfileChanges(input.employee, changes, changes.map((change) => change.id));

  return {
    sourceFile: input.fileName,
    targetEmployeeId: input.employee.id,
    targetEmployeeName: input.employee.name,
    matchConfidence: 100,
    matchReason: 'Employee uploaded this resume to update their own profile.',
    changes,
    upskillingRecommendations,
    extractionNotes: input.extractionNotes ?? [],
    extractedText: input.text,
    proposedEmployee: {
      ...proposedEmployee,
      resume: {
        fileName: input.fileName,
        updatedAt: new Date().toISOString(),
        note: proposedEmployee.resume?.note,
      },
    },
  };
}

export function buildManagerResumeImportRecord(input: {
  fileName: string;
  text: string;
  existingEmployees: Employee[];
  tasks: Task[];
}): ImportReviewRecord {
  const match = matchExistingEmployee(input.text, input.fileName, input.existingEmployees);
  const employee = match.employee ?? buildPlaceholderEmployee(input.fileName, input.text);
  const extraction = buildResumeExtractionResult({
    employee,
    fileName: input.fileName,
    text: input.text,
    tasks: input.tasks,
    extractionNotes: match.employee
      ? ['Resume was matched to an existing employee profile before review.']
      : ['No existing employee match was found. A manager must choose an existing Employee ID before confirming.'],
  });
  const entity = match.employee ? extraction.proposedEmployee : employee;
  const issues = getImportIssues(entity, 'employee');

  if (match.employee) {
    issues.push(`Existing employee ID "${match.employee.id}" will be updated on commit`);
  } else {
    issues.push('No existing employee match found. Choose an existing employee ID before confirming.');
  }

  return {
    id: `${input.fileName}-resume-profile-update-${entity.id}`,
    type: 'employee',
    reviewStatus: match.employee ? 'Needs Review' : 'Needs Correction',
    confidence: match.confidence,
    entity,
    issues,
    sourceFile: input.fileName,
    profileUpdate: {
      ...extraction,
      targetEmployeeId: entity.id,
      targetEmployeeName: entity.name,
      matchConfidence: match.confidence,
      matchReason: match.reason,
    },
  };
}

export function buildResumeChangesFromDocumentExtraction(input: {
  output: DocumentExtractionAssistanceOutput;
  employee: Employee;
  fileName: string;
}): ResumeProfileChange[] {
  const proposedEmployee = input.output.proposedEmployees[0];
  if (!proposedEmployee) return [];

  const fields = proposedEmployee.fields;
  const changes: ResumeChangeInput[] = [];
  addFieldProposal(changes, input.employee, proposedEmployee, 'role', fields.role?.value, fields.role?.confidence, 'ai');
  addFieldProposal(changes, input.employee, proposedEmployee, 'department', fields.department?.value, fields.department?.confidence, 'ai');
  addFieldProposal(changes, input.employee, proposedEmployee, 'location', fields.location?.value, fields.location?.confidence, 'ai');
  addFieldProposal(changes, input.employee, proposedEmployee, 'timezone', fields.timezone?.value, fields.timezone?.confidence, 'ai');
  addFieldProposal(changes, input.employee, proposedEmployee, 'careerGoals', fields.careerGoals?.value, fields.careerGoals?.confidence, 'ai');
  addFieldProposal(changes, input.employee, proposedEmployee, 'yearsExp', fields.yearsExperience?.value, fields.yearsExperience?.confidence, 'ai');

  if (typeof fields.capacityPercentage?.value === 'number' && fields.capacityPercentage.confidence >= 0.8) {
    addFieldProposal(
      changes,
      input.employee,
      proposedEmployee,
      'availability',
      Math.round(fields.capacityPercentage.value),
      fields.capacityPercentage.confidence,
      'ai'
    );
  }

  fields.certifications?.value.forEach((certification) => {
    if (hasListValue(input.employee.certifications, certification)) return;
    changes.push({
      kind: 'certification',
      field: 'certifications',
      label: 'Certification',
      currentValue: 'Not listed',
      proposedValue: certification,
      rawValue: certification,
      confidence: Math.round(fields.certifications?.confidence ? fields.certifications.confidence * 100 : 82),
      source: 'ai',
      reason: 'AI extraction found this certification in the uploaded resume.',
      autoConfirmed: (fields.certifications?.confidence ?? 0) >= 0.9,
      requiresReview: (fields.certifications?.confidence ?? 0) < 0.9,
    });
  });

  fields.interests?.value.forEach((interest) => {
    if (hasListValue(input.employee.interests, interest)) return;
    changes.push({
      kind: 'list-add',
      field: 'interests',
      label: 'Interest',
      currentValue: 'Not listed',
      proposedValue: interest,
      rawValue: interest,
      confidence: Math.round(fields.interests?.confidence ? fields.interests.confidence * 100 : 76),
      source: 'ai',
      reason: 'AI extraction found this interest in the uploaded resume.',
      requiresReview: true,
    });
  });

  fields.pastProjects?.value.forEach((project) => {
    if (hasListValue(input.employee.pastProjects, project)) return;
    changes.push({
      kind: 'list-add',
      field: 'pastProjects',
      label: 'Past Project',
      currentValue: 'Not listed',
      proposedValue: project,
      rawValue: project,
      confidence: Math.round(fields.pastProjects?.confidence ? fields.pastProjects.confidence * 100 : 76),
      source: 'ai',
      reason: 'AI extraction found this past project in the uploaded resume.',
      requiresReview: true,
    });
  });

  fields.skills?.value.forEach((skill) => {
    addAiSkillProposal(changes, input.employee, skill, fields.skills?.confidence ?? 0.75);
  });

  return mergeResumeProfileChanges(changes.map(toResumeChange));
}

export function mergeResumeExtractionResult(
  base: ResumeExtractionResult,
  aiOutput: DocumentExtractionAssistanceOutput | undefined
): ResumeExtractionResult {
  if (!aiOutput) return base;

  const aiChanges = buildResumeChangesFromDocumentExtraction({
    output: aiOutput,
    employee: base.proposedEmployee,
    fileName: base.sourceFile,
  });
  const changes = mergeResumeProfileChanges([...base.changes, ...aiChanges]);
  const proposedEmployee = applyResumeProfileChanges(base.proposedEmployee, changes, changes.map((change) => change.id));

  return {
    ...base,
    changes,
    proposedEmployee,
    extractionNotes: [...base.extractionNotes, ...aiOutput.extractionNotes],
  };
}

export function mergeResumeImportRecordWithDocumentExtraction(record: ImportReviewRecord, output: DocumentExtractionAssistanceOutput) {
  if (!record.profileUpdate || record.type !== 'employee') return record;

  const employee = record.entity as Employee;
  const aiChanges = buildResumeChangesFromDocumentExtraction({
    output,
    employee,
    fileName: record.sourceFile,
  });
  if (!aiChanges.length && !output.extractionNotes.length) return record;

  const changes = mergeResumeProfileChanges([...record.profileUpdate.changes, ...aiChanges]);
  const nextEmployee = applyResumeProfileChanges(employee, changes, changes.map((change) => change.id));

  return {
    ...record,
    entity: nextEmployee,
    profileUpdate: {
      ...record.profileUpdate,
      changes,
      extractionNotes: [...record.profileUpdate.extractionNotes, ...output.extractionNotes],
    },
  };
}

export function applyResumeProfileChanges(employee: Employee, changes: ResumeProfileChange[], selectedChangeIds: string[]) {
  const selected = new Set(selectedChangeIds);
  const next: Employee = {
    ...employee,
    skills: [...employee.skills],
    interests: [...(employee.interests ?? [])],
    certifications: [...(employee.certifications ?? [])],
    pastProjects: [...(employee.pastProjects ?? [])],
  };

  changes.forEach((change) => {
    if (!selected.has(change.id)) return;

    if (change.kind === 'skill-add' || change.kind === 'skill-upgrade') {
      const skillName = change.field.replace(/^skill:/, '');
      const rating = readRating(change.proposedValue);
      const existingIndex = next.skills.findIndex((skill) => normalizeKey(skill.name) === normalizeKey(skillName));

      if (existingIndex >= 0) {
        next.skills[existingIndex] = {
          ...next.skills[existingIndex],
          rating: Math.max(next.skills[existingIndex].rating, rating),
        };
      } else {
        next.skills.push({ name: skillName, rating });
      }
      return;
    }

    if (change.kind === 'certification') {
      next.certifications = addUnique(next.certifications, change.proposedValue);
      return;
    }

    if (change.kind === 'list-add') {
      if (change.field === 'interests') next.interests = addUnique(next.interests, change.proposedValue);
      if (change.field === 'pastProjects') next.pastProjects = addUnique(next.pastProjects, change.proposedValue);
      return;
    }

    if (change.field === 'role') next.role = change.proposedValue;
    if (change.field === 'department') next.department = change.proposedValue;
    if (change.field === 'location') next.location = change.proposedValue;
    if (change.field === 'timezone') next.timezone = change.proposedValue;
    if (change.field === 'careerGoals') next.careerGoals = change.proposedValue;
    if (change.field === 'availability') {
      next.availability = clamp(Number(change.proposedValue) || next.availability, 0, 100);
      next.availabilityStatus = next.availability >= 65 ? 'Available' : next.availability >= 30 ? 'Partial' : 'Busy';
    }
    if (change.field === 'yearsExp') next.yearsExp = Math.max(next.yearsExp, Number(change.proposedValue) || next.yearsExp);
  });

  return next;
}

export function defaultSelectedResumeChangeIds(changes: ResumeProfileChange[]) {
  return changes
    .filter((change) => change.autoConfirmed || change.confidence >= 70)
    .map((change) => change.id);
}

function buildFieldChanges(employee: Employee, text: string, source: ResumeProfileChange['source']) {
  const changes: ResumeChangeInput[] = [];
  const role = inferRole(text);
  const years = inferYearsExperience(text);

  if (role && normalizeKey(role) !== normalizeKey(employee.role)) {
    changes.push({
      kind: 'field',
      field: 'role',
      label: 'Role',
      currentValue: employee.role,
      proposedValue: role,
      rawValue: role,
      confidence: 76,
      source,
      reason: 'Resume headline or summary appears to describe this role.',
      requiresReview: true,
    });
  }

  if (years && years > employee.yearsExp) {
    changes.push({
      kind: 'field',
      field: 'yearsExp',
      label: 'Years Experience',
      currentValue: `${employee.yearsExp}`,
      proposedValue: `${years}`,
      rawValue: years,
      confidence: 82,
      source,
      reason: 'Resume text mentions a higher years-of-experience figure.',
      requiresReview: true,
    });
  }

  return changes.map(toResumeChange);
}

function buildCertificationChanges(employee: Employee, text: string, source: ResumeProfileChange['source']) {
  return extractCertifications(text)
    .filter((certification) => !hasListValue(employee.certifications, certification))
    .map((certification) =>
      toResumeChange({
        kind: 'certification',
        field: 'certifications',
        label: 'Certification',
        currentValue: 'Not listed',
        proposedValue: certification,
        rawValue: certification,
        confidence: 92,
        source,
        reason: 'Certification was explicitly detected in the resume text.',
        autoConfirmed: true,
        requiresReview: false,
      })
    );
}

function buildSkillChanges(employee: Employee, text: string, tasks: Task[], source: ResumeProfileChange['source']) {
  const skillNames = getKnownSkillNames(employee, tasks);
  const currentSkills = new Map(employee.skills.map((skill) => [normalizeKey(skill.name), skill]));
  const changes: ResumeChangeInput[] = [];

  skillNames.forEach((skillName) => {
    if (!skillAppearsInText(skillName, text)) return;

    const current = currentSkills.get(normalizeKey(skillName));
    const inferredRating = inferSkillRating(text, skillName, current?.rating);
    if (!current) {
      changes.push({
        kind: 'skill-add',
        field: `skill:${skillName}`,
        label: `New skill: ${skillName}`,
        currentValue: 'Not listed',
        proposedValue: `${inferredRating}/10`,
        rawValue: { name: skillName, rating: inferredRating },
        confidence: 78,
        source,
        reason: 'Skill appeared in resume text and matches current WorkMatch project skill taxonomy.',
        requiresReview: true,
      });
      return;
    }

    if (inferredRating > current.rating) {
      changes.push({
        kind: 'skill-upgrade',
        field: `skill:${current.name}`,
        label: `Skill level: ${current.name}`,
        currentValue: `${current.rating}/10`,
        proposedValue: `${inferredRating}/10`,
        rawValue: { name: current.name, rating: inferredRating },
        confidence: inferredRating - current.rating > 1 ? 74 : 82,
        source,
        reason: 'Resume evidence suggests a stronger current level than the saved profile rating.',
        requiresReview: true,
      });
    }
  });

  return changes.map(toResumeChange);
}

function buildListChanges(employee: Employee, text: string, source: ResumeProfileChange['source']) {
  const projects = extractProjectNames(text).filter((project) => !hasListValue(employee.pastProjects, project));
  return projects.slice(0, 4).map((project) =>
    toResumeChange({
      kind: 'list-add',
      field: 'pastProjects',
      label: 'Past Project',
      currentValue: 'Not listed',
      proposedValue: project,
      rawValue: project,
      confidence: 68,
      source,
      reason: 'Resume experience section appears to reference this project or initiative.',
      requiresReview: true,
    })
  );
}

function buildUpskillingRecommendations(employee: Employee, tasks: Task[]): ResumeUpskillingRecommendation[] {
  const skillRatings = new Map(employee.skills.map((skill) => [normalizeKey(skill.name), skill.rating]));
  const demand = new Map<string, { count: number; taskIds: string[]; urgent: number }>();

  tasks
    .filter((task) => task.status !== 'In Progress')
    .forEach((task) => {
      task.requiredSkills.forEach((skillName) => {
        const key = normalizeKey(skillName);
        const entry = demand.get(key) ?? { count: 0, taskIds: [], urgent: 0 };
        entry.count += task.teamSize;
        entry.taskIds.push(task.id);
        if (task.urgency === 'High' || task.status === 'At Risk') entry.urgent += 1;
        demand.set(key, entry);
      });
    });

  return Array.from(demand.entries())
    .filter(([key]) => (skillRatings.get(key) ?? 0) < 7)
    .sort(([, first], [, second]) => second.urgent - first.urgent || second.count - first.count)
    .slice(0, 4)
    .map(([key, value]) => {
      const skillName = titleSkillName(key, tasks);
      return {
        skillName,
        reason: `${skillName} appears in ${value.taskIds.length} open project${value.taskIds.length === 1 ? '' : 's'} and your profile is missing it or below 7/10.`,
        relatedTaskIds: Array.from(new Set(value.taskIds)).slice(0, 3),
        priority: value.urgent > 0 ? 'high' : value.count > 1 ? 'medium' : 'low',
      };
    });
}

function matchExistingEmployee(text: string, fileName: string, employees: Employee[]) {
  const haystack = normalizeKey(`${fileName} ${text}`);
  const matched = employees
    .map((employee) => {
      const nameKey = normalizeKey(employee.name);
      const idKey = normalizeKey(employee.id);
      const nameMatch = nameKey && haystack.includes(nameKey);
      const idMatch = idKey && haystack.includes(idKey);
      return {
        employee,
        confidence: idMatch ? 98 : nameMatch ? 92 : 0,
        reason: idMatch
          ? `Matched existing employee by ID ${employee.id}.`
          : nameMatch
            ? `Matched existing employee by name ${employee.name}.`
            : '',
      };
    })
    .sort((first, second) => second.confidence - first.confidence)[0];

  if (matched?.confidence) return matched;
  return {
    employee: undefined,
    confidence: 45,
    reason: 'No existing employee ID or name was detected in the resume or file name.',
  };
}

function buildPlaceholderEmployee(fileName: string, text: string): Employee {
  const name = inferName(text) || fileName.replace(/\.[^.]+$/, '').replace(/[_-]+/g, ' ');
  return {
    id: `REVIEW-${normalizeKey(name).replace(/\s+/g, '-').toUpperCase() || 'EMPLOYEE'}`,
    name,
    role: inferRole(text) ?? 'Unassigned',
    department: 'Unassigned',
    location: 'Unassigned',
    availability: 0,
    availabilityStatus: 'Busy',
    skills: [],
    yearsExp: inferYearsExperience(text) ?? 0,
    readiness: 'In Training',
    avatar: `https://picsum.photos/seed/${encodeURIComponent(name)}/200/200`,
    certifications: extractCertifications(text),
    pastProjects: extractProjectNames(text),
    interests: [],
  };
}

function addFieldProposal(
  changes: ResumeChangeInput[],
  employee: Employee,
  proposal: ProposedEmployeeRecord,
  field: keyof Employee,
  value: string | number | undefined,
  confidence = 0.7,
  source: ResumeProfileChange['source']
) {
  if (value === undefined || value === null || String(value).trim() === '') return;
  const currentValue = employee[field];
  const currentDisplay = Array.isArray(currentValue) ? currentValue.join(', ') : String(currentValue ?? '');
  const proposedValue = String(value).trim();
  if (normalizeKey(currentDisplay) === normalizeKey(proposedValue)) return;

  changes.push({
    kind: 'field',
    field,
    label: labelForField(field),
    currentValue: currentDisplay || 'Empty',
    proposedValue,
    rawValue: value,
    confidence: Math.round(confidence * 100),
    source,
    reason: `AI extraction proposed this ${labelForField(field).toLowerCase()} from resume evidence in ${proposal.temporaryRecordId}.`,
    requiresReview: confidence < 0.9,
  });
}

function addAiSkillProposal(changes: ResumeChangeInput[], employee: Employee, skill: ExtractedSkillValue, confidence: number) {
  const skillName = skill.normalizedName ?? skill.rawName;
  const current = employee.skills.find((item) => normalizeKey(item.name) === normalizeKey(skillName));
  const proposedRating = clamp(Math.round(skill.level ?? inferSkillRating('', skillName, current?.rating)), 1, 10);
  if (current && proposedRating <= current.rating) return;

  changes.push({
    kind: current ? 'skill-upgrade' : 'skill-add',
    field: `skill:${current?.name ?? skillName}`,
    label: current ? `Skill level: ${current.name}` : `New skill: ${skillName}`,
    currentValue: current ? `${current.rating}/10` : 'Not listed',
    proposedValue: `${proposedRating}/10`,
    rawValue: { name: current?.name ?? skillName, rating: proposedRating },
    confidence: Math.round(confidence * 100),
    source: 'ai',
    reason: skill.levelWasExplicit ? 'AI found an explicit skill level in the resume.' : 'AI inferred this skill level from resume context.',
    requiresReview: true,
  });
}

function toResumeChange(input: ResumeChangeInput): ResumeProfileChange {
  return {
    id: `${input.kind}:${input.field}:${normalizeKey(input.proposedValue)}`,
    kind: input.kind,
    field: input.field,
    label: input.label,
    currentValue: input.currentValue,
    proposedValue: input.proposedValue,
    confidence: clamp(Math.round(input.confidence), 0, 100),
    source: input.source,
    reason: input.reason,
    autoConfirmed: input.autoConfirmed,
    requiresReview: input.requiresReview ?? !input.autoConfirmed,
  };
}

function mergeResumeProfileChanges(changes: ResumeProfileChange[]) {
  const map = new Map<string, ResumeProfileChange>();
  changes.forEach((change) => {
    const existing = map.get(change.id);
    if (!existing) {
      map.set(change.id, change);
      return;
    }

    map.set(change.id, {
      ...existing,
      confidence: Math.max(existing.confidence, change.confidence),
      source: existing.source === change.source ? existing.source : 'ai_resume_text',
      reason: [existing.reason, change.reason].filter(Boolean).join(' '),
      autoConfirmed: existing.autoConfirmed || change.autoConfirmed,
      requiresReview: existing.requiresReview || change.requiresReview,
    });
  });

  return Array.from(map.values()).sort((first, second) => Number(second.autoConfirmed) - Number(first.autoConfirmed) || second.confidence - first.confidence);
}

function getKnownSkillNames(employee: Employee, tasks: Task[]) {
  return Array.from(
    new Set(
      [
        ...commonSkillNames,
        ...employee.skills.map((skill) => skill.name),
        ...tasks.flatMap((task) => [...task.requiredSkills, ...task.optionalSkills]),
      ].filter((skill) => skill.trim().length > 2)
    )
  ).sort((first, second) => second.length - first.length);
}

function skillAppearsInText(skillName: string, text: string) {
  const escaped = skillName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`(^|[^a-z0-9+#.])${escaped}([^a-z0-9+#.]|$)`, 'i').test(text);
}

function inferSkillRating(text: string, skillName: string, currentRating = 0) {
  const context = contextForSkill(text, skillName);
  let rating = currentRating ? currentRating + 1 : 5;
  if (/architect|expert|principal|lead|advanced|owned|designed|strategy/i.test(context)) rating = Math.max(rating, 8);
  if (/senior|implemented|built|delivered|certified|migration|modernization/i.test(context)) rating = Math.max(rating, 7);
  if (/supported|contributed|assisted|trained/i.test(context)) rating = Math.max(rating, 6);
  return clamp(rating, 1, 10);
}

function contextForSkill(text: string, skillName: string) {
  return text
    .split(/\r?\n|[.;]/)
    .filter((line) => line.toLowerCase().includes(skillName.toLowerCase()))
    .slice(0, 4)
    .join(' ');
}

function extractCertifications(text: string) {
  const found = new Set<string>();
  certificationPatterns.forEach((pattern) => {
    const match = text.match(pattern);
    if (match?.[0]) found.add(normalizeCertification(match[0]));
  });

  text
    .split(/\r?\n/)
    .filter((line) => /certification|certified|certificate/i.test(line))
    .flatMap((line) => line.split(/[,;|]/))
    .map((item) => item.replace(/certifications?|certified|certificate/gi, '').trim())
    .filter((item) => item.length >= 3 && item.length <= 70)
    .forEach((item) => found.add(normalizeCertification(item)));

  return Array.from(found);
}

function extractProjectNames(text: string) {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.replace(/^[\-*•]\s*/, '').trim())
    .filter((line) => line.length >= 6 && line.length <= 85);
  const projectLines = lines.filter((line) => /project|program|portal|dashboard|migration|implementation|modernization|rollout|redesign/i.test(line));

  return Array.from(new Set(projectLines.map((line) => line.replace(/^(project|program)\s*[:\-]\s*/i, '').trim()))).slice(0, 6);
}

function inferRole(text: string) {
  const roles = [
    'Senior Full Stack Developer',
    'Full Stack Developer',
    'Cloud Security Analyst',
    'Data Analyst',
    'Project Manager',
    'UX Designer',
    'DevOps Engineer',
    'Business Analyst',
    'Backend Developer',
    'Change Management Lead',
    'Legacy Systems Specialist',
    'Solution Architect',
    'Technical Lead',
  ];
  return roles.find((role) => new RegExp(role.replace(/\s+/g, '\\s+'), 'i').test(text));
}

function inferYearsExperience(text: string) {
  const match = text.match(/\b(\d{1,2})\+?\s*(?:years|yrs)\b/i);
  if (!match) return undefined;
  return clamp(Number(match[1]), 0, 50);
}

function inferName(text: string) {
  const firstLine = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /^[A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,3}$/.test(line));
  return firstLine;
}

function titleSkillName(normalizedKey: string, tasks: Task[]) {
  const taskSkill = tasks
    .flatMap((task) => [...task.requiredSkills, ...task.optionalSkills])
    .find((skill) => normalizeKey(skill) === normalizedKey);
  return taskSkill ?? normalizedKey.replace(/\b\w/g, (char) => char.toUpperCase());
}

function readRating(value: string) {
  return clamp(Number(value.match(/\d+/)?.[0] ?? 5), 1, 10);
}

function labelForField(field: keyof Employee) {
  const labels: Partial<Record<keyof Employee, string>> = {
    availability: 'Availability',
    careerGoals: 'Career Goals',
    department: 'Department',
    location: 'Location',
    role: 'Role',
    timezone: 'Timezone',
    yearsExp: 'Years Experience',
  };
  return labels[field] ?? String(field);
}

function hasListValue(values: string[] | undefined, value: string) {
  return (values ?? []).some((item) => normalizeKey(item) === normalizeKey(value));
}

function addUnique(values: string[] | undefined, value: string) {
  if (hasListValue(values, value)) return values ?? [];
  return [...(values ?? []), value];
}

function normalizeCertification(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

function normalizeKey(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}
