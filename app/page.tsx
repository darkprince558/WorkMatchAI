'use client';

import { useEffect, useMemo, useState } from 'react';
import Sidebar from '@/components/Sidebar';
import Header from '@/components/Header';
import DashboardView from '@/components/views/DashboardView';
import EmployeePortalView from '@/components/views/EmployeePortalView';
import EmployeesView from '@/components/views/EmployeesView';
import TasksView from '@/components/views/TasksView';
import MatchingView from '@/components/views/MatchingView';
import ImportView from '@/components/views/ImportView';
import SettingsView from '@/components/views/SettingsView';
import DocumentsView from '@/components/views/DocumentsView';
import { mockEmployees, mockTasks } from '@/lib/mock-data';
import { fetchWorkMatchData, mutateWorkMatchData } from '@/lib/workmatch-data';
import { initialWorkMatchSettings, type ManagerPriorityMode, type WorkMatchSettings } from '@/lib/settings';
import type { Employee, ImportReviewRecord, ImportTarget, ManagerPriorityWeights, Task, TaskStatus, WorkMatchDocument } from '@/lib/types';
import { generateMatches, upsertEmployees, upsertTasks } from '@/lib/workmatch';
import { getProjectDocuments } from '@/lib/document-vault';

const documentVaultStorageKey = 'workmatch-document-vault-v1';

type WorkMatchSessionUser = {
  userId?: string;
  employeeId?: string;
  email?: string;
  name?: string;
  role?: string;
};

type QueuedImportUpload = {
  id: string;
  files: File[];
  documents?: WorkMatchDocument[];
  target: ImportTarget;
  context?: {
    taskId?: string;
    taskName?: string;
  };
};

