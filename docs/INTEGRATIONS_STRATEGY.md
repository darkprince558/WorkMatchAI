# WorkMatch AI Integration Strategy

Status: product and architecture plan
Goal: make WorkMatch AI the AI workforce intelligence layer across the systems companies already use for employees, projects, tasks, documents, and planning.

## Product Principle

WorkMatch AI should not require organizations to abandon their existing tools. It should connect to the tools where workforce and project data already live, normalize that data into WorkMatch's review model, and let AI reason over it with citations, tenant isolation, and human approval.

The core promise:

- Connect project tools, HR systems, spreadsheets, and knowledge bases.
- Import or sync tasks, projects, employees, skills, documents, assignments, and staffing signals.
- Normalize noisy records into a consistent workforce model.
- Use RAG and agentic workflows to answer staffing questions and draft recommendations.
- Never write back to source systems without explicit user approval.

## Connector Categories

| Category | Examples | Data We Want | First Mode |
| --- | --- | --- | --- |
| Project/task management | ClickUp, Jira, Linear, Asana, monday.com | projects, tasks, epics, assignees, statuses, due dates, priorities, custom fields | Read sync |
| Workspaces/knowledge bases | Notion, Confluence, Google Docs, SharePoint | project briefs, team docs, role expectations, delivery notes | RAG ingest |
| Spreadsheets | Google Sheets, Microsoft Excel, Airtable | employee rosters, skill matrices, staffing plans, project trackers | Import and scheduled sync |
| HRIS/people systems | BambooHR, HiBob, Rippling, Workday, Personio | employees, departments, roles, locations, managers, employment status | Read sync |
| Communication | Slack, Microsoft Teams | optional approval notifications, summaries, alerts | Notification-only first |
| Calendar/capacity | Google Calendar, Outlook Calendar | availability signals, planned PTO, meeting load | Read-only capacity signal |

## Recommended Rollout

### Wave 1 - High-Impact, Low-Friction Integrations

Build these first because they cover common workflows and are realistic for a public portfolio SaaS:

1. CSV and Excel
   - Already partly implemented.
   - Keep as universal fallback for any company.

2. Google Sheets
   - Best first cloud sync for skill matrices and staffing trackers.
   - Map rows into employees, tasks, skills, or assignments.
   - Support user-selected sheet, tab, header row, and field mapping.

3. Notion
   - Good for project databases, team directories, and knowledge-base RAG.
   - Import Notion databases as structured records.
   - Ingest pages as source documents for RAG.

4. ClickUp
   - Strong project/task management signal.
   - Sync spaces/folders/lists/tasks, assignees, statuses, priorities, custom fields, and due dates.

### Wave 2 - Enterprise Project Systems

Add these after the connector framework is stable:

1. Jira
   - Most enterprise-recognizable project tracker.
   - Sync projects, issues, statuses, priorities, components, labels, assignees, custom fields, and JQL-selected scopes.

2. Linear
   - Strong modern engineering-team signal.
   - Sync teams, projects, issues, labels, assignees, cycle and project metadata.

3. Asana
   - Common operations/project tool.
   - Sync projects, tasks, custom fields, assignees, due dates, sections.

4. monday.com
   - Common non-engineering workflow tracker.
   - Sync boards, items, groups, columns, owners, dates, status columns.

### Wave 3 - HRIS And Capacity Systems

Add once the app is ready for real organizations:

1. BambooHR or HiBob first
   - More practical than Workday for early SaaS.
   - Sync employees, departments, roles, locations, manager relationships, employment status.

2. Workday later
   - Enterprise credibility, but higher sales/admin/integration complexity.
   - Treat as later enterprise integration or partner-led setup.

3. Calendars
   - Google Calendar and Outlook Calendar can provide capacity signals.
   - Do not treat calendar load as authoritative availability without manager review.

## Architecture

Use a connector framework rather than one-off integrations.

### Core Tables

Recommended additions:

- `integration_connections`
  - organization id
  - provider id
  - external workspace/account id
  - display name
  - status
  - scopes granted
  - token reference
  - last sync timestamps
  - sync health

- `integration_sync_jobs`
  - connection id
  - job type
  - status
  - started/completed timestamps
  - cursor/checkpoint
  - records scanned
  - records created/updated/skipped
  - error code/message

- `external_records`
  - organization id
  - provider id
  - connection id
  - external object type
  - external id
  - source url
  - raw payload hash
  - normalized object type
  - normalized object id
  - last seen timestamp

- `source_documents`
  - organization id
  - provider id
  - source url
  - title
  - content type
  - extracted text
  - source metadata

