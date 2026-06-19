import type { ImportReviewRecord, TaskStatus } from './types';
import type { WorkMatchSettings } from './settings';
import type { Employee, Task } from './types';

export type WorkMatchPersistenceMode = 'supabase' | 'memory';

export interface WorkMatchDataSnapshot {
  employees: Employee[];
  tasks: Task[];
  settings: WorkMatchSettings;
  persistence: {
    mode: WorkMatchPersistenceMode;
    configured: boolean;
    message: string;
  };
}

export type WorkMatchDataMutation =
  | {
      type: 'commit_import';
      records: ImportReviewRecord[];
      sourceName?: string;
    }
  | {
      type: 'update_task_status';
      taskId: string;
      status: TaskStatus;
    }
  | {
      type: 'approve_assignment';
      taskId: string;
      employeeId: string;
      nextTaskStatus: TaskStatus;
      matchScore?: number;
      matchLabel?: string;
    }
  | {
      type: 'approve_assignments';
      taskId: string;
      employeeIds: string[];
      nextTaskStatus: TaskStatus;
    }
  | {
      type: 'update_employee_profile';
      employeeId: string;
      employee: Employee;
    }
  | {
      type: 'update_settings';
      settings: WorkMatchSettings;
    };

export async function fetchWorkMatchData(signal?: AbortSignal): Promise<WorkMatchDataSnapshot> {
  const response = await fetch('/api/workmatch/data', { signal });
  if (!response.ok) {
    throw new Error(`WorkMatch data load failed with ${response.status}.`);
  }
  return response.json();
}

export async function mutateWorkMatchData(mutation: WorkMatchDataMutation): Promise<WorkMatchDataSnapshot> {
  const response = await fetch('/api/workmatch/data', {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(mutation),
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `WorkMatch data mutation failed with ${response.status}.`);
  }

  return response.json();
}