export default function Home() {
  const [currentView, setCurrentView] = useState('dashboard');
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [employees, setEmployees] = useState<Employee[]>(mockEmployees);
  const [tasks, setTasks] = useState<Task[]>(mockTasks);
  const [settings, setSettings] = useState<WorkMatchSettings>(initialWorkMatchSettings);
  const [focusedEmployeeId, setFocusedEmployeeId] = useState<string | null>(null);
  const [focusedTaskId, setFocusedTaskId] = useState<string | null>(null);
  const [persistenceStatus, setPersistenceStatus] = useState('Loading saved workspace data...');
  const [sessionUser, setSessionUser] = useState<WorkMatchSessionUser | null>(null);
  const [sessionLoaded, setSessionLoaded] = useState(false);
  const [queuedImportUpload, setQueuedImportUpload] = useState<QueuedImportUpload | null>(null);
  const employeePortalEmployee = useMemo(
    () => (sessionLoaded ? resolveEmployeeForSession(employees, sessionUser) : undefined),
    [employees, sessionLoaded, sessionUser]
  );
  const matches = useMemo(
    () => generateMatches(tasks, employees, { priorityWeights: getPriorityWeights(settings.defaultManagerPriority) }),
    [tasks, employees, settings.defaultManagerPriority]
  );

  useEffect(() => {
    queueMicrotask(() => setIsSidebarOpen(window.matchMedia('(min-width: 768px)').matches));
  }, []);

  useEffect(() => {
    const controller = new AbortController();

    fetch('/api/auth/session', { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: { user?: WorkMatchSessionUser } | undefined) => {
        setSessionUser(payload?.user ?? null);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setSessionUser(null);
      })
      .finally(() => setSessionLoaded(true));

    return () => controller.abort();
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchWorkMatchData(controller.signal)
      .then((snapshot) => {
        setEmployees(snapshot.employees);
        setTasks(mergeStoredProjectDocuments(snapshot.tasks));
        setSettings(snapshot.settings);
        setPersistenceStatus(snapshot.persistence.message);
      })
      .catch((error) => {
        if (error instanceof Error && error.name === 'AbortError') return;
        setPersistenceStatus('Using local workspace data because the saved workspace could not be loaded.');
      });

    return () => controller.abort();
  }, []);

  const applySnapshot = (snapshot: Awaited<ReturnType<typeof fetchWorkMatchData>>) => {
    setEmployees(snapshot.employees);
    setTasks(mergeStoredProjectDocuments(snapshot.tasks));
    setSettings(snapshot.settings);
    setPersistenceStatus(snapshot.persistence.message);
  };

  const persistMutation = (mutation: Parameters<typeof mutateWorkMatchData>[0]) => {
    mutateWorkMatchData(mutation)
      .then(applySnapshot)
      .catch(() => setPersistenceStatus('Saved locally for this session; durable persistence did not accept the latest change.'));
  };

  const updateSettings = (updates: Partial<WorkMatchSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...updates };
      persistMutation({ type: 'update_settings', settings: next });
      return next;
    });
  };

  const updateTaskStatus = (taskId: string, status: TaskStatus) => {
    setTasks((current) => current.map((task) => (task.id === taskId ? { ...task, status } : task)));
    persistMutation({ type: 'update_task_status', taskId, status });
  };

  const approveMatches = (taskId: string, employeeIds: string[]) => {
    const task = tasks.find((item) => item.id === taskId);
    const nextAssignedEmployeeIds = Array.from(new Set([...(task?.assignedEmployeeIds ?? []), ...employeeIds])).slice(0, task?.teamSize ?? 1);
    const nextStatus: TaskStatus = task && nextAssignedEmployeeIds.length >= task.teamSize ? 'In Progress' : 'Ready to Staff';

    setTasks((current) =>
      current.map((task) => {
        if (task.id !== taskId) return task;
        const assignedEmployeeIds = Array.from(new Set([...(task.assignedEmployeeIds ?? []), ...employeeIds])).slice(0, task.teamSize);
        return {
          ...task,
          assignedEmployeeIds,
          status: assignedEmployeeIds.length >= task.teamSize ? 'In Progress' : 'Ready to Staff',
        };
      })
    );
    persistMutation({ type: 'approve_assignments', taskId, employeeIds, nextTaskStatus: nextStatus });
  };

  const approveMatch = (taskId: string, employeeId: string) => {
    approveMatches(taskId, [employeeId]);
  };

  const updateEmployeeProfile = (employee: Employee) => {
    setEmployees((current) => current.map((item) => (item.id === employee.id ? employee : item)));
    persistMutation({ type: 'update_employee_profile', employeeId: employee.id, employee });
  };

  const openEmployeeProfile = (employeeId: string) => {
    setFocusedEmployeeId(employeeId);
    setCurrentView('employees');
  };

  const openTaskDetails = (taskId: string) => {
    setFocusedTaskId(taskId);
    setCurrentView('tasks');
  };

  const queueProjectUpload = async (files: FileList | File[], context?: QueuedImportUpload['context']) => {
    const fileList = Array.from(files);
    if (!fileList.length) return;
    const documents = context?.taskId ? await buildQueuedProjectDocuments(fileList, context).catch(() => []) : [];

    if (context?.taskId && documents.length) {
      setTasks((current) => {
        const task = current.find((item) => item.id === context.taskId);
        if (!task) return current;
        const nextTasks = upsertTasks(current, [{ ...task, sourceDocuments: documents }]);
        persistStoredProjectDocuments(nextTasks);
        return nextTasks;
      });
    }

    setQueuedImportUpload({
      id: `${Date.now()}-${fileList.map((file) => file.name).join('|')}`,
      files: fileList,
      documents,
      target: 'task',
      context,
    });
    setCurrentView('imports');
  };

  const commitImports = (records: ImportReviewRecord[]) => {
    const recordsWithDocuments = records.map((record) =>
      record.type === 'task'
        ? {
            ...record,
            entity: attachImportDocument(record.entity as Task, record),
          }
        : record
    );
    const incomingEmployees = recordsWithDocuments.filter((record) => record.type === 'employee').map((record) => record.entity as Employee);
    const incomingTasks = recordsWithDocuments
      .filter((record) => record.type === 'task')
      .map((record) => record.entity as Task);

    setEmployees((current) => upsertEmployees(current, incomingEmployees));
    setTasks((current) => {
      const nextTasks = upsertTasks(current, incomingTasks);
      persistStoredProjectDocuments(nextTasks);
      return nextTasks;
    });
    setCurrentView('dashboard');
    persistMutation({ type: 'commit_import', records: recordsWithDocuments, sourceName: recordsWithDocuments[0]?.sourceFile });
  };

  return (
    <div className="flex h-screen w-full bg-gray-50 font-sans text-gray-900 overflow-hidden">
      <Sidebar currentView={currentView} setView={setCurrentView} isOpen={isSidebarOpen} />
      {isSidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 z-10 bg-gray-900/30 md:hidden"
        />
      )}
      
      <div className="flex-1 flex flex-col min-w-0">
        <Header
          setView={setCurrentView}
          toggleSidebar={() => setIsSidebarOpen(!isSidebarOpen)}
          employees={employees}
          tasks={tasks}
          openEmployeeProfile={openEmployeeProfile}
          openTaskDetails={openTaskDetails}
        />
        
        <main className="flex-1 overflow-y-auto px-4 md:px-6 lg:px-8 py-6 relative flex flex-col">
          {currentView === 'dashboard' && <DashboardView employees={employees} tasks={tasks} matches={matches} persistenceStatus={persistenceStatus} />}
          {currentView === 'employee-portal' && (
            <EmployeePortalView
              employee={employeePortalEmployee}
              profileLoading={!sessionLoaded}
              profileOwnerName={sessionUser?.name ?? sessionUser?.email}
              tasks={tasks}
              onUpdateEmployee={updateEmployeeProfile}
              onOpenTask={openTaskDetails}
            />
          )}
          {currentView === 'employees' && <EmployeesView employees={employees} focusedEmployeeId={focusedEmployeeId} onFocusedEmployeeHandled={() => setFocusedEmployeeId(null)} />}
          {currentView === 'tasks' && (
            <TasksView
              tasks={tasks}
              employees={employees}
              updateTaskStatus={updateTaskStatus}
              setView={setCurrentView}
              queueProjectUpload={queueProjectUpload}
              focusedTaskId={focusedTaskId}
              onFocusedTaskHandled={() => setFocusedTaskId(null)}
            />
          )}
          {currentView === 'documents' && <DocumentsView tasks={tasks} onOpenTask={openTaskDetails} />}
          {currentView === 'matching' && (
            <MatchingView
              tasks={tasks}
              employees={employees}
              matches={matches}
              approveMatch={approveMatch}
              approveMatches={approveMatches}
              priorityMode={settings.defaultManagerPriority}
              setPriorityMode={(priorityMode) => updateSettings({ defaultManagerPriority: priorityMode })}
              requireReview={settings.requireReview}
              showAuditTrail={settings.showAuditTrail}
            />
          )}
          {currentView === 'imports' && (
            <ImportView
              commitImports={commitImports}
              existingEmployees={employees}
              existingTasks={tasks}
              confidenceThreshold={settings.importConfidenceThreshold}
              setConfidenceThreshold={(importConfidenceThreshold) => updateSettings({ importConfidenceThreshold })}
              requireReview={settings.requireReview}
              showAuditTrail={settings.showAuditTrail}
              enabledDataSources={settings.enabledDataSources}
              queuedUpload={queuedImportUpload}
              onQueuedUploadHandled={(id) => {
                setQueuedImportUpload((current) => (current?.id === id ? null : current));
              }}
            />
          )}
          {currentView === 'settings' && <SettingsView settings={settings} updateSettings={updateSettings} />}
          
          {/* Fallback for unexpected view state. */}
          {(currentView !== 'dashboard' && 
            currentView !== 'employee-portal' &&
            currentView !== 'employees' && 
            currentView !== 'tasks' && 
            currentView !== 'documents' &&
            currentView !== 'matching' && 
            currentView !== 'imports' &&
            currentView !== 'settings') && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400 font-medium">
              Select a module from the navigation.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

function attachImportDocument(task: Task, record: ImportReviewRecord): Task {
  const sourceDocument = record.sourceDocument;
  const linkedAt = new Date().toISOString();
  const document: WorkMatchDocument = {
    ...sourceDocument,
    id: sourceDocument?.id ?? `${task.id}:${record.sourceFile}:${record.id}`,
    fileName: sourceDocument?.fileName ?? record.sourceFile,
    mimeType: sourceDocument?.mimeType,
    sizeBytes: sourceDocument?.sizeBytes,
    linkedAt,
    targetType: 'task',
    targetId: task.id,
    targetName: task.name,
    sourceRecordId: record.id,
    dataUrl: sourceDocument?.dataUrl,
    storagePath: sourceDocument?.storagePath ?? `browser-vault/${task.id}/${record.sourceFile}`,
    note: sourceDocument?.dataUrl ? 'Stored binary file from confirmed import update' : 'Confirmed import update',
  };

  return {
    ...task,
    sourceDocuments: [document],
  };
}

async function buildQueuedProjectDocuments(files: File[], context: NonNullable<QueuedImportUpload['context']>) {
  const linkedAt = new Date().toISOString();

  return Promise.all(
    files.map(async (file, index) => ({
      id: `${context.taskId}:${linkedAt}:${index}:${slugify(file.name)}`,
      fileName: file.name,
      mimeType: file.type || 'application/octet-stream',
      sizeBytes: file.size,
      linkedAt,
      targetType: 'task' as const,
      targetId: context.taskId,
      targetName: context.taskName,
      dataUrl: await readFileAsDataUrl(file),
      storagePath: `browser-vault/${context.taskId}/${linkedAt}/${slugify(file.name)}`,
      note: 'Stored from project window upload',
    }))
  );
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : '');
    reader.onerror = () => reject(reader.error ?? new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80) || 'file';
}