- `document_chunks`
  - source document id
  - organization id
  - chunk text
  - embedding
  - metadata

### Connector Interface

Every connector should implement the same shape:

```ts
export interface WorkMatchConnector {
  providerId: string;
  displayName: string;
  authType: 'oauth' | 'api_key' | 'service_account';
  listScopes(): IntegrationScope[];
  startOAuth?(organizationId: string): Promise<string>;
  completeOAuth?(code: string, state: string): Promise<IntegrationConnection>;
  testConnection(connectionId: string): Promise<IntegrationHealth>;
  discoverResources(connectionId: string): Promise<IntegrationResource[]>;
  syncResource(connectionId: string, resourceId: string, cursor?: string): Promise<IntegrationSyncResult>;
}
```

Each connector maps source data into canonical WorkMatch records:

- `ExternalEmployee`
- `ExternalProject`
- `ExternalTask`
- `ExternalAssignment`
- `ExternalSkillEvidence`
- `ExternalDocument`
- `ExternalAvailabilitySignal`

The canonical records then enter the existing review flow as proposed updates. Source systems are not authoritative until a manager approves the mapped records.

## Integration UX

Add an **Integrations** admin page with:

- Provider catalog: Sheets, Notion, ClickUp, Jira, Linear, Asana, monday.com, BambooHR, Microsoft 365.
- Connect button and OAuth status.
- Granted scopes and last sync time.
- Resource picker: workspace, database, sheet, list, project, board.
- Field mapping UI.
- Sync mode:
  - Manual import
  - Scheduled read sync
  - RAG-only ingest
  - Approval-gated writeback
- Sync health and error details.
- Disconnect and revoke access.

## AI Behavior

Connected data should power AI in three ways:

1. Structured matching
   - Tasks/projects from ClickUp/Jira/Notion/Sheets become WorkMatch tasks.
   - HRIS/spreadsheet rows become employee profiles and skill evidence.

2. RAG
   - Notion pages, docs, tickets, task descriptions, comments, and project briefs become retrievable source context.
   - Answers cite source systems and object URLs.

3. Agentic workflows
   - Manager copilot can call tools like `searchConnectedTasks`, `retrieveProjectBrief`, `findSkillEvidence`, and `draftAssignmentUpdate`.
   - Any writeback tool must require explicit approval.

## Writeback Rules

Start read-only. Add writeback only after approval flows are stable.

Allowed later:

- Create a draft task comment with staffing recommendation.
- Update a custom field like `Recommended assignee`.
- Add a WorkMatch source link back to a task or Notion page.
- Create an assignment proposal page/comment.

Not allowed without explicit user approval:

- Assigning employees to tasks.
- Changing project status.
- Editing HR profile fields.
- Updating skill ratings.
- Closing/reprioritizing work.

## Security Requirements

- Tokens are encrypted at rest.
- Tokens are scoped per organization and provider connection.
- Service tokens never reach browser code.
- Every sync is tenant-filtered by `organization_id`.
- Every RAG query includes `organization_id`.
- Every writeback creates an audit event with before/after metadata.
- Scopes are least-privilege and visible to tenant admins.
- Admins can disconnect providers and delete synced data.

## Provider Notes

### ClickUp

Use ClickUp for spaces, folders, lists, tasks, assignees, priorities, due dates, statuses, and custom fields. Good for project/task sync and staffing recommendation writeback later.

### Notion

Use Notion for databases and pages. Databases can map to projects, tasks, employee directories, or skill matrices. Pages become RAG documents.

### Google Sheets

Use Sheets for tabular import/sync. Support configurable ranges and header mapping. This is the easiest way for small teams to pilot WorkMatch without a formal HRIS integration.

### Microsoft 365

Use Microsoft Graph for Excel, SharePoint/OneDrive documents, Teams notifications, Outlook Calendar, and Planner/To Do data where available. This is important for enterprise buyers.

### Jira

Use Jira for enterprise project and issue tracking. Support JQL-based scoped imports so admins can choose which projects/issues WorkMatch can see.

### HRIS

Start with BambooHR or HiBob before Workday. Workday is valuable for enterprise credibility but has higher setup friction.

## Resume/Portfolio Signal

This integration layer should be highlighted as:

- OAuth-based SaaS connector architecture.
- Tenant-isolated sync jobs and source records.
- Unified normalization layer across project tools, HR systems, docs, and spreadsheets.
- RAG over third-party source systems with citations.
- Approval-gated AI writeback to external systems.
- Connector health monitoring and audit trails.

That is much stronger than saying the app "imports CSVs." It says WorkMatch AI can become an enterprise AI system of intelligence across the company stack.
