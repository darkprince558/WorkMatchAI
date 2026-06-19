# WorkMatch AI - Technical Architecture and Agentic Plan

## 1. Recommended Stack

WorkMatch AI should be built as a full-stack web application that can start on Vercel and grow into a production-grade internal platform.

### Application

- Next.js
- React
- TypeScript
- Tailwind CSS
- shadcn/ui
- Radix UI
- lucide-react

### Data and Backend

- Supabase Postgres for structured data
- Supabase Storage or Vercel Blob for uploaded files
- Next.js Route Handlers and Server Actions for backend logic
- Prisma or Drizzle ORM for database access
- Zod for validation and structured AI outputs

### UI Functionality

- TanStack Table for employee and task tables
- dnd-kit for kanban and drag-and-drop assignment buckets
- Recharts for dashboards
- React Hook Form for forms
- Sonner or shadcn toast for notifications

### File and Document Processing

- Papa Parse for CSV
- ExcelJS for Excel
- Mammoth for Word documents
- pdf-parse for basic PDF text extraction
- Tesseract.js for OCR when needed
- Docling as a stronger future document pipeline for tables, layout, OCR, and messy PDFs

### AI and Agentic Workflows

- OpenAI API for models, structured outputs, and file-aware workflows
- Vercel AI SDK for AI streaming, tool calls, and app integration
- OpenAI Agents SDK for multi-step agent workflows
- LangGraph.js later if workflows need durable graph orchestration

## 2. Hosting Recommendation

Use Vercel for the application and Supabase for the database, auth, and storage.

### Vercel

- Hosts the Next.js app.
- Runs API routes and server actions.
- Supports preview deployments for manager demos.
- Works well for fast iteration and sharing.

### Supabase

- Stores employees, tasks, skills, matches, imports, and assignments.
- Provides Postgres for reliable relational data.
- Provides storage for uploaded documents.
- Can support auth and role-based access.

## 3. Agentic Product Direction

The system should be agentic, but not uncontrolled. The agent should perform multi-step work, call tools, ask for review when confidence is low, and produce structured outputs. Managers should approve imports and final assignments before the system saves major decisions.

The design principle:

```text
AI agents do the reasoning, extraction, normalization, and recommendations.
Deterministic code calculates match scores and enforces constraints.
Managers approve final imports and assignments.
```

### Demo Truth Boundary

For the demo, the application can honestly describe the AI path as planned agentic architecture rather than live automation. The current rule is:

- AI is responsible for extraction, normalization, summary text, explanation text, and recommended next actions.
- Deterministic application code is responsible for scoring, hard constraints, labels, capacity math, and persistence after approval.
- Managers are responsible for approving imported records, AI-estimated skill ratings, final assignments, and bulk assignment changes.
- No demo screen should imply that an AI route already imports employees, edits source-of-truth records, or finalizes staffing decisions without review.

The future implementation should enter through typed workflow contracts before any live model route is added. Those contracts are documented in `docs/AGENTIC_WORKFLOW_CONTRACTS.md` and should be implemented first as Zod schemas, TypeScript types, and database-backed run records.

### Future Agentic Workflow Path

1. Upload, manager question, scheduled insight, or matching request starts an `agent_runs` record.
2. The agent reads approved data and calls typed tools such as document parsing, skill taxonomy lookup, workforce snapshot reads, and deterministic scoring.
3. AI may extract, normalize, summarize, and explain, returning confidence, evidence, source references, warnings, and review checkpoints.
4. Deterministic code validates the agent output, calculates or preserves scores, applies hard constraints, and blocks unsafe writes.
5. Manager review checkpoints decide whether proposed imports, ratings, recommendations, assignments, or bulk changes are approved, edited, rejected, or deferred.
6. Approved decisions create durable records and `audit_events`; rejected or deferred decisions remain traceable but do not mutate the source of truth.

## 4. Core Agents

### 4.1 Document Intake Agent

Purpose:

- Read uploaded employee or task documents.
- Detect document type and likely schema.
- Extract structured records.
- Identify missing fields and uncertain data.