function mergeStoredProjectDocuments(tasks: Task[]) {
  if (typeof window === 'undefined') return tasks;

  const storedDocuments = readStoredProjectDocuments();
  if (!storedDocuments.length) return tasks;

  return tasks.map((task) => {
    const sourceDocuments = storedDocuments.filter((document) => document.targetType === 'task' && document.targetId === task.id);
    return sourceDocuments.length ? { ...task, sourceDocuments: upsertTasks([task], [{ ...task, sourceDocuments }])[0].sourceDocuments } : task;
  });
}

function persistStoredProjectDocuments(tasks: Task[]) {
  if (typeof window === 'undefined') return;

  try {
    const documents = getProjectDocuments(tasks);
    window.localStorage.setItem(documentVaultStorageKey, JSON.stringify(documents));
  } catch {
    // Keep the in-memory vault even if browser storage quota is exceeded.
  }
}

function readStoredProjectDocuments(): WorkMatchDocument[] {
  try {
    const storedValue = window.localStorage.getItem(documentVaultStorageKey);
    if (!storedValue) return [];
    const documents = JSON.parse(storedValue) as WorkMatchDocument[];
    return Array.isArray(documents) ? documents.filter((document) => document.id && document.fileName) : [];
  } catch {
    return [];
  }
}

function getPriorityWeights(priorityMode: ManagerPriorityMode): ManagerPriorityWeights | undefined {
  switch (priorityMode) {
    case 'skills':
      return { skillFit: 2.3, availability: 0.9, growth: 0.8 };
    case 'availability':
      return { availability: 2.5, urgency: 1.2 };
    case 'speed':
      return { urgency: 2.4, availability: 1.8, skillFit: 0.9 };
    case 'growth':
      return { growth: 2.5, skillFit: 1.2, experience: 0.8 };
    default:
      return undefined;
  }
}

