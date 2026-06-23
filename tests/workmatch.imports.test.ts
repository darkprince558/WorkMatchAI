import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import type { Employee, Task } from '../lib/types';
import {
  byteImportSource,
  createDocxTableFixture,
  createSelectableTextPdf,
  createXlsxFixture,
  installDomParserShim,
  textImportSource,
} from './helpers/import-fixtures';

installDomParserShim();

const require = createRequire(import.meta.url);
const { parseLocalImportSource } = require('../lib/imports/local-file-intake.ts') as typeof import('../lib/imports/local-file-intake');

describe('local import parser fixtures', () => {
  it('parses CSV employee records with skills, confidence, status, and source file', async () => {
    const result = await parseLocalImportSource(
      textImportSource(
        'employees.csv',
        [
          'employee_id,name,role,department,location,availability_status,capacity_percent,years_experience,skills,certifications,past_projects,interests,career_goals',
          'E100,Nora Fields,Solutions Architect,Engineering,Toronto,Available,90,9,"React:8|Azure:9|AI:7","Azure Architect|PMP","Cloud Portal","AI platforms","Lead architecture programs"',
        ].join('\n'),
        'text/csv'
      ),
      { target: 'employee' }
    );
    const record = result.records[0];
    const employee = record.entity as Employee;

    assert.equal(result.format, 'csv');
    assert.equal(result.status, 'parsed');
    assert.equal(result.target, 'employee');
    assert.deepEqual(result.warnings, []);
    assert.equal(record.sourceFile, 'employees.csv');
    assert.equal(record.type, 'employee');
    assert.equal(record.reviewStatus, 'Needs Review');
    assert.equal(record.confidence, 98);
    assert.equal(employee.id, 'E100');
    assert.equal(employee.name, 'Nora Fields');
    assert.equal(employee.availability, 90);
    assert.deepEqual(employee.skills, [
      { name: 'React', rating: 8 },
      { name: 'Azure', rating: 9 },
      { name: 'AI', rating: 7 },
    ]);
  });

  it('parses CSV task records with skill requirements and staffing metadata', async () => {
    const result = await parseLocalImportSource(
      textImportSource(
        'tasks.csv',
        [
          'task_id,name,type,description,required_skills,optional_skills,urgency,deadline,estimated_hours,team_size,location,remote_status,seniority_required,staffing_mode,status',
          'T100,AI Migration Sprint,Client Project,"Build an assisted intake flow.","React:8:critical|AI:7:high|Azure:6:medium","Terraform:5",High,2026-07-15,120,2,Toronto,Hybrid,Senior,Team,Ready to Staff',
        ].join('\n'),
        'text/csv'
      ),
      { target: 'task' }
    );
    const record = result.records[0];
    const task = record.entity as Task;

    assert.equal(result.format, 'csv');
    assert.equal(result.status, 'parsed');
    assert.equal(record.sourceFile, 'tasks.csv');
    assert.equal(record.type, 'task');
    assert.equal(record.reviewStatus, 'Needs Review');
    assert.equal(record.confidence, 97);
    assert.equal(task.id, 'T100');
    assert.equal(task.urgency, 'High');
    assert.equal(task.teamSize, 2);
    assert.equal(task.status, 'Ready to Staff');
    assert.deepEqual(task.requiredSkills, ['React', 'AI', 'Azure']);
    assert.deepEqual(task.requiredSkillSpecs, [
      { name: 'React', minRating: 8, importance: 'critical' },
      { name: 'AI', minRating: 7, importance: 'high' },
      { name: 'Azure', minRating: 6, importance: 'medium' },
    ]);
    assert.deepEqual(task.optionalSkillSpecs, [{ name: 'Terraform', minRating: 5 }]);
  });

  it('parses a minimal XLSX workbook through shared strings and worksheet rows', async () => {
    const result = await parseLocalImportSource(
      byteImportSource(
        'employee-workbook.xlsx',
        createXlsxFixture(
          [
            ['employee_id', 'name', 'role', 'department', 'location', 'availability_status', 'capacity_percent', 'years_experience', 'skills'],
            ['E200', 'Iris Wong', 'Data Lead', 'Analytics', 'Remote', 'Available', '80', '6', 'SQL:9|Python:8|Power BI:7'],
          ],
          'Employees'
        ),
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      ),
      { target: 'employee' }
    );
    const record = result.records[0];
    const employee = record.entity as Employee;

    assert.equal(result.format, 'excel');
    assert.equal(result.status, 'parsed');
    assert.deepEqual(result.warnings, []);
    assert.equal(record.sourceFile, 'employee-workbook.xlsx:Employees');
    assert.equal(record.type, 'employee');
    assert.equal(employee.id, 'E200');
    assert.equal(employee.name, 'Iris Wong');
    assert.deepEqual(employee.skills.map((skill) => skill.name), ['SQL', 'Python', 'Power BI']);
  });

  it('parses a minimal DOCX table into task review records', async () => {
    const result = await parseLocalImportSource(
      byteImportSource(
        'task-table.docx',
        createDocxTableFixture([
          ['task_id', 'name', 'required_skills', 'deadline', 'estimated_hours', 'team_size', 'urgency', 'status'],
          ['T200', 'Governance Review', 'Compliance:7:high|Risk Assessment:6:medium|Training:5:low', '2026-08-01', '60', '1', 'Medium', 'Needs Review'],
        ]),
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      ),
      { target: 'task' }
    );
    const record = result.records[0];
    const task = record.entity as Task;

    assert.equal(result.format, 'word');
    assert.equal(result.status, 'parsed');
    assert.deepEqual(result.warnings, []);
    assert.equal(record.sourceFile, 'task-table.docx:Table 1');
    assert.equal(record.type, 'task');
    assert.equal(task.id, 'T200');
    assert.equal(task.estHours, 60);
    assert.deepEqual(task.requiredSkills, ['Compliance', 'Risk Assessment', 'Training']);
  });

  it('parses selectable pipe-delimited PDF text into employee records', async () => {
    const result = await parseLocalImportSource(
      byteImportSource(
        'employee-table.pdf',
        createSelectableTextPdf([
          'employee_id|name|role|department|location|availability_status|capacity_percent|years_experience|skills',
          'E300|Leo Grant|Platform Engineer|Engineering|Remote|Partial|55|5|Kubernetes:8',
        ]),
        'application/pdf'
      ),
      { target: 'employee' }
    );
    const record = result.records[0];
    const employee = record.entity as Employee;

    assert.equal(result.format, 'pdf');
    assert.equal(result.status, 'parsed');
    assert.deepEqual(result.warnings, []);
    assert.equal(record.sourceFile, 'employee-table.pdf');
    assert.equal(record.type, 'employee');
    assert.equal(employee.id, 'E300');
    assert.equal(employee.availability, 55);
    assert.deepEqual(employee.skills, [{ name: 'Kubernetes', rating: 8 }]);
  });

  it('returns PDF fallback when no selectable table text is extracted', async () => {
    const result = await parseLocalImportSource(byteImportSource('empty.pdf', createSelectableTextPdf([]), 'application/pdf'), {
      target: 'employee',
    });

    assert.equal(result.format, 'pdf');
    assert.equal(result.status, 'fallback');
    assert.deepEqual(result.records, []);
    assert.deepEqual(result.warnings, ['No selectable PDF text was extracted. Scanned PDFs need OCR before WorkMatch can import them.']);
  });

  it('returns configured fallbacks for legacy Excel and Word formats', async () => {
    const legacyExcel = await parseLocalImportSource(byteImportSource('legacy.xls', new Uint8Array(), 'application/vnd.ms-excel'), {
      target: 'employee',
    });
    const legacyWord = await parseLocalImportSource(byteImportSource('legacy.doc', new Uint8Array(), 'application/msword'), {
      target: 'task',
    });

    assert.equal(legacyExcel.status, 'fallback');
    assert.equal(legacyExcel.format, 'excel');
    assert.equal(legacyExcel.dependencyNotes[0].packageName, 'legacy .xls parser');
    assert.match(legacyExcel.warnings[0], /Binary \.xls files/);
    assert.equal(legacyExcel.records[0].type, 'employee');

    assert.equal(legacyWord.status, 'fallback');
    assert.equal(legacyWord.format, 'word');
    assert.equal(legacyWord.dependencyNotes[0].packageName, 'legacy .doc parser');
    assert.match(legacyWord.warnings[0], /Binary \.doc files/);
    assert.equal(legacyWord.records[0].type, 'task');
  });

  it('returns unsupported results for unknown formats and oversized sources before parser dispatch', async () => {
    const unsupported = await parseLocalImportSource(textImportSource('notes.txt', 'plain text'), { target: 'employee' });
    const oversized = await parseLocalImportSource(
      {
        name: 'huge.csv',
        mimeType: 'text/csv',
        size: 25 * 1024 * 1024 + 1,
        content: 'employee_id,name\nE400,Oversized',
      },
      { target: 'employee' }
    );

    assert.equal(unsupported.status, 'unsupported');
    assert.equal(unsupported.format, 'unsupported');
    assert.match(unsupported.warnings[0], /No supported local parser/);
    assert.equal(unsupported.records[0].reviewStatus, 'Needs Correction');

    assert.equal(oversized.status, 'unsupported');
    assert.equal(oversized.format, 'unsupported');
    assert.match(oversized.warnings[0], /size limit/);
    assert.equal(oversized.records[0].sourceFile, 'huge.csv');
  });
});
