import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { describe, it } from 'node:test';
import type { Employee, Task } from '../lib/types';

const require = createRequire(import.meta.url);
const { googleSheetsContentToImportReviewRecords } = require('../lib/imports/google-sheets.ts') as typeof import('../lib/imports/google-sheets');
const { POST } = require('../app/api/google-workspace/intake/route.ts') as typeof import('../app/api/google-workspace/intake/route');

describe('Google Sheets intake adapter', () => {
  it('normalizes posted employee sheet headers into ImportReviewRecord entries', () => {
    const result = googleSheetsContentToImportReviewRecords(
      {
        sourceName: 'People Sheet',
        sheetName: 'Employees',
        range: 'A1:I2',
        values: [
          ['Employee ID', 'Name', 'Role', 'Department', 'Location', 'Capacity %', 'Years Exp', 'Skills', 'Notes'],
          ['E500', 'Maya Rao', 'AI Consultant', 'Delivery', 'Toronto', 85, 7, 'React:8|AI:9|SQL:7', 'ready'],
        ],
      },
      { target: 'employee' }
    );
    const record = result.reviewRecords[0];
    const employee = record.entity as Employee;

    assert.equal(result.status, 'parsed');
    assert.equal(result.sourceFile, 'People Sheet');
    assert.equal(record.sourceFile, 'People Sheet:Employees!A1:I2');
    assert.equal(record.type, 'employee');
    assert.equal(record.reviewStatus, 'Needs Review');
    assert.equal(employee.id, 'E500');
    assert.equal(employee.availability, 85);
    assert.equal(employee.yearsExp, 7);
    assert.deepEqual(employee.skills, [
      { name: 'React', rating: 8 },
      { name: 'AI', rating: 9 },
      { name: 'SQL', rating: 7 },
    ]);
    assert.deepEqual(
      result.preview[0].headerMappings
        .filter((mapping) => mapping.status === 'mapped')
        .map((mapping) => mapping.mappedHeader),
      ['employee_id', 'name', 'role', 'department', 'location', 'capacity_percent', 'years_experience', 'skills']
    );
    assert.deepEqual(result.preview[0].unmappedHeaders, ['Notes']);
  });

  it('parses nested spreadsheet tabs and range labels into task review records', () => {
    const result = googleSheetsContentToImportReviewRecords(
      {
        spreadsheet: {
          title: 'Staffing Forecast',
          sheets: [
            {
              properties: { title: 'Projects' },
              data: [
                {
                  range: 'Projects!A2:H3',
                  values: [
                    ['Project ID', 'Project Name', 'Required Skills', 'Due Date', 'Est Hours', 'Team Size', 'Priority', 'Staffing Mode'],
                    ['T500', 'AI Migration Sprint', 'React:8:critical|Azure:7:high|Security:6:medium', '2026-07-31', 120, 2, 'High', 'Team'],
                  ],
                },
              ],
            },
          ],
        },
      },
      { target: 'task' }
    );
    const record = result.reviewRecords[0];
    const task = record.entity as Task;

    assert.equal(result.status, 'parsed');
    assert.equal(result.sourceFile, 'Staffing Forecast');
    assert.equal(record.sourceFile, 'Staffing Forecast:Projects!A2:H3');
    assert.equal(record.type, 'task');
    assert.equal(task.id, 'T500');
    assert.equal(task.name, 'AI Migration Sprint');
    assert.equal(task.urgency, 'High');
    assert.equal(task.teamSize, 2);
    assert.equal(task.estHours, 120);
    assert.equal(result.preview[0].detectedSchema, 'task');
    assert.deepEqual(task.requiredSkillSpecs, [
      { name: 'React', minRating: 8, importance: 'critical' },
      { name: 'Azure', minRating: 7, importance: 'high' },
      { name: 'Security', minRating: 6, importance: 'medium' },
    ]);
  });

  it('finds a header row after connector banner rows and previews normalized samples', () => {
    const result = googleSheetsContentToImportReviewRecords(
      {
        spreadsheetName: 'Connector Export',
        tabs: [
          {
            name: 'Roster',
            values: [
              ['Exported from connector on 2026-06-23'],
              ['Employee ID', 'Name', 'Availability', 'Skills'],
              ['E600', 'Jai Patel', '75', 'Power BI:8|SQL:9|Python:7'],
            ],
          },
        ],
      },
      { target: 'auto' }
    );

    assert.equal(result.status, 'parsed');
    assert.equal(result.preview[0].headerRowIndex, 1);
    assert.equal(result.preview[0].detectedSchema, 'employee');
    assert.deepEqual(result.preview[0].sampleRows, [
      {
        employee_id: 'E600',
        name: 'Jai Patel',
        availability: '75',
        skills: 'Power BI:8|SQL:9|Python:7',
      },
    ]);
  });

  it('returns a fallback result when no importable rows are provided', () => {
    const result = googleSheetsContentToImportReviewRecords(
      {
        spreadsheetName: 'Empty Sheet',
        values: [['Employee ID', 'Name', 'Skills']],
      },
      { target: 'employee' }
    );

    assert.equal(result.status, 'fallback');
    assert.equal(result.fallback?.reason, 'no_importable_records');
    assert.deepEqual(result.reviewRecords, []);
    assert.match(result.preview[0].issues.join(' '), /header row plus at least one data row|non-empty data rows/);
  });

  it('accepts posted Google Sheets tabular data through the intake route without OAuth fetching', async () => {
    const previousAuthMode = process.env.WORKMATCH_AUTH_MODE;
    process.env.WORKMATCH_AUTH_MODE = 'demo';

    try {
      const response = await POST(
        new Request('http://localhost/api/google-workspace/intake', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-workmatch-role': 'reviewer',
          },
          body: JSON.stringify({
            target: 'employee',
            sourceName: 'Posted Sheet',
            sheetName: 'Employees',
            values: [
              ['Employee ID', 'Name', 'Role', 'Department', 'Capacity %', 'Skills'],
              ['E700', 'Noor Chen', 'Platform Lead', 'Engineering', 90, 'Kubernetes:8|Terraform:8|Azure:7'],
            ],
          }),
        })
      );
      const json = await response.json();

      assert.equal(response.status, 200);
      assert.equal(json.oauth.required, false);
      assert.equal(json.oauth.implemented, false);
      assert.equal(json.status, 'parsed');
      assert.equal(json.reviewRecords[0].type, 'employee');
      assert.equal(json.reviewRecords[0].entity.id, 'E700');
    } finally {
      if (previousAuthMode === undefined) {
        delete process.env.WORKMATCH_AUTH_MODE;
      } else {
        process.env.WORKMATCH_AUTH_MODE = previousAuthMode;
      }
    }
  });
});
