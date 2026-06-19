# WorkMatch AI - Product Plan

## 1. Product Summary

WorkMatch AI is an enterprise workforce matching dashboard for HR teams and project leads. It helps managers compare employee qualifications, availability, interests, and project experience against task or project requirements. The system recommends the best employee or team assignments, explains why each match works, identifies skill gaps, and lets managers manually adjust AI-created recommendations.

The product should be planned as a full implementation from the start, not a throwaway prototype. The first approval demo should show a focused, demo-ready slice of the final product while using the same architecture direction, data model, and AI workflow intended for production.

## 2. Primary Users

- HR managers who need to understand skill coverage, availability, and staffing gaps.
- Project leads who need to staff tasks, projects, tickets, or client work.
- Future users may include department heads, resource managers, and employees reviewing their own recommended opportunities.

## 3. Full Product Goals

WorkMatch AI should become a production-grade workforce intelligence and staffing platform. The product should:

- Import and normalize employee and task/project data from multiple document formats.
- Maintain structured employee, skill, certification, availability, and project records.
- Use agentic AI workflows for document intake, skill normalization, matching, insights, and manager Q&A.
- Use deterministic scoring for match percentages so recommendations are explainable and repeatable.
- Let managers tune the top matching priorities before generating recommendations.
- Recommend individual employees or full project teams.
- Explain each match in plain language with risks, gaps, and training suggestions.
- Provide dashboards for capacity, skill coverage, staffing risk, and workforce gaps.
- Support AI-recommended project buckets with manual manager override.
- Track manager decisions so the system can improve future recommendations.
- Prepare for production needs such as authentication, audit logs, permissions, integrations, and secure document handling.

## 4. Core Navigation

The application should use a left sidebar with these main tabs:

1. Dashboard
2. Employees
3. Tasks & Projects
4. Matching
5. Imports / Review, either as a modal flow or secondary screen

## 5. Dashboard Requirements

The dashboard should give managers a summarized view of team readiness and staffing risk.

### KPI Cards

- Total employees
- Available capacity
- Open tasks/projects
- AI recommended matches
- Skill gaps
- At-risk projects

### Charts and Insights

- Availability distribution
- Skill demand vs team supply
- Match quality distribution
- Most-needed skills
- Project staffing risk

### AI Insight Examples

- Cloud Security is needed by 6 projects, but only 2 employees have advanced coverage.
- Project Phoenix is at risk because it requires React, Azure, and Security Review by Friday.
- 3 employees are underutilized and could take on new work this week.
- Priya Shah is a Strong Match (87%) for the Data Migration project but needs support with Terraform.
- Jordan Lee is technically qualified but currently has only 15% available capacity.

## 6. Employee Data Model

Each employee profile should include:

- Employee ID
- Name
- Role/title
- Department
- Location
- Timezone
- Availability status: Available, Partial, Busy
- Capacity percentage
- Years of experience
- Skills with 1-10 ratings
- Skill level labels
- Certifications
- Past projects
- Interests
- Career goals
- Cost/rate, optional for later
- Past performance, optional for later

### Skill Rating Scale

- 1-3: Beginner
- 4-5: Intermediate
- 6-8: Advanced
- 9-10: Expert

Each skill should have:

- Skill name
- Numeric score
- Level label
- Evidence/source, such as resume, certification, past project, or manager input
- Last used date, optional for later

## 7. Task and Project Data Model

Each task/project profile should include:

- Task/project ID
- Name
- Description
- Type: client project, internal work, ticket, training assignment, operational task, or job role
- Required skills
- Optional skills
- Minimum skill levels
- Skill importance/weight
- Urgency
- Deadline
- Estimated hours
- Location or remote status
- Seniority required
- Staffing mode: one employee or team
- Current status
- Risk level

## 8. Matching Logic

The manager should be able to select the top 2-3 matching priorities before running AI matching.

Priority options:

- Skill fit
- Availability
- Experience level
- Location/timezone
- Cost/rate
- Past performance
- Growth opportunity
- Deadline urgency

### Match Output

Each match should show both a label and score:

- Perfect Match (95%)
- Strong Match (87%)
- Good Match (74%)
- Growth Match (68%)
- Risky Match (52%)
- Not Recommended (31%)

### Match Explanation

Each recommendation should include:

