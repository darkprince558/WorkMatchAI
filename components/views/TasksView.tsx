'use client';

import { useEffect, useRef, useState } from 'react';
import { Employee, Task, TaskStatus } from '@/lib/types';
import { Calendar, Clock, MapPin, Plus, GripVertical, Sparkles, X, Users, Flag, Building2, UploadCloud, FileText, Download } from 'lucide-react';
import { requestAgentOutput } from '@/lib/agents/client';
import type { AgentOutputEnvelope, TaskSummaryOutput } from '@/lib/agents/contracts';
import { downloadWorkMatchDocument, formatFileSize } from '@/lib/document-vault';

type ProjectUploadContext = {
  taskId?: string;
  taskName?: string;
};

interface TasksViewProps {
  tasks: Task[];
  employees: Employee[];
  updateTaskStatus: (taskId: string, status: TaskStatus) => void;
  setView: (view: string) => void;
  queueProjectUpload: (files: FileList | File[], context?: ProjectUploadContext) => void;
  focusedTaskId?: string | null;
  onFocusedTaskHandled?: () => void;
}

export default function TasksView({ tasks, employees, updateTaskStatus, setView, queueProjectUpload, focusedTaskId, onFocusedTaskHandled }: TasksViewProps) {
  const [selectedTaskRecord, setSelectedTask] = useState<Task | null>(null);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [summaryByTask, setSummaryByTask] = useState<Record<string, AgentOutputEnvelope<TaskSummaryOutput>>>({});
  const [summaryLoadingId, setSummaryLoadingId] = useState<string | null>(null);
  const boardUploadInputRef = useRef<HTMLInputElement>(null);
  const drawerUploadInputRef = useRef<HTMLInputElement>(null);
  const columns: { title: string; status: TaskStatus; color: string }[] = [
    { title: 'New', status: 'New', color: 'border-blue-200 bg-blue-50/50 text-blue-800' },
    { title: 'Needs Review', status: 'Needs Review', color: 'border-amber-200 bg-amber-50/50 text-amber-800' },
    { title: 'Ready to Staff', status: 'Ready to Staff', color: 'border-purple-200 bg-purple-50/50 text-purple-800' },
    { title: 'In Progress', status: 'In Progress', color: 'border-emerald-200 bg-emerald-50/50 text-emerald-800' },
    { title: 'At Risk', status: 'At Risk', color: 'border-red-200 bg-red-50/50 text-red-800' },
  ];

  const getUrgencyColor = (urgency: string) => {
    switch(urgency) {
      case 'High': return 'bg-red-100 text-red-800 border-red-200';
      case 'Medium': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'Low': return 'bg-slate-100 text-slate-700 border-slate-200';
      default: return 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  const assignedEmployees = (task: Task) =>
    (task.assignedEmployeeIds ?? [])
      .map((id) => employees.find((employee) => employee.id === id))
      .filter(Boolean) as Employee[];
  const selectedTask = selectedTaskRecord ? tasks.find((item) => item.id === selectedTaskRecord.id) ?? selectedTaskRecord : null;
  const selectedTaskSummary = selectedTask ? summaryByTask[selectedTask.id] : undefined;
  const handleProjectUploadInput = (files: FileList | null, context?: ProjectUploadContext) => {
    if (!files?.length) return;
    queueProjectUpload(files, context);
  };

  useEffect(() => {
    if (!focusedTaskId) return;
    const task = tasks.find((item) => item.id === focusedTaskId);
    queueMicrotask(() => {
      if (task) setSelectedTask(task);
      onFocusedTaskHandled?.();
    });
  }, [focusedTaskId, onFocusedTaskHandled, tasks]);

  useEffect(() => {
    if (!selectedTask || summaryByTask[selectedTask.id]) return;

    const controller = new AbortController();
    queueMicrotask(() => setSummaryLoadingId(selectedTask.id));

    requestAgentOutput<TaskSummaryOutput>(
      'task_summary',
      {
        task: selectedTask,
        candidateEmployees: employees,
      },
      { signal: controller.signal }
    )
      .then((envelope) => {
        setSummaryByTask((current) => ({
          ...current,
          [selectedTask.id]: envelope,
        }));
      })
      .catch(() => undefined)
      .finally(() => {
        setSummaryLoadingId((current) => (current === selectedTask.id ? null : current));
      });

    return () => controller.abort();
  }, [employees, selectedTask, summaryByTask]);

  return (
    <div className="h-full flex flex-col">
      <div className="flex flex-col gap-4 lg:flex-row lg:justify-between lg:items-center mb-6 max-w-7xl mx-auto w-full px-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Tasks & Projects Board</h1>
          <p className="text-gray-500 text-sm mt-1">Track requirements and matching statuses across all initiatives</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={boardUploadInputRef}
            type="file"
            accept=".csv,.xls,.xlsx,.pdf,.doc,.docx"
            multiple
            className="hidden"
            onChange={(event) => {
              handleProjectUploadInput(event.target.files);
              event.currentTarget.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => boardUploadInputRef.current?.click()}
            className="flex items-center gap-2 border border-gray-200 bg-white text-gray-700 px-4 py-2 rounded-md text-sm font-medium hover:bg-gray-50 transition-[background-color,border-color]"
          >
            <UploadCloud className="w-4 h-4" /> Upload Docs
          </button>
          <button type="button" onClick={() => setView('imports')} className="flex items-center gap-2 bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-[background-color]">
            <Plus className="w-4 h-4" /> Import Project
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-x-auto pb-4 px-2">
        <div className="flex gap-4 h-full items-start max-w-7xl mx-auto w-full min-w-0">
          {columns.map(col => {
            const columnTasks = tasks.filter(t => t.status === col.status);
            
            return (
              <div
                key={col.status}
                onDragOver={(event) => event.preventDefault()}
                onDrop={() => {
                  if (draggedTaskId) updateTaskStatus(draggedTaskId, col.status);
                  setDraggedTaskId(null);
                }}
                className="flex-1 min-w-[220px] w-full max-w-[320px] flex flex-col h-full max-h-full bg-gray-50 rounded border border-gray-200"
              >
                <div className="p-3 border-b border-gray-200 flex items-center justify-between sticky top-0 bg-gray-50 rounded-t z-10">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-gray-800 text-sm">{col.title}</h3>
                    <span className="bg-white text-gray-500 text-xs font-bold px-2 py-0.5 rounded shadow-sm border border-gray-200">
                      {columnTasks.length}
                    </span>
                  </div>
                </div>
                
                <div className="p-3 flex-1 overflow-y-auto space-y-3">
                  {columnTasks.map(task => (
                    <div 
                      key={task.id} 
                      draggable
                      onDragStart={() => setDraggedTaskId(task.id)}
                      onDragEnd={() => setDraggedTaskId(null)}
                      onClick={() => setSelectedTask(task)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          setSelectedTask(task);
                        }
                      }}
                      role="button"
                      tabIndex={0}
                      aria-label={`Open details for ${task.name}`}
                      className="bg-white p-4 rounded border border-gray-200 shadow-sm cursor-grab active:cursor-grabbing hover:border-gray-300 hover:shadow-md focus:outline-none focus:ring-2 focus:ring-red-500 transition-all group"
                    >
                      <div className="flex justify-between items-start mb-2 relative">
                        <div className="absolute -left-2 top-0 bottom-0 flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                            <GripVertical className="w-4 h-4 text-gray-300" />
                        </div>
                        <span className={`px-2 py-0.5 rounded text-[10px] uppercase tracking-wider font-bold border ${getUrgencyColor(task.urgency)}`}>
                          {task.urgency} Priority
                        </span>
                      </div>
                      
                      <h4 className="font-bold text-gray-900 leading-snug mb-3">{task.name}</h4>
                      <div className="flex flex-wrap items-center gap-2 mb-3 text-[10px] font-bold uppercase tracking-wide text-gray-500">
                        <span className="rounded bg-gray-50 border border-gray-200 px-2 py-1">{task.staffingMode ?? (task.teamSize > 1 ? 'Team' : 'One Employee')}</span>
                        <span className="rounded bg-gray-50 border border-gray-200 px-2 py-1">{task.teamSize} seat{task.teamSize === 1 ? '' : 's'}</span>
                        <span className="rounded bg-gray-50 border border-gray-200 px-2 py-1">{task.type ?? 'Project'}</span>
                      </div>
                      
                      <div className="space-y-2 mb-4">
                        <div className="flex items-center gap-2 text-xs text-gray-500 font-medium">
                          <Calendar className="w-3.5 h-3.5 text-gray-400" /> Due: {task.deadline}
                        </div>
                        <div className="flex justify-between items-center text-xs text-gray-500 font-medium">
                          <span className="flex items-center gap-2"><Clock className="w-3.5 h-3.5 text-gray-400" /> {task.estHours}h est.</span>
                          <span className="flex items-center gap-2"><MapPin className="w-3.5 h-3.5 text-gray-400" /> {task.remote ? 'Remote' : 'Office'}</span>
                        </div>
                      </div>

                      <div className="flex flex-wrap gap-1 mb-4">
                        {task.requiredSkills.slice(0, 3).map(s => (
                          <span key={s} className="px-2 py-1 bg-gray-100 text-gray-700 text-[10px] font-medium rounded border border-gray-200">
                            {s}
                          </span>
                        ))}
                        {task.requiredSkills.length > 3 && (
                          <span className="px-2 py-1 bg-white text-gray-500 text-[10px] font-medium rounded border border-gray-200">
                            +{task.requiredSkills.length - 3} required
                          </span>
                        )}
                      </div>

                      <div className="pt-3 flex justify-between items-center border-t border-gray-100">
                         {(task.assignedEmployeeIds?.length ?? 0) === 0 && (task.status === 'Ready to Staff' || task.status === 'Needs Review') ? (
                            <button type="button" onClick={(event) => { event.stopPropagation(); setView('matching'); }} className="flex items-center gap-1.5 text-xs font-bold text-red-600 bg-red-50 px-2 py-1 rounded cursor-pointer hover:bg-red-100 transition-colors">
                              <Sparkles className="w-3 h-3" /> Review matches ({task.teamSize})
                            </button>
                         ) : (
                           <div className="flex -space-x-2">
                            {Array.from({ length: task.teamSize }).map((_, i) => {
                              const employee = assignedEmployees(task)[i];
                              return (
                                <div key={`${task.id}-${i}`} className={`w-6 h-6 rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold ${employee ? 'bg-red-600 text-white' : 'bg-gray-100 text-gray-400'}`}>
                                  {employee ? employee.name.split(' ').map(part => part[0]).join('').slice(0, 2) : '?'}
                                </div>
                              );
                            })}
                           </div>
                         )}
                         <span className="text-[10px] font-bold text-gray-500">
                          {(task.assignedEmployeeIds?.length ?? 0)}/{task.teamSize} staffed
                         </span>
                      </div>
                    </div>
                  ))}
                  
                  {columnTasks.length === 0 && (
                    <div className="h-24 border-2 border-dashed border-gray-200 rounded flex items-center justify-center text-sm font-medium text-gray-400">
                      Drop tasks here
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
      {selectedTask && (
        <div role="dialog" aria-modal="true" aria-label={`${selectedTask.name} task details`} className="fixed top-16 right-0 bottom-0 w-[420px] bg-white border-l border-gray-200 shadow-2xl z-30 flex flex-col">
          <div className="p-5 border-b border-gray-200 flex items-start justify-between bg-gray-50">
            <div>
              <h2 className="font-bold text-xl text-gray-900 leading-tight">{selectedTask.name}</h2>
              <p className="text-xs text-gray-500 mt-1">{selectedTask.type ?? 'Project'} - {selectedTask.seniority ?? 'Any seniority'}</p>
            </div>
            <button type="button" onClick={() => setSelectedTask(null)} aria-label="Close task details" className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-5 space-y-6 overflow-y-auto">
            <div className="bg-red-50 border border-red-100 rounded p-4">
              <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="w-4 h-4 text-red-600" />
                  <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">AI Task Profile</span>
                </div>
                <span className="text-[10px] font-bold uppercase text-red-700">
                  {summaryLoadingId === selectedTask.id ? 'Working' : selectedTaskSummary ? 'Updated' : 'Ready'}
                </span>
              </div>
              <p className="text-xs text-gray-700 leading-relaxed">
                {selectedTaskSummary ? selectedTaskSummary.output.headline : buildTaskSummary(selectedTask, employees)}
              </p>
              {selectedTaskSummary && (
                <div className="mt-3 space-y-2 text-xs text-gray-700">
                  <p><strong>Need:</strong> {selectedTaskSummary.output.deliveryNeed}</p>
                  <p><strong>Coverage:</strong> {selectedTaskSummary.output.requiredCoverageSummary}</p>
                </div>
              )}
            </div>

            <div className="border border-dashed border-gray-300 rounded p-3">
              <input
                ref={drawerUploadInputRef}
                type="file"
                accept=".csv,.xls,.xlsx,.pdf,.doc,.docx"
                multiple
                className="hidden"
                onChange={(event) => {
                  handleProjectUploadInput(event.target.files, { taskId: selectedTask.id, taskName: selectedTask.name });
                  event.currentTarget.value = '';
                }}
              />
              <button
                type="button"
                onClick={() => drawerUploadInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 rounded bg-white px-3 py-2 text-sm font-bold text-gray-800 hover:bg-gray-50"
              >
                <UploadCloud className="w-4 h-4 text-red-600" /> Upload docs for this project
              </button>
            </div>

            <div className="border border-gray-200 rounded p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">Linked Documents</h3>
                <span className="text-[10px] font-bold text-gray-400">{selectedTask.sourceDocuments?.length ?? 0}</span>
              </div>
              <div className="space-y-2">
                {(selectedTask.sourceDocuments ?? []).length > 0 ? (
                  selectedTask.sourceDocuments?.map((document) => (
                    <div key={document.id} className="flex items-start justify-between gap-2 rounded border border-gray-100 bg-gray-50 px-2 py-2">
                      <div className="flex min-w-0 items-start gap-2">
                      <FileText className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-red-600" />
                      <div className="min-w-0">
                        <div className="truncate text-xs font-bold text-gray-900">{document.fileName}</div>
                        <div className="text-[11px] text-gray-500">
                          {formatFileSize(document.sizeBytes)} - {document.dataUrl ? 'stored' : 'metadata'} - {new Date(document.linkedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </div>
                      </div>
                      </div>
                      <button
                        type="button"
                        disabled={!document.dataUrl}
                        onClick={() => downloadWorkMatchDocument(document)}
                        aria-label={`Download ${document.fileName}`}
                        className="rounded border border-gray-200 bg-white p-1 text-gray-600 hover:bg-gray-50 disabled:cursor-not-allowed disabled:text-gray-300"
                      >
                        <Download className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))
                ) : (
                  <div className="rounded border border-dashed border-gray-200 px-3 py-3 text-xs text-gray-500">
                    No project documents linked yet.
                  </div>
                )}
              </div>
            </div>

            <div className="border border-gray-200 rounded p-3">
              <label htmlFor="task-board-status" className="text-[10px] text-gray-500 font-bold uppercase mb-1 block">Board Status</label>
              <select
                id="task-board-status"
                value={selectedTask.status}
                onChange={(event) => {
                  const nextStatus = event.target.value as TaskStatus;
                  updateTaskStatus(selectedTask.id, nextStatus);
                  setSelectedTask({ ...selectedTask, status: nextStatus });
                }}
                className="w-full px-3 py-2 border border-gray-200 rounded text-sm font-bold text-gray-900 bg-white"
              >
                {columns.map((column) => (
                  <option key={column.status} value={column.status}>{column.title}</option>
                ))}
              </select>
            </div>

            <p className="text-sm text-gray-700 leading-relaxed">{selectedTask.description ?? 'No description provided.'}</p>
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="border border-gray-200 rounded p-3">
                <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Deadline</div>
                <div className="font-bold text-gray-900 flex items-center gap-1.5"><Calendar className="w-3.5 h-3.5 text-gray-400" /> {selectedTask.deadline}</div>
              </div>
              <div className="border border-gray-200 rounded p-3">
                <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Urgency</div>
                <div className="font-bold text-gray-900 flex items-center gap-1.5"><Flag className="w-3.5 h-3.5 text-gray-400" /> {selectedTask.urgency}</div>
              </div>
              <div className="border border-gray-200 rounded p-3">
                <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Estimated Hours</div>
                <div className="font-bold text-gray-900 flex items-center gap-1.5"><Clock className="w-3.5 h-3.5 text-gray-400" /> {selectedTask.estHours}h</div>
              </div>
              <div className="border border-gray-200 rounded p-3">
                <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Location</div>
                <div className="font-bold text-gray-900 flex items-center gap-1.5"><MapPin className="w-3.5 h-3.5 text-gray-400" /> {selectedTask.location}</div>
              </div>
              <div className="border border-gray-200 rounded p-3">
                <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Staffing Mode</div>
                <div className="font-bold text-gray-900 flex items-center gap-1.5"><Users className="w-3.5 h-3.5 text-gray-400" /> {selectedTask.staffingMode ?? 'One Employee'}</div>
              </div>
              <div className="border border-gray-200 rounded p-3">
                <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Work Model</div>
                <div className="font-bold text-gray-900 flex items-center gap-1.5"><Building2 className="w-3.5 h-3.5 text-gray-400" /> {selectedTask.remote ? 'Remote eligible' : 'Onsite'}</div>
              </div>
            </div>
            <div className="border border-gray-200 rounded p-3">
              <div className="text-[10px] text-gray-500 font-bold uppercase mb-1">Team Size</div>
              <div className="text-sm font-bold text-gray-900">{selectedTask.teamSize} {selectedTask.teamSize === 1 ? 'person' : 'people'}</div>
            </div>
            <div>
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Required Skills</h3>
              <div className="space-y-2">
                {selectedTask.requiredSkills.map((item) => {
                  const supply = countQualifiedEmployees(employees, item);
                  return (
                    <div key={item} className="flex items-center justify-between gap-3 border border-gray-200 rounded px-3 py-2 text-xs">
                      <span className="font-bold text-gray-800">{item}</span>
                      <span className={supply > 0 ? 'font-bold text-green-700' : 'font-bold text-red-700'}>
                        {supply} qualified
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Optional Skills</h3>
              <div className="flex flex-wrap gap-2">
                {selectedTask.optionalSkills.length > 0 ? (
                  selectedTask.optionalSkills.map((item) => <span key={item} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs font-medium text-gray-700">{item}</span>)
                ) : (
                  <span className="text-xs text-gray-500">No optional skills listed.</span>
                )}
              </div>
            </div>
            <div>
              <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Assigned Team</h3>
              <div className="space-y-2">
                {assignedEmployees(selectedTask).map((employee) => (
                  <div key={employee.id} className="flex items-center gap-3 border border-gray-200 rounded p-2">
                    <img src={employee.avatar} alt="" className="w-8 h-8 rounded object-cover" />
                    <div>
                      <div className="text-sm font-bold text-gray-900">{employee.name}</div>
                      <div className="text-xs text-gray-500">{employee.role}</div>
                    </div>
                  </div>
                ))}
                {assignedEmployees(selectedTask).length === 0 && (
                  <button type="button" onClick={() => setView('matching')} className="w-full flex items-center justify-center gap-2 border border-dashed border-red-200 bg-red-50 text-red-700 rounded p-4 text-sm font-bold">
                    <Users className="w-4 h-4" /> Find matches
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function countQualifiedEmployees(employees: Employee[], skillName: string) {
  return employees.filter((employee) =>
    employee.availability > 0 && employee.skills.some((skill) => skill.name === skillName && skill.rating >= 6)
  ).length;
}

function buildTaskSummary(task: Task, employees: Employee[]) {
  const scarceSkills = task.requiredSkills.filter((skill) => countQualifiedEmployees(employees, skill) === 0);
  const staffingMode = task.staffingMode ?? (task.teamSize > 1 ? 'Team' : 'One Employee');
  const location = task.remote ? 'remote-capable' : `onsite in ${task.location}`;

  if (scarceSkills.length) {
    return `${task.name} is a ${task.urgency.toLowerCase()} priority ${staffingMode.toLowerCase()} assignment needing ${task.teamSize} seat(s). It is ${location}, due ${task.deadline}, and is blocked by scarce skill coverage in ${scarceSkills.slice(0, 2).join(' and ')}.`;
  }

  return `${task.name} is a ${task.urgency.toLowerCase()} priority ${staffingMode.toLowerCase()} assignment needing ${task.teamSize} seat(s), ${task.estHours} estimated hours, and ${location} delivery. Required skills have internal coverage; review capacity before approval.`;
}