Tools:

- CSV parser
- Excel parser
- PDF extractor
- Word extractor
- Google Docs/Sheets connector later
- AI structured extraction

Output:

- Proposed employees or tasks
- Confidence by field
- Missing field warnings
- Duplicate candidates
- Source references

### 4.2 Skill Normalization Agent

Purpose:

- Normalize inconsistent skill names.
- Map related skills to a standard taxonomy.
- Estimate skill levels when documents provide evidence but not numeric scores.

Examples:

- React.js, React, frontend React -> React
- Azure Cloud, Microsoft Azure -> Azure
- CI CD, CI/CD pipelines -> CI/CD

Output:

- Normalized skill name
- Original source text
- Suggested level from 1-10
- Confidence
- Evidence

### 4.3 Matching Recommendation Agent

Purpose:

- Use the scoring engine and manager priorities.
- Recommend employees or teams for tasks/projects.
- Explain the result in manager-friendly language.

Inputs:

- Employees
- Tasks/projects
- Skills
- Availability
- Manager priority weights
- Hard constraints

Output:

- Ranked candidates
- Recommended team buckets
- Match label and score, such as Strong Match (87%)
- Missing skills
- Availability warnings
- Suggested training
- Alternative candidates

### 4.4 Workforce Insights Agent

Purpose:

- Generate dashboard-level insights.
- Identify skill shortages, overloaded employees, underused employees, and at-risk projects.
- Recommend training or hiring focus areas.

Output examples:

- Cloud Security is required by 4 active projects but only 1 available employee has expert-level coverage.
- Project Phoenix is at risk because the best-fit Terraform employees are already above 70% utilization.
- Three employees are available for growth assignments in analytics and reporting.

### 4.5 Manager Copilot Agent

Purpose:

- Let managers ask questions in natural language.
- Use tools to inspect data and produce staffing recommendations.

Example questions:

- Who is the best available person for Project Phoenix?
- Build a team for the cloud migration.
- Which projects are blocked by security skill gaps?
- Why did the AI recommend Priya over Jordan?
- Who is underutilized this week?

## 5. Deterministic Matching Engine

The match score should be calculated in code so managers can trust it.

Recommended scoring components:

- Skill fit
- Required skill coverage
- Optional skill bonus
- Availability
- Experience level
- Location/timezone fit
- Urgency and deadline fit
- Growth opportunity
- Cost/rate, if available
- Past performance, if available

The manager can choose the top 2-3 priorities. These priorities adjust the weights.

Example output:

```text
Strong Match (87%)
```

Label thresholds:

- Perfect Match: 92-100
- Strong Match: 80-91
- Good Match: 68-79
- Growth Match: 55-67
- Risky Match: 40-54
- Not Recommended: 0-39

## 6. Human Review Checkpoints

The product should require manager confirmation for:

- Imported employee records
- Imported task/project records
- AI-estimated skill ratings
- Final employee-to-project assignments
- Bulk assignment changes

The system should allow AI recommendations to be accepted, edited, or rejected.

## 7. Data Model Overview

Primary tables:

- users
- organizations
- employees
- employee_skills
- skill_taxonomy
- certifications
- employee_availability
- projects
- tasks
- task_required_skills
- task_optional_skills
- imports
- imported_records
- matches
- match_explanations
- project_assignments
- manager_overrides
- agent_runs
- audit_events

## 8. Security and Audit Requirements

Because this product handles employee information, it should include:

- Role-based permissions
- Upload access controls
- Audit logs for manager edits and AI recommendations
- Clear source tracking for extracted data
- Stored AI output with timestamps and model metadata
- Safe file handling
- No automatic final assignment without human approval

## 9. Implementation Priority

Build the system in this order:

1. Data model and sample seed data
2. Employees and tasks UI
3. Deterministic matching engine
4. Matching dashboard and drag-and-drop buckets
5. CSV/Excel import and review
6. AI explanations and insights
7. Agentic document intake
8. Google Docs/Sheets support
9. Full audit, permissions, and production hardening