- Why the employee or team is recommended
- Required skills covered
- Missing or weak skills
- Availability warning, if any
- Training suggestion
- Staffing risk
- Alternative candidates
- Whether the match is best for delivery, availability, or growth

### Example Match Explanation

Priya Shah is a Strong Match (87%) for Project Phoenix because she covers React, Azure, and stakeholder communication at advanced levels. She is missing Terraform experience, so the project lead should pair her with a DevOps specialist or assign a short Terraform onboarding task before kickoff.

## 9. Matching Workspace

The Matching tab should include two switchable views.

### Task-First View

Each project/task shows:

- Ranked employee recommendations
- Match label and score, such as Strong Match (87%)
- AI Recommended badge
- Missing skills
- Availability notes
- Explanation
- Recommended team composition for multi-person projects

### Employee-First View

Each employee shows:

- Recommended tasks/projects
- Fit score
- Growth opportunity score
- Availability impact
- Missing skills or training suggestion

### Drag-and-Drop Project Buckets

The AI should place employees into project buckets automatically. Managers should be able to manually move employees between buckets.

Each bucket should show:

- Project name
- Required team size
- Filled roles
- Missing roles
- Overall team match score
- Staffing risk
- AI Recommended placements
- Manually assigned placements

## 10. Agentic Upload and Import Flow

The product should support both:

1. Sample data already loaded into the app for demos.
2. Real upload/import flow for employees and tasks.
3. AI extraction and normalization for mixed document formats.

### Supported Formats in UI

- CSV
- Excel
- PDF
- Word
- Google Docs
- Google Sheets

### Implementation Scope

The full product should support:

- CSV parsing.
- Excel parsing.
- PDF text extraction.
- Word document extraction.
- Google Docs import.
- Google Sheets import.
- AI extraction from messy or mixed-format documents.
- Human review before records are saved.

### AI Extraction Review

After upload, the app should show a review screen where managers can confirm or edit extracted records before import.

Review screen features:

- Extracted employees/tasks table
- Confidence indicators
- Missing field warnings
- Duplicate detection
- Confirm import button
- Edit inline before saving

## 11. UI Style Direction

The UI should feel like a serious enterprise dashboard, not a marketing website.

### Theme

- Light mode first
- White and soft gray backgrounds
- Black and charcoal text
- Deep red accents used sparingly for emphasis
- Subtle borders
- Restrained shadows
- Compact cards with 8px border radius or less
- Professional tables, filters, tabs, drawers, charts, and kanban boards

### Avoid

- Landing-page hero sections
- Oversized marketing text
- Decorative gradients
- One-note red-only palette
- Overly playful visual style
- Decorative cards inside cards

## 12. Google Stitch Prompt

Use this prompt in Google Stitch to generate the UI direction:

```text
Create a light-mode enterprise AI workforce matching dashboard called WorkMatch AI for HR managers and project leads. The visual theme should be corporate and professional, using deep red accents, black text, white surfaces, and subtle gray enterprise software patterns. Avoid a marketing landing page. The first screen should be the actual dashboard.

The app has a left sidebar navigation with four main sections: Dashboard, Employees, Tasks & Projects, and Matching. Use a clean enterprise layout with dense but readable information, compact cards, tables, kanban boards, charts, profile drawers, filters, status badges, and tabs.

Dashboard:
Show KPI cards for Total Employees, Available Capacity, Open Tasks, AI Recommended Matches, Skill Gaps, and At-Risk Projects. Include charts for availability distribution, skill demand vs team supply, match quality, and most-needed skills. Include an insights panel with AI-generated observations such as "Cloud Security is needed by 6 projects but only 2 employees have advanced skill coverage," "3 employees are underutilized," and "Project Phoenix has a high staffing risk."

Employees tab:
Include a searchable and filterable employee table plus expandable employee profile cards. Each employee should show name, role, department, location, timezone, availability status, capacity percentage, skills, certifications, years of experience, past projects, interests, and career goals. Skill tags should show a 1-10 rating where 1-3 is Beginner, 4-5 is Intermediate, 6-8 is Advanced, and 9-10 is Expert. Include filters for availability, department, skill, seniority, and location.

Tasks & Projects tab:
Create a draggable kanban board for project/task cards. Columns should include New, Needs Review, Ready to Staff, In Progress, and At Risk. Each task card should show task name, urgency, deadline, estimated hours, required skills, optional skills, location/remote, and whether it needs one person or a team. Cards should expand into a detailed task profile drawer.

Matching tab:
Create an AI matching workspace with two switchable views: Task-first and Employee-first. In task-first view, each task shows ranked candidate recommendations with match score, AI Recommended badge, missing skills, availability warnings, and explanation. In employee-first view, each employee shows recommended tasks. Include a drag-and-drop project bucket area where AI places employees into project teams and the manager can manually move them. Highlight AI-recommended placements. Include a priority selector where the manager can choose the top 2-3 matching factors: skill fit, availability, experience, location, cost, past performance, growth opportunity, or urgency.

Upload/import flow:
Add import buttons for Employees and Tasks. The upload modal should show support for PDF, Word, Excel, CSV, Google Docs, and Google Sheets. After upload, show an AI extraction review screen where extracted employees/tasks can be confirmed or corrected before importing.

Design style:
Use a polished enterprise SaaS look, light background, red accents, black text, white panels, subtle borders, and restrained shadows. Use compact professional cards with 8px border radius or less. Use clear icons, status badges, progress bars, tables, tabs, filters, drawers, and charts. The UI should feel like a serious internal workforce planning tool.
```

