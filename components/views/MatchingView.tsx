'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Employee, Match, Task } from '@/lib/types';
import { Sparkles, CheckCircle2, AlertCircle, TrendingUp, Settings2, Check, ArrowRightLeft, GripVertical, UserPlus, X, ShieldCheck } from 'lucide-react';
import { formatMatchScoreLabel } from '@/lib/workmatch';
import type { ManagerPriorityMode } from '@/lib/settings';
import { requestAgentOutput } from '@/lib/agents/client';
import { matchToDeterministicScore } from '@/lib/agents/deterministic-score';
import type { AgentOutputEnvelope, MatchExplanationOutput } from '@/lib/agents/contracts';

interface MatchingViewProps {
  tasks: Task[];
  employees: Employee[];
  matches: Match[];
  approveMatch: (taskId: string, employeeId: string) => void;
  approveMatches: (taskId: string, employeeIds: string[]) => void;
  priorityMode: ManagerPriorityMode;
  setPriorityMode: (priorityMode: ManagerPriorityMode) => void;
  requireReview: boolean;
  showAuditTrail: boolean;
}

const priorityOptions: { id: ManagerPriorityMode; label: string; description: string }[] = [
  { id: 'balanced', label: 'Balanced', description: 'Use the current deterministic WorkMatch score.' },
  { id: 'skills', label: 'Skill Fit', description: 'Lift complete required-skill coverage and reduce missing-skill risk.' },
  { id: 'availability', label: 'Availability', description: 'Prefer people with enough near-term capacity to start.' },
  { id: 'speed', label: 'Delivery Speed', description: 'Favor available staff for urgent and near-deadline work.' },
  { id: 'growth', label: 'Growth Opportunity', description: 'Surface near-fit employees with manageable upskilling paths.' },
];
const rankingReferenceTime = new Date().getTime();

