-- WorkMatch AI production starter schema.
-- Run this in a Supabase project before enabling persistent production data.

create extension if not exists "pgcrypto";

create or replace function workmatch_touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists organizations (
  id text primary key default gen_random_uuid()::text,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists profiles (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  auth_user_id uuid,
  email text,
  role text not null default 'viewer' check (role in ('admin', 'manager', 'reviewer', 'viewer', 'agent_service')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (auth_user_id)
);

create or replace function workmatch_current_organization_ids()
returns table(organization_id text)
language sql
stable
security definer
set search_path = public
as $$
  select p.organization_id
  from profiles p
  where p.auth_user_id = auth.uid()

  union

  select auth.jwt() -> 'app_metadata' ->> 'organization_id'
  where auth.uid() is not null
    and auth.jwt() -> 'app_metadata' ->> 'organization_id' is not null;
$$;

create or replace function workmatch_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    auth.jwt() -> 'app_metadata' ->> 'role',
    (select p.role from profiles p where p.auth_user_id = auth.uid() limit 1),
    'viewer'
  );
$$;

create or replace function workmatch_can_manage()
returns boolean
language sql
stable
as $$
  select workmatch_current_role() in ('admin', 'manager');
$$;

create table if not exists employees (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  external_employee_id text not null,
  name text not null,
  role text not null,
  department text not null,
  location text not null,
  timezone text,
  availability_percent integer not null default 0 check (availability_percent between 0 and 100),
  availability_status text check (availability_status in ('Available', 'Partial', 'Busy')),
  skills jsonb not null default '[]'::jsonb,
  years_experience integer not null default 0 check (years_experience >= 0),
  readiness text not null default 'Ready' check (readiness in ('Ready', 'In Training', 'Busy')),
  avatar_url text,
  interests text[] not null default '{}',
  career_goals text,
  certifications text[] not null default '{}',
  past_projects text[] not null default '{}',
  resume_file_name text,
  resume_updated_at timestamptz,
  resume_note text,
  project_interests text[] not null default '{}',
  source_import_id text,
  source_record_id text,
  is_active boolean not null default true,
  created_by_user_id text,
  updated_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_employee_id)
);

create table if not exists tasks (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  external_task_id text not null,
  name text not null,
  type text,
  description text,
  urgency text not null default 'Medium' check (urgency in ('Low', 'Medium', 'High')),
  deadline_date date not null,
  estimated_hours integer not null default 0 check (estimated_hours >= 0),
  required_skills jsonb not null default '[]'::jsonb,
  optional_skills jsonb not null default '[]'::jsonb,
  location text not null default 'Remote',
  remote boolean not null default true,
  team_size integer not null default 1 check (team_size >= 1),
  seniority text,
  staffing_mode text not null default 'One Employee',
  status text not null default 'New' check (status in ('New', 'Needs Review', 'Ready to Staff', 'In Progress', 'At Risk')),
  source_documents jsonb not null default '[]'::jsonb,
  source_import_id text,
  source_record_id text,
  created_by_user_id text,
  updated_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, external_task_id)
);

alter table tasks add column if not exists source_documents jsonb not null default '[]'::jsonb;

create table if not exists imports (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  source_type text not null check (source_type in ('csv', 'excel', 'pdf', 'word', 'microsoft365', 'roster', 'manual')),
  source_name text not null,
  source_uri text,
  storage_path text,
  target text not null check (target in ('auto', 'employee', 'task', 'roster')),
  status text not null default 'uploaded' check (status in ('uploaded', 'parsed', 'needs_review', 'confirmed', 'partially_confirmed', 'rejected', 'failed')),
  review_required boolean not null default true,
  confidence_threshold numeric(5,4) not null default 0.85,
  row_count integer not null default 0,
  confirmed_count integer not null default 0,
  rejected_count integer not null default 0,
  triggered_by_user_id text,
  agent_run_id text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists imported_records (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  import_id text not null references imports(id) on delete cascade,
  record_type text not null check (record_type in ('employee', 'task', 'assignment', 'mixed', 'unknown')),
  review_status text not null default 'needs_review' check (review_status in ('needs_review', 'needs_correction', 'confirmed', 'rejected', 'deferred')),
  confidence numeric(5,4) not null default 0,
  issues text[] not null default '{}',
  source_refs jsonb not null default '[]'::jsonb,
  source_row_number integer,
  source_sheet text,
  raw_payload jsonb not null default '{}'::jsonb,
  normalized_payload jsonb not null default '{}'::jsonb,
  duplicate_candidates jsonb not null default '[]'::jsonb,
  reviewer_user_id text,
  reviewed_at timestamptz,
  creates_record_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists assignments (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  task_id text not null,
  employee_id text not null,
  status text not null default 'pending_review' check (status in ('proposed', 'pending_review', 'approved', 'rejected', 'active', 'completed', 'cancelled')),
  source text not null default 'manager' check (source in ('manager', 'match_recommendation', 'roster_import', 'system')),
  allocation_percent integer not null default 100 check (allocation_percent between 0 and 100),
  match_score integer check (match_score between 0 and 100),
  match_label text,
  start_date date,
  end_date date,
  reviewed_by_user_id text,
  approved_at timestamptz,
  rejected_at timestamptz,
  notes text,
  import_id text references imports(id) on delete set null,
  imported_record_id text references imported_records(id) on delete set null,
  agent_run_id text,
  created_by_user_id text,
  updated_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, task_id, employee_id)
);

create table if not exists settings (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  scope text not null default 'organization' check (scope in ('organization', 'team', 'user')),
  team_id text,
  user_id text,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  schema_version integer not null default 1,
  updated_by_user_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, scope, key)
);