## 13. Implementation Plan

The project should be treated as a full implementation with a focused approval demo milestone.

### Phase 1 - Foundation

- Set up Next.js, TypeScript, Tailwind CSS, shadcn/ui, and core app shell.
- Define database schema for employees, skills, tasks, projects, matches, imports, and assignments.
- Create Supabase project, storage buckets, and seed data.
- Create sample CSV files for employees and tasks.
- Build authentication and role model, if needed for the first internal version.

### Phase 2 - Data Intake

- Build upload/import flow.
- Implement CSV and Excel parsing.
- Implement document extraction for PDF and Word.
- Add Google Drive, Google Docs, and Google Sheets support.
- Build AI extraction review screen with confidence, warnings, edits, and confirm import.

### Phase 3 - Workforce and Task Management

- Build Employees tab with table, filters, cards, and profile drawers.
- Build Tasks & Projects tab with kanban board, filters, and task detail drawers.
- Add CRUD flows for employees, skills, availability, tasks, and projects.
- Add audit fields so imported and manually edited data can be traced.

### Phase 4 - Matching Engine

- Implement deterministic scoring for skills, availability, experience, location, urgency, cost, performance, and growth opportunity.
- Add manager-selected priority weights.
- Generate ranked individual recommendations.
- Generate team recommendations for multi-person projects.
- Build match explanations, risks, missing skills, and training suggestions.

### Phase 5 - Agentic Workflows

- Add document intake agent.
- Add skill normalization agent.
- Add matching recommendation agent.
- Add workforce insights agent.
- Add manager copilot agent for natural-language questions.
- Add tracing, stored outputs, and review checkpoints.

### Phase 6 - Dashboard and Insights

- Build executive dashboard.
- Add charts for capacity, skill demand vs supply, match quality, and project risk.
- Add AI-generated insight cards.
- Add drill-down from insights into employees, projects, and matches.

### Phase 7 - Production Readiness

- Add robust permissions.
- Add audit logging for AI recommendations and manager overrides.
- Add security review for uploaded documents.
- Add error handling, monitoring, and test coverage.
- Add exports to CSV, PDF, and presentation-ready formats.
- Deploy to Vercel with Supabase and production environment variables.

## 14. Approval Demo Milestone

The one-week demo should be a manager approval milestone, not the final implementation scope. The demo should prove the value of the product and show that the full implementation direction is realistic.

See [Demo_Ready_Requirements.md](Demo_Ready_Requirements.md) for the one-week approval demo checklist.

## 15. Future Product Expansion

- Team-level planning across departments.
- HRIS integration.
- Historical performance and assignment outcomes.
- Training recommendation engine.
- Audit trail for AI recommendations and manager overrides.
- Export reports to PDF, PowerPoint, or spreadsheet.
- Employee-facing growth recommendations.
- Skill taxonomy administration.
- Scenario planning and capacity forecasting.

## 16. Open Questions

- Should project buckets support hard constraints, such as "must be in Toronto" or "must have security clearance"?
- Should employees see their own recommended growth tasks later?
- Should match scores be fully transparent with visible scoring weights?
- Should the system track manager overrides to improve future recommendations?
- Should cost/rate be included in the prototype or saved for production?