export default function MatchingView({
  tasks,
  employees,
  matches,
  approveMatch,
  approveMatches,
  priorityMode,
  setPriorityMode,
  requireReview,
  showAuditTrail,
}: MatchingViewProps) {
  const [viewMode, setViewMode] = useState<'task' | 'employee'>('task');
  const [showPriorities, setShowPriorities] = useState(false);
  const [compareMatchId, setCompareMatchId] = useState<string | null>(null);
  const [draggedEmployeeId, setDraggedEmployeeId] = useState<string | null>(null);
  const [bucketAssignments, setBucketAssignments] = useState<Record<string, string[]>>({});
  const [explanationsByMatch, setExplanationsByMatch] = useState<Record<string, AgentOutputEnvelope<MatchExplanationOutput>>>({});
  const [loadingExplanationIds, setLoadingExplanationIds] = useState<Record<string, boolean>>({});
  const isMountedRef = useRef(false);
  const requestedExplanationIdsRef = useRef<Set<string>>(new Set());
  const openTasks = useMemo(
    () => tasks.filter((task) => task.status === 'Ready to Staff' || task.status === 'Needs Review' || task.status === 'New' || task.status === 'At Risk'),
    [tasks]
  );
  const [selectedTaskId, setSelectedTaskId] = useState(openTasks[0]?.id ?? tasks[0]?.id);
  const [selectedEmployeeId, setSelectedEmployeeId] = useState(employees[0]?.id);
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? openTasks[0] ?? tasks[0],
    [openTasks, selectedTaskId, tasks]
  );
  const selectedEmployee = useMemo(
    () => employees.find((employee) => employee.id === selectedEmployeeId) ?? employees[0],
    [employees, selectedEmployeeId]
  );
  
  const adjustedScore = useCallback((match: Match) => {
    const employee = employees.find((item) => item.id === match.employeeId);
    const task = tasks.find((item) => item.id === match.taskId);
    if (!employee || !task) return match.score;

    const missingCount = match.missingSkills?.length ?? 0;
    const hasTrainingPath = Boolean(match.trainingSuggestion);
    const deadlineDays = Math.ceil((new Date(task.deadline).getTime() - rankingReferenceTime) / 86400000);
    const urgencyBoost = task.urgency === 'High' ? 8 : task.urgency === 'Medium' ? 4 : 0;

    switch (priorityMode) {
      case 'skills':
        return clampScore(match.score + (missingCount === 0 ? 10 : -missingCount * 6));
      case 'availability':
        return clampScore(Math.round(match.score * 0.65 + employee.availability * 0.35));
      case 'speed':
        return clampScore(Math.round(match.score * 0.55 + employee.availability * 0.3 + urgencyBoost + (deadlineDays <= 14 ? 7 : 0)));
      case 'growth':
        return clampScore(match.score + (hasTrainingPath && missingCount <= 2 ? 9 : 0) + (employee.readiness === 'Ready' ? 4 : -4) - Math.max(0, missingCount - 2) * 5);
      default:
        return match.score;
    }
  }, [employees, priorityMode, tasks]);

  const rankMatches = useCallback(
    (items: Match[]) => [...items].sort((a, b) => adjustedScore(b) - adjustedScore(a) || b.score - a.score),
    [adjustedScore]
  );

  const taskMatches = useMemo(() => rankMatches(matches.filter((match) => match.taskId === selectedTask?.id)), [matches, rankMatches, selectedTask?.id]);
  const employeeMatches = useMemo(() => rankMatches(matches.filter((match) => match.employeeId === selectedEmployee?.id)), [matches, rankMatches, selectedEmployee?.id]);
  const visibleMatches = useMemo(() => (viewMode === 'task' ? taskMatches : employeeMatches), [employeeMatches, taskMatches, viewMode]);
  const visibleExplanationMatches = useMemo(() => visibleMatches.slice(0, 3), [visibleMatches]);
  const selectedPriority = priorityOptions.find((item) => item.id === priorityMode) ?? priorityOptions[0];
  const suggestedBucket = selectedTask ? taskMatches.slice(0, selectedTask.teamSize).map((match) => match.employeeId) : [];
  const bucketEmployeeIds = selectedTask ? bucketAssignments[selectedTask.id] ?? suggestedBucket : [];
  const isTeamTask = viewMode === 'task' && selectedTask && (selectedTask.staffingMode === 'Team' || selectedTask.teamSize > 1);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const targets = visibleExplanationMatches
      .filter((match) => !requestedExplanationIdsRef.current.has(match.id))
      .map((match) => {
        const task = tasks.find((item) => item.id === match.taskId);
        const employee = employees.find((item) => item.id === match.employeeId);
        if (!task || !employee) return undefined;
        return { match, task, employee };
      })
      .filter(Boolean) as Array<{ match: Match; task: Task; employee: Employee }>;

    if (!targets.length) return;

    targets.forEach(({ match }) => requestedExplanationIdsRef.current.add(match.id));
    setLoadingExplanationIds((current) => ({
      ...current,
      ...Object.fromEntries(targets.map(({ match }) => [match.id, true])),
    }));

    targets.forEach(({ match, task, employee }) => {
      requestAgentOutput<MatchExplanationOutput>(
        'match_explanation',
        {
          task,
          candidateEmployees: [employee],
          deterministicScore: matchToDeterministicScore({ match, task, employee }),
          managerPriorities: priorityMode === 'balanced' ? undefined : { skillFit: priorityMode === 'skills' ? 2 : 1 },
        }
      )
        .then((envelope) => {
          if (!isMountedRef.current) return;
          setExplanationsByMatch((current) => ({
            ...current,
            [match.id]: envelope,
          }));
        })
        .catch(() => undefined)
        .finally(() => {
          if (!isMountedRef.current) return;
          setLoadingExplanationIds((current) => ({
            ...current,
            [match.id]: false,
          }));
        });
    });
  }, [employees, priorityMode, tasks, visibleExplanationMatches]);

  const addEmployeeToBucket = (employeeId: string) => {
    if (!selectedTask || !isTeamTask) return;
    setBucketAssignments((current) => {
      const existingBucket = current[selectedTask.id] ?? suggestedBucket;
      if (existingBucket.includes(employeeId) || existingBucket.length >= selectedTask.teamSize) return current;
      return {
        ...current,
        [selectedTask.id]: [...existingBucket, employeeId],
      };
    });
  };

  const removeEmployeeFromBucket = (employeeId: string) => {
    if (!selectedTask) return;
    setBucketAssignments((current) => {
      const existingBucket = current[selectedTask.id] ?? suggestedBucket;
      return {
        ...current,
        [selectedTask.id]: existingBucket.filter((id) => id !== employeeId),
      };
    });
  };

  const approveCurrentBucket = () => {
    if (!selectedTask) return;
    approveMatches(selectedTask.id, bucketEmployeeIds);
  };

  return (
    <div className="max-w-7xl mx-auto flex flex-col h-full bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
      
      {/* Header & Controls */}
      <div className="p-4 border-b border-gray-200 bg-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 relative overflow-hidden">
        <div className="absolute right-0 top-0 opacity-5 pointer-events-none">
          <Sparkles className="w-64 h-64 text-red-600 -mt-10 -mr-10" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-gray-900 tracking-tight flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-red-600" /> Match Recommendations
          </h1>
          <p className="text-gray-500 text-sm mt-1">Review workforce alignment using skills, availability, priority, and task constraints.</p>
          <div className="mt-2 flex flex-wrap gap-2 text-[10px] font-bold uppercase tracking-wider">
            <span className={`${requireReview ? 'bg-yellow-50 text-yellow-700 border-yellow-100' : 'bg-green-50 text-green-700 border-green-100'} border px-2 py-0.5 rounded`}>
              {requireReview ? 'Manager Review Gate' : 'Direct Assignment Allowed'}
            </span>
            {showAuditTrail && (
              <span className="bg-blue-50 text-blue-700 border border-blue-100 px-2 py-0.5 rounded">
                Audit Visible
              </span>
            )}
          </div>
        </div>
        
        <div className="flex items-center gap-3 relative z-10 w-full sm:w-auto">
          <div className="bg-white p-1 rounded border border-gray-200 flex shadow-sm">
             <button 
               type="button"
               className={`px-4 py-1.5 text-sm font-medium rounded transition-colors ${viewMode === 'task' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
               onClick={() => setViewMode('task')}
               aria-pressed={viewMode === 'task'}
             >
               Staff a Project
             </button>
             <button 
               type="button"
               className={`px-4 py-1.5 text-sm font-medium rounded transition-colors ${viewMode === 'employee' ? 'bg-gray-900 text-white shadow-sm' : 'text-gray-600 hover:text-gray-900'}`}
               onClick={() => setViewMode('employee')}
               aria-pressed={viewMode === 'employee'}
             >
               Find a Role
             </button>
          </div>
          <button
            type="button"
            onClick={() => setShowPriorities((current) => !current)}
            className={`p-2 border rounded shadow-sm transition-colors ${showPriorities ? 'border-red-200 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-600 hover:bg-gray-50'}`}
            aria-label="Toggle matching priority controls"
            aria-expanded={showPriorities}
            aria-controls="matching-priority-controls"
          >
             <Settings2 className="w-5 h-5" />
          </button>
          <div className="hidden lg:block bg-white border border-gray-200 rounded px-3 py-2 text-xs">
            <span className="font-bold text-gray-900">{selectedPriority.label}</span>
            <span className="text-gray-500"> priority</span>
          </div>
        </div>
      </div>

      <div id="matching-priority-controls" className={`${showPriorities ? 'border-b border-gray-200 bg-white p-4' : 'border-b border-gray-200 bg-white px-4 py-3'}`}>
        {!showPriorities && (
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-gray-900">Manager Priority: {selectedPriority.label}</h2>
              <p className="text-xs text-gray-500 mt-1">{selectedPriority.description}</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {priorityOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPriorityMode(option.id)}
                  aria-pressed={priorityMode === option.id}
                  className={`text-xs border rounded px-3 py-1.5 transition-colors ${
                    priorityMode === option.id ? 'border-red-600 bg-red-50 text-red-700 font-bold' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        )}
        {showPriorities && (
          <div className="max-w-5xl">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-3">
              <div>
                <h2 className="text-sm font-bold text-gray-900">Manager Priority</h2>
                <p className="text-xs text-gray-500 mt-1">{selectedPriority.description}</p>
              </div>
              <div className="text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded px-3 py-2">
                Priority changes reorder current recommendations using deterministic scoring weights; manager approval remains required before assignment.
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {priorityOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setPriorityMode(option.id)}
                  aria-pressed={priorityMode === option.id}
                  className={`text-left border rounded px-3 py-2 transition-colors ${
                    priorityMode === option.id ? 'border-red-600 bg-red-50 text-red-700' : 'border-gray-200 bg-white text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <span className="block text-xs font-bold">{option.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Column: Task List */}
        <div className="w-64 xl:w-80 flex-shrink-0 border-r border-gray-200 bg-gray-50 flex flex-col">
          <div className="p-4 py-3 border-b border-gray-200 font-bold text-sm text-gray-700 bg-gray-50 uppercase tracking-wider">
            {viewMode === 'task' ? 'Open Requirements' : 'Employees'}
          </div>
          <div className="flex-1 overflow-y-auto w-full p-2 space-y-1">
            {viewMode === 'task' && openTasks.map(task => (
              <button
                type="button"
                key={task.id}
                onClick={() => setSelectedTaskId(task.id)}
                aria-pressed={selectedTask?.id === task.id}
                className={`w-full text-left p-3 rounded border text-sm cursor-pointer transition-all ${
                  selectedTask?.id === task.id 
                    ? 'bg-white border-red-200 shadow-sm ring-1 ring-red-100' 
                    : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200 text-gray-600'
                }`}
              >
                <div className="font-bold mb-1 truncate text-gray-900">{task.name}</div>
                <div className="flex justify-between items-center text-xs opacity-80 mt-2 font-medium">
                  <span>Reqs: {task.teamSize}</span>
                  <span className={`${selectedTask?.id === task.id ? 'text-red-600' : ''}`}>{task.estHours} hrs</span>
                </div>
              </button>
            ))}
            {viewMode === 'employee' && employees.map(employee => (
              <button
                type="button"
                key={employee.id}
                onClick={() => setSelectedEmployeeId(employee.id)}
                aria-pressed={selectedEmployee?.id === employee.id}
                className={`w-full text-left p-3 rounded border text-sm cursor-pointer transition-all ${
                  selectedEmployee?.id === employee.id
                    ? 'bg-white border-red-200 shadow-sm ring-1 ring-red-100'
                    : 'bg-transparent border-transparent hover:bg-white hover:border-gray-200 text-gray-600'
                }`}
              >
                <div className="font-bold mb-1 truncate text-gray-900">{employee.name}</div>
                <div className="flex justify-between items-center text-xs opacity-80 mt-2 font-medium">
                  <span>{employee.role}</span>
                  <span className={selectedEmployee?.id === employee.id ? 'text-red-600' : ''}>{employee.availability}%</span>
                </div>
              </button>
            ))}
          </div>
        </div>

        {/* Right Column: AI Recommendations */}
        <div className="flex-1 overflow-y-auto bg-gray-50/50 p-6">
          <div className="max-w-3xl">
            {/* Task Context Card */}
            <div className="bg-white p-5 rounded border border-gray-200 shadow-sm mb-6 flex justify-between items-start">
               <div>
                 <h2 className="text-xl font-bold text-gray-900">{viewMode === 'task' ? selectedTask?.name : selectedEmployee?.name}</h2>
                 <p className="text-sm text-gray-500 mt-1 flex flex-wrap gap-2 font-medium">
                   <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200">
                    {viewMode === 'task' ? `Required: ${selectedTask?.requiredSkills.join(', ')}` : `${selectedEmployee?.role} - ${selectedEmployee?.availability}% capacity`}
                   </span>
                   {viewMode === 'task' && selectedTask && (
                    <span className="bg-red-50 text-red-700 px-2 py-0.5 rounded border border-red-100">
                      {selectedTask.teamSize} seat{selectedTask.teamSize === 1 ? '' : 's'} - {selectedTask.staffingMode ?? 'One Employee'}
                    </span>
                   )}
                 </p>
               </div>
               <div className="text-right">
                 <div className="text-2xl font-bold text-gray-900">{visibleMatches.length}</div>
                 <div className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">{selectedPriority.label} Rank</div>
               </div>
            </div>

            {/* Empty State vs Matches */}
            {visibleMatches.length === 0 ? (
               <div className="text-center p-12 bg-white rounded border border-dashed border-gray-300">
                  <AlertCircle className="w-10 h-10 text-gray-300 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-gray-700">No strong matches found</h3>
                  <p className="text-sm text-gray-500 max-w-md mx-auto mt-2">The AI could not find available staff meeting the required threshold for this task. Consider reducing skill constraints or utilizing external contractors.</p>
               </div>
            ) : (
              <div className="space-y-4">
                {isTeamTask && selectedTask && (
                  <div className="bg-gray-900 text-white rounded border border-gray-800 p-4 shadow-sm">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-3">
                      <div className="flex items-center gap-2 text-sm font-bold">
                        <Sparkles className="w-4 h-4 text-red-400" /> Project Bucket: {selectedTask.name}
                      </div>
                      <button
                        type="button"
                        onClick={approveCurrentBucket}
                        disabled={bucketEmployeeIds.length === 0}
                        className="inline-flex items-center justify-center gap-2 rounded bg-white text-gray-900 px-3 py-1.5 text-xs font-bold disabled:opacity-50"
                      >
                        <Check className="w-3.5 h-3.5" /> {requireReview ? 'Approve Bucket' : 'Assign Bucket'}
                      </button>
                    </div>
                    <div
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggedEmployeeId) addEmployeeToBucket(draggedEmployeeId);
                        setDraggedEmployeeId(null);
                      }}
                      className="grid grid-cols-1 sm:grid-cols-3 gap-3"
                    >
                      {Array.from({ length: selectedTask.teamSize }).map((_, index) => {
                        const employeeId = bucketEmployeeIds[index];
                        const employee = employees.find((item) => item.id === employeeId);
                        const match = taskMatches.find((item) => item.employeeId === employeeId);
                        return (
                          <div
                            key={`bucket-${selectedTask.id}-${index}`}
                            draggable={Boolean(employee)}
                            onDragStart={() => employee && setDraggedEmployeeId(employee.id)}
                            onDragEnd={() => setDraggedEmployeeId(null)}
                            className="min-h-[76px] bg-white/10 border border-white/10 rounded p-3"
                          >
                            {employee ? (
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="text-sm font-bold truncate">{employee.name}</div>
                                  <div className="text-xs text-gray-300">{match ? formatMatchScoreLabel(match) : 'Manual placement'}</div>
                                  <div className="text-[10px] text-gray-400 mt-1">{employee.availability}% capacity</div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => removeEmployeeFromBucket(employee.id)}
                                  className="p-1 rounded text-gray-300 hover:text-white hover:bg-white/10"
                                  aria-label={`Remove ${employee.name} from project bucket`}
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            ) : (
                              <div className="h-full flex items-center justify-center text-xs text-gray-400 border border-dashed border-white/20 rounded">
                                Drop employee here
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div
                      onDragOver={(event) => event.preventDefault()}
                      onDrop={(event) => {
                        event.preventDefault();
                        if (draggedEmployeeId) removeEmployeeFromBucket(draggedEmployeeId);
                        setDraggedEmployeeId(null);
                      }}
                      className="mt-3 border border-white/10 bg-white/5 rounded p-3 text-xs text-gray-300 flex items-center gap-2"
                    >
                      <UserPlus className="w-4 h-4" /> Drag recommendations into the bucket, or drop bucket members here to return them to the recommendation list.
                    </div>
                  </div>
                )}
                {visibleMatches.map((match, idx) => {
                  const emp = employees.find(e => e.id === match.employeeId)!;
                  const task = tasks.find(t => t.id === match.taskId)!;
                  const isTopMatch = idx === 0;
                  const isAssigned = task.assignedEmployeeIds?.includes(emp.id);
                  const liveExplanation = explanationsByMatch[match.id];
                  const explanationStatus = loadingExplanationIds[match.id]
                    ? 'Working'
                    : liveExplanation
                      ? 'Updated'
                      : 'Ready';
                  const explanationText = liveExplanation?.output.explanation.summary ?? match.aiExplanation;

                  return (
                    <div
                      key={match.id}
                      draggable={viewMode === 'task'}
                      onDragStart={() => setDraggedEmployeeId(emp.id)}
                      onDragEnd={() => setDraggedEmployeeId(null)}
                      className={`bg-white rounded border ${isTopMatch ? 'border-red-200 shadow-md relative overflow-hidden' : 'border-gray-200 shadow-sm'}`}
                    >
                      {isTopMatch && (
                        <div className="absolute top-0 left-0 w-1 h-full bg-red-600"></div>
                      )}
                      <div className="p-5">
                        
                        <div className="flex flex-col sm:flex-row justify-between items-start mb-4 gap-4">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 rounded border border-gray-200 shadow-sm overflow-hidden flex-shrink-0">
                               <img src={emp.avatar} alt="" className="w-full h-full object-cover" />
                            </div>
                            <div className="min-w-0">
                               <div className="flex flex-wrap items-center gap-2">
                                 <h3 className="font-bold text-gray-900 text-base md:text-lg truncate">{viewMode === 'task' ? emp.name : task.name}</h3>
                                 {viewMode === 'task' && <GripVertical className="w-4 h-4 text-gray-300" />}
                                 {isTopMatch && <span className="bg-red-50 border border-red-100 text-red-600 text-[10px] uppercase font-bold px-2 py-0.5 rounded flex items-center gap-1"><Sparkles className="w-3 h-3"/> Top Match</span>}
                                 {match.aiRecommended && <span className="bg-gray-900 text-white text-[10px] uppercase font-bold px-2 py-0.5 rounded flex items-center gap-1"><Sparkles className="w-3 h-3"/> AI Recommended</span>}
                               </div>
                               <p className="text-sm font-medium text-gray-500 truncate">
                                {viewMode === 'task' ? emp.role : `${task.type ?? 'Project'} - ${task.deadline} - ${task.teamSize} seat${task.teamSize === 1 ? '' : 's'}`}
                               </p>
                            </div>
                          </div>
                          
                          <div className="flex flex-row sm:flex-col items-center sm:items-end gap-2 sm:gap-0 w-full sm:w-auto bg-gray-50 sm:bg-transparent p-2 sm:p-0 rounded border sm:border-transparent border-gray-100">
                            <div className="flex items-baseline gap-1">
                               <span className="text-2xl sm:text-3xl font-black text-red-600 tracking-tighter">{match.score}</span>
                               <span className="text-xs sm:text-sm font-bold text-gray-400">%</span>
                            </div>
                            <span className="text-[10px] tracking-wider font-bold text-gray-700">{formatMatchScoreLabel(match)}</span>
                            {priorityMode !== 'balanced' && (
                              <span className="text-[10px] font-bold text-gray-500">Priority fit: {adjustedScore(match)}%</span>
                            )}
                          </div>
                        </div>

                        {/* AI Explanation Box */}
                        <div className="bg-white rounded p-4 border border-gray-100 text-xs mb-4 shadow-sm flex items-start gap-2">
                           <Sparkles className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                           <div className="flex-1">
                             <p className="text-gray-700 leading-relaxed">
                              <strong className="text-gray-900">Recommendation Basis:</strong> {explanationText}
                              <span className="ml-2 text-[10px] font-bold uppercase text-blue-700">{explanationStatus}</span>
                             </p>
                             
                             <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
                               {match.factors.map((f, i) => (
                                 <div key={i} className="flex gap-2">
                                   {f.type === 'positive' ? <CheckCircle2 className="w-4 h-4 text-green-500 flex-shrink-0 mt-0.5" /> : 
                                    f.type === 'warning' ? <AlertCircle className="w-4 h-4 text-yellow-500 flex-shrink-0 mt-0.5" /> : 
                                    <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />}
                                   <div>
                                     <span className="font-bold text-gray-800 text-[11px] block">{f.label}</span>
                                     <span className="text-gray-500 text-[11px] block truncate" title={f.description}>{f.description}</span>
                                   </div>
                                 </div>
                               ))}
                             </div>

                             {match.trainingSuggestion && (
                               <div className="mt-4 flex gap-2 items-start bg-blue-50 text-blue-800 p-3 rounded border border-blue-100">
                                 <TrendingUp className="w-4 h-4 flex-shrink-0 mt-0.5" />
                                 <p><strong>Upskill Opportunity:</strong> {match.trainingSuggestion}</p>
                               </div>
                             )}
                             {(match.missingSkills?.length ?? 0) > 0 && (
                               <div className="mt-3 flex flex-wrap gap-2">
                                 {match.missingSkills?.map((skill) => (
                                   <span key={skill} className="rounded bg-red-50 border border-red-100 px-2 py-1 text-[11px] font-bold text-red-700">
                                     Missing: {skill}
                                   </span>
                                 ))}
                               </div>
                             )}
                             {showAuditTrail && (
                               <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-2">
                                 <div className="border border-gray-100 bg-gray-50 rounded p-2">
                                   <div className="text-[10px] font-bold uppercase text-gray-500">Priority</div>
                                   <div className="text-[11px] font-bold text-gray-800">{selectedPriority.label}</div>
                                 </div>
                                 <div className="border border-gray-100 bg-gray-50 rounded p-2">
                                   <div className="text-[10px] font-bold uppercase text-gray-500">Review</div>
                                   <div className="text-[11px] font-bold text-gray-800">{requireReview ? 'Required' : 'Relaxed'}</div>
                                 </div>
                                 <div className="border border-gray-100 bg-gray-50 rounded p-2">
                                   <div className="text-[10px] font-bold uppercase text-gray-500">Label</div>
                                   <div className="text-[11px] font-bold text-gray-800">{formatMatchScoreLabel(match)}</div>
                                 </div>
                               </div>
                             )}
                           </div>
                        </div>

                        {compareMatchId === match.id && (
                          <div className="mb-4 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                            <div className="border border-gray-200 rounded p-3 bg-gray-50">
                              <div className="font-bold text-gray-500 uppercase text-[10px] mb-1">Base Score</div>
                              <div className="text-gray-900 font-bold">{match.score}%</div>
                            </div>
                            <div className="border border-gray-200 rounded p-3 bg-gray-50">
                              <div className="font-bold text-gray-500 uppercase text-[10px] mb-1">Priority Fit</div>
                              <div className="text-gray-900 font-bold">{adjustedScore(match)}%</div>
                            </div>
                            <div className="border border-gray-200 rounded p-3 bg-gray-50">
                              <div className="font-bold text-gray-500 uppercase text-[10px] mb-1">Manager Lens</div>
                              <div className="text-gray-900 font-bold">{selectedPriority.label}</div>
                            </div>
                          </div>
                        )}

                        {/* Action Bar */}
                        <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
                          {isTeamTask && (
                            <button
                              type="button"
                              onClick={() => addEmployeeToBucket(emp.id)}
                              disabled={bucketEmployeeIds.includes(emp.id) || bucketEmployeeIds.length >= (selectedTask?.teamSize ?? 0)}
                              className="text-[11px] border border-red-200 text-red-700 disabled:text-gray-400 disabled:border-gray-200 px-3 py-1.5 flex items-center gap-2 rounded"
                            >
                               <UserPlus className="w-3.5 h-3.5" /> {bucketEmployeeIds.includes(emp.id) ? 'In Bucket' : 'Add to Bucket'}
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setCompareMatchId(compareMatchId === match.id ? null : match.id)}
                            className="text-[11px] border border-gray-200 text-gray-600 hover:text-gray-900 px-3 py-1.5 flex items-center gap-2 rounded"
                          >
                             <ArrowRightLeft className="w-3.5 h-3.5" /> {compareMatchId === match.id ? 'Hide Compare' : 'Compare'}
                          </button>
                          <button
                            type="button"
                            onClick={() => approveMatch(match.taskId, match.employeeId)}
                            disabled={isAssigned}
                            className="bg-gray-900 disabled:bg-green-700 text-white px-4 py-1.5 rounded text-[11px] font-bold shadow-sm hover:bg-gray-800 transition-colors flex items-center gap-2"
                          >
                            {requireReview ? <Check className="w-3.5 h-3.5" /> : <ShieldCheck className="w-3.5 h-3.5" />}
                            {isAssigned ? 'Approved' : requireReview ? 'Approve Match' : 'Assign Match'}
                          </button>
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function clampScore(value: number) {
  return Math.max(1, Math.min(99, value));
}