create table if not exists agent_runs (
  id text primary key,
  organization_id text not null references organizations(id) on delete cascade,
  agent_name text not null,
  workflow_version text not null,
  status text not null,
  started_at timestamptz not null,
  completed_at timestamptz,
  triggered_by_user_id text,
  trigger_type text not null default 'manual_request',
  input_hash text not null,
  input_summary text not null,
  input_ref text,
  output_ref text,
  output_summary text,
  model_provider text,
  model_name text,
  model_version text,
  prompt_version text,
  token_input_count integer,
  token_output_count integer,
  estimated_cost_usd numeric(12,6),
  tool_call_count integer not null default 0,
  fallback_used boolean not null default false,
  deterministic_score_used boolean not null default false,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists audit_events (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  actor_type text not null check (actor_type in ('manager', 'agent', 'system')),
  actor_id text,
  event_type text not null,
  target_type text not null,
  target_id text not null,
  before_ref text,
  after_ref text,
  before_snapshot jsonb not null default '{}'::jsonb,
  after_snapshot jsonb not null default '{}'::jsonb,
  agent_run_id text references agent_runs(id) on delete set null,
  manager_user_id text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists agent_tool_calls (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  agent_run_id text not null references agent_runs(id) on delete cascade,
  tool_name text not null,
  status text not null,
  input_hash text not null,
  output_ref text,
  error_code text,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create table if not exists monitoring_events (
  id text primary key default gen_random_uuid()::text,
  organization_id text not null references organizations(id) on delete cascade,
  event_type text not null check (event_type in ('parser_failure', 'route_error', 'persistence_write')),
  severity text not null default 'info' check (severity in ('info', 'warning', 'error')),
  source text,
  route text,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists rate_limit_buckets (
  bucket_key text primary key,
  count integer not null default 0 check (count >= 0),
  reset_at timestamptz not null,
  created_at timestamptz not null default now()
);

create or replace function workmatch_check_rate_limit(rate_limit_key text, limit_count integer, window_ms integer)
returns table(allowed boolean, retry_after_seconds integer)
language plpgsql
security definer
set search_path = public
as $$
declare
  now_ts timestamptz := now();
  current_count integer;
  current_reset timestamptz;
  next_reset timestamptz;
begin
  if rate_limit_key is null or length(rate_limit_key) = 0 or length(rate_limit_key) > 512 then
    raise exception 'invalid rate limit key';
  end if;

  if limit_count < 1 or window_ms < 1000 or window_ms > 86400000 then
    raise exception 'invalid rate limit options';
  end if;

  next_reset := now_ts + make_interval(secs => ceil(window_ms / 1000.0)::integer);

  insert into rate_limit_buckets (bucket_key, count, reset_at)
  values (rate_limit_key, 1, next_reset)
  on conflict (bucket_key) do update
  set
    count = case when rate_limit_buckets.reset_at <= now_ts then 1 else rate_limit_buckets.count + 1 end,
    reset_at = case when rate_limit_buckets.reset_at <= now_ts then next_reset else rate_limit_buckets.reset_at end
  returning rate_limit_buckets.count, rate_limit_buckets.reset_at
  into current_count, current_reset;

  allowed := current_count <= limit_count;
  retry_after_seconds := case
    when allowed then 0
    else greatest(1, ceil(extract(epoch from (current_reset - now_ts)))::integer)
  end;

  delete from rate_limit_buckets where reset_at <= now_ts - interval '1 hour';
  return next;
end;
$$;

revoke all on function workmatch_check_rate_limit(text, integer, integer) from public;
grant execute on function workmatch_check_rate_limit(text, integer, integer) to service_role;

create index if not exists employees_org_idx on employees (organization_id);
create index if not exists tasks_org_idx on tasks (organization_id);
create index if not exists assignments_org_task_idx on assignments (organization_id, task_id);
create index if not exists imports_org_idx on imports (organization_id, created_at desc);
create index if not exists agent_runs_org_idx on agent_runs (organization_id, created_at desc);
create index if not exists monitoring_events_org_idx on monitoring_events (organization_id, created_at desc);
create index if not exists rate_limit_buckets_reset_idx on rate_limit_buckets (reset_at);

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'organizations',
    'profiles',
    'employees',
    'tasks',
    'imports',
    'imported_records',
    'assignments',
    'settings',
    'agent_runs',
    'audit_events',
    'agent_tool_calls',
    'monitoring_events'
  ]
  loop
    execute format('drop trigger if exists %I on %I', table_name || '_touch_updated_at', table_name);
    if table_name not in ('audit_events', 'agent_tool_calls', 'monitoring_events') then
      execute format('create trigger %I before update on %I for each row execute function workmatch_touch_updated_at()', table_name || '_touch_updated_at', table_name);
    end if;
  end loop;
end $$;

alter table organizations enable row level security;
alter table profiles enable row level security;
alter table employees enable row level security;
alter table tasks enable row level security;
alter table imports enable row level security;
alter table imported_records enable row level security;
alter table assignments enable row level security;
alter table settings enable row level security;
alter table agent_runs enable row level security;
alter table audit_events enable row level security;
alter table agent_tool_calls enable row level security;
alter table monitoring_events enable row level security;
alter table rate_limit_buckets enable row level security;

drop policy if exists "service role can manage organizations" on organizations;
create policy "service role can manage organizations" on organizations for all to service_role using (true) with check (true);
drop policy if exists "members can read organizations" on organizations;
create policy "members can read organizations" on organizations for select to authenticated using (id in (select organization_id from workmatch_current_organization_ids()));

drop policy if exists "service role can manage profiles" on profiles;
create policy "service role can manage profiles" on profiles for all to service_role using (true) with check (true);
drop policy if exists "users can read own profile" on profiles;
create policy "users can read own profile" on profiles for select to authenticated using (auth_user_id = auth.uid());

drop policy if exists "members can read employees" on employees;
create policy "members can read employees" on employees for select to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()));
drop policy if exists "managers can write employees" on employees;
create policy "managers can write employees" on employees for all to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_can_manage()) with check (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_can_manage());

