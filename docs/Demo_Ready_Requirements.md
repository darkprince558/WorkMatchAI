# WorkMatch AI - One-Week Demo Ready Requirements

## 1. Demo Purpose

The one-week demo is not the final product. It is an approval demo designed to show managers that WorkMatch AI can become a useful internal workforce planning tool.

The demo should prove four things:

- The dashboard makes workforce capacity and skill gaps easy to understand.
- The system can compare employee profiles against task/project requirements.
- AI recommendations are explainable, useful, and editable by managers.
- The full implementation path is realistic.

## 2. Demo Scenario

Use sample data with:

- 8-12 employees
- 6-10 tasks/projects
- Mixed availability statuses
- A few obvious strong matches
- A few risky matches
- At least one team-based project
- At least one project blocked by a scarce skill

Sample CSV files already exist:

- `sample-data/employees.csv`
- `sample-data/tasks.csv`

## 3. Must-Have Demo Screens

### Dashboard

Must show:

- Total employees
- Available capacity
- Open tasks/projects
- AI recommended matches
- Skill gaps
- At-risk projects
- Availability chart
- Skill demand vs supply chart
- AI insights panel

### Employees

Must show:

- Searchable employee table
- Filters for availability, department, and skills
- Employee profile drawer or expanded profile
- Skill tags with 1-10 ratings
- Capacity percentage
- Certifications, past projects, interests, and career goals

### Tasks & Projects

Must show:

- Kanban board
- Draggable task/project cards
- Status columns such as New, Needs Review, Ready to Staff, In Progress, and At Risk
- Task detail drawer
- Required and optional skills
- Deadline, urgency, estimated hours, location, and staffing mode

### Matching

Must show:

- Task-first recommendations
- Employee-first recommendations
- Match label and score, such as Strong Match (87%)
- AI Recommended badge
- Explanation of why each match was recommended
- Missing skills
- Availability warnings
- Training suggestions
- Project buckets with AI placements
- Manual drag-and-drop movement between buckets

### Import and Review

Must show:

- Import button for employees and tasks
- CSV upload working for real
- Supported format list: CSV, Excel, PDF, Word, Google Docs, Google Sheets
- AI extraction review screen
- Confirm/edit before import

For the demo, CSV import should work. Other formats can be shown in the UI as planned capabilities unless implementation time allows more.

## 4. Must-Have AI Behaviors

The demo should show:

- AI-style summarized employee profiles
- AI-style summarized task profiles
- Match explanations
- Dashboard insights
- Skill gap detection
- Training recommendations
- Availability warnings

The recommendation score itself should come from deterministic code, then AI should explain the result.

## 5. Demo Acceptance Checklist

The demo is ready when:

- The app loads from a Vercel preview URL or local dev URL.
- The sidebar navigation works.
- Dashboard cards and charts show realistic sample data.
- Employee table and profile details work.
- Task kanban board and task details work.
- Matching tab shows ranked recommendations.
- Match labels use the format Strong Match (87%).
- At least one team-based project bucket is shown.
- Drag-and-drop reassignment works or is convincingly represented.
- CSV import works for at least one sample employee or task file.
- AI extraction review screen is present.
- Manager can confirm imported records.
- AI explanations are written in plain English.
- Visual style is corporate, light mode, red/black/white, and enterprise-ready.

## 6. Manager Demo Talking Points

Use these points while presenting:

- WorkMatch AI helps HR and project leads make faster staffing decisions.
- The system does not replace manager judgment; it gives explainable recommendations.
- Managers can adjust matching priorities based on the project need.
- The AI can recommend individuals or full teams.
- Skill gaps become visible before a project becomes blocked.
- Employee growth can be considered alongside delivery needs.
- The product can start with CSV/Excel and expand to PDF, Word, Google Docs, and Google Sheets.
- The architecture supports a full implementation, not just a mockup.

## 7. Approval Questions for Manager

Ask for feedback on:

- Are these the right dashboard metrics?
- Should matching prioritize delivery speed, skill fit, growth opportunity, or availability?
- Which document formats matter most for the first production release?
- Who should be able to approve AI recommendations?
- What integrations would matter most later, such as HR systems, project management tools, or Google Workspace?
- What data is sensitive and needs stricter controls?

## 8. Demo Risks

Known risks to call out honestly:

- Mixed-format document parsing can be complex and should be phased carefully.
- Skill ratings may need manager review when inferred from documents.
- HR data requires permissions, audit logs, and privacy controls.
- AI recommendations must remain explainable and reviewable.
- Real company integration will require security and compliance review.