function resolveEmployeeForSession(employees: Employee[], sessionUser: WorkMatchSessionUser | null) {
  if (!employees.length) return undefined;
  if (!sessionUser) return employees[0];

  const explicitEmployeeId = normalizeLookupValue(sessionUser.employeeId);
  if (explicitEmployeeId) {
    const employee = employees.find((item) => normalizeLookupValue(item.id) === explicitEmployeeId);
    if (employee) return employee;
  }

  const userId = normalizeLookupValue(sessionUser.userId);
  if (userId) {
    const employee = employees.find((item) => normalizeLookupValue(item.id) === userId);
    if (employee) return employee;
  }

  const normalizedName = normalizePersonLookupValue(sessionUser.name);
  if (normalizedName) {
    const employee = employees.find((item) => normalizePersonLookupValue(item.name) === normalizedName);
    if (employee) return employee;
  }

  const emailLocalPart = sessionUser.email?.split('@')[0]?.replace(/[._-]+/g, ' ');
  const normalizedEmailName = normalizePersonLookupValue(emailLocalPart);
  if (normalizedEmailName) {
    const employee = employees.find((item) => normalizePersonLookupValue(item.name) === normalizedEmailName);
    if (employee) return employee;
  }

  return undefined;
}

function normalizeLookupValue(value?: string) {
  return value?.trim().toLowerCase() || '';
}

function normalizePersonLookupValue(value?: string) {
  return value?.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim() || '';
}