drop policy if exists "members can read tasks" on tasks;
create policy "members can read tasks" on tasks for select to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()));
drop policy if exists "managers can write tasks" on tasks;
create policy "managers can write tasks" on tasks for all to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_can_manage()) with check (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_can_manage());

drop policy if exists "members can read imports" on imports;
create policy "members can read imports" on imports for select to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()));
drop policy if exists "managers can write imports" on imports;
create policy "managers can write imports" on imports for all to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_can_manage()) with check (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_can_manage());

drop policy if exists "members can read imported records" on imported_records;
create policy "members can read imported records" on imported_records for select to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()));
drop policy if exists "managers can write imported records" on imported_records;
create policy "managers can write imported records" on imported_records for all to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_can_manage()) with check (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_can_manage());

drop policy if exists "members can read assignments" on assignments;
create policy "members can read assignments" on assignments for select to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()));
drop policy if exists "managers can write assignments" on assignments;
create policy "managers can write assignments" on assignments for all to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_can_manage()) with check (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_can_manage());

drop policy if exists "members can read settings" on settings;
create policy "members can read settings" on settings for select to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()));
drop policy if exists "managers can write settings" on settings;
create policy "managers can write settings" on settings for all to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_can_manage()) with check (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_can_manage());

drop policy if exists "members can read agent runs" on agent_runs;
create policy "members can read agent runs" on agent_runs for select to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()));

drop policy if exists "members can read audit events" on audit_events;
create policy "members can read audit events" on audit_events for select to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_current_role() in ('admin', 'manager', 'reviewer'));

drop policy if exists "members can read tool calls" on agent_tool_calls;
create policy "members can read tool calls" on agent_tool_calls for select to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_current_role() in ('admin', 'manager', 'reviewer'));

drop policy if exists "members can read monitoring events" on monitoring_events;
create policy "members can read monitoring events" on monitoring_events for select to authenticated using (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_current_role() in ('admin', 'manager', 'reviewer'));
drop policy if exists "managers can write monitoring events" on monitoring_events;
create policy "managers can write monitoring events" on monitoring_events for insert to authenticated with check (organization_id in (select organization_id from workmatch_current_organization_ids()) and workmatch_can_manage());

drop policy if exists "service role can manage rate limit buckets" on rate_limit_buckets;
create policy "service role can manage rate limit buckets" on rate_limit_buckets for all to service_role using (true) with check (true);
