'use client';

import { type ComponentType, useEffect, useRef, useState } from 'react';
import { Users, Clock, AlertCircle, Cpu, ShieldAlert, AlertOctagon, RefreshCw, Lightbulb, TrendingDown, ChevronDown, ChevronUp, Maximize2, Minimize2, CheckCircle2, MessageSquare, Send } from 'lucide-react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, BarChart, Bar } from 'recharts';
import { Employee, Match, Task } from '@/lib/types';
import { bestMatchForTask, formatMatchScoreLabel, getDashboardMetrics, getDepartmentCapacity, getSkillGaps } from '@/lib/workmatch';
import { requestAgentOutput } from '@/lib/agents/client';
import type { AgentOutputEnvelope, DashboardInsightsOutput, ManagerCopilotOutput } from '@/lib/agents/contracts';

interface DashboardViewProps {
  employees: Employee[];
  tasks: Task[];
  matches: Match[];
  persistenceStatus?: string;
}

interface StatCardProps {
  title: string;
  value: string | number;
  sub: string;
  icon: ComponentType<{ className?: string }>;
  colorClass?: string;
  borderClass?: string;
  valueClass?: string;
  subClass?: string;
}

function StatCard({ title, value, sub, icon: Icon, colorClass, borderClass, valueClass, subClass }: StatCardProps) {
  return (
    <div className={`bg-white p-4 rounded border shadow-sm flex flex-col justify-between ${borderClass || 'border-gray-200'}`}>
      <div className="flex justify-between items-start mb-2">
        <p className="text-[11px] text-gray-500 font-medium">{title}</p>
        <Icon className={`w-4 h-4 ${colorClass || 'text-gray-400'}`} />
      </div>
      <div>
        <h3 className={`text-2xl font-bold mb-1 ${valueClass || 'text-gray-900'}`}>{value}</h3>
        <p className={`text-[11px] font-medium ${subClass || 'text-gray-500'}`}>{sub}</p>
      </div>
    </div>
  );
}

export default function DashboardView({ employees, tasks, matches, persistenceStatus }: DashboardViewProps) {
  const [availabilityChartRef, availabilityChartWidth] = useMeasuredChartWidth();
  const [trendChartRef, trendChartWidth] = useMeasuredChartWidth();
  const [expandedInsight, setExpandedInsight] = useState<string | null>('insight1');
  const [isInsightsFullscreen, setIsInsightsFullscreen] = useState(false);
  const [dashboardInsights, setDashboardInsights] = useState<AgentOutputEnvelope<DashboardInsightsOutput> | null>(null);
  const [dashboardInsightsLoading, setDashboardInsightsLoading] = useState(false);
  const [copilotQuestion, setCopilotQuestion] = useState('Which active staffing risks need attention first?');
  const [copilotResponse, setCopilotResponse] = useState<AgentOutputEnvelope<ManagerCopilotOutput> | null>(null);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const metrics = getDashboardMetrics(employees, tasks, matches);
  const skillGaps = getSkillGaps(employees, tasks);
  const departmentCapacity = getDepartmentCapacity(employees);
  const availabilityData = [
    { name: 'Available', value: employees.filter((employee) => getAvailabilityBand(employee) === 'Available').length },
    { name: 'Partial', value: employees.filter((employee) => getAvailabilityBand(employee) === 'Partial').length },
    { name: 'Busy', value: employees.filter((employee) => getAvailabilityBand(employee) === 'Busy').length },
  ];
  const demandSupplyData = getDemandSupplyData(employees, tasks);
  const strongMatches = matches.filter((match) => match.aiRecommended && match.score >= 80);
  const teamProjects = tasks.filter((task) => task.staffingMode === 'Team' || task.teamSize > 1);
  const atRiskTasks = tasks
    .filter((task) => task.status === 'At Risk' || (bestMatchForTask(matches, task.id)?.score ?? 100) < 55)
    .sort((a, b) => (bestMatchForTask(matches, a.id)?.score ?? 0) - (bestMatchForTask(matches, b.id)?.score ?? 0));
  const topAtRiskTask = tasks
    .filter((task) => task.status === 'At Risk' || (bestMatchForTask(matches, task.id)?.score ?? 100) < 55)
    .sort((a, b) => (bestMatchForTask(matches, a.id)?.score ?? 0) - (bestMatchForTask(matches, b.id)?.score ?? 0))[0];

  const insightsData = [
    {
      id: 'insight1',
      icon: AlertOctagon,
      iconColor: 'bg-red-100 text-red-600',
      title: skillGaps[0] ? `${skillGaps[0].name} Gap Detected` : 'No Critical Skill Gap',
      summary: skillGaps[0]
        ? `${skillGaps[0].needed} open demand vs ${skillGaps[0].available} available internal supply.`
        : 'Current staffing supply covers the active task portfolio.',
      details: skillGaps[0]
        ? `WorkMatch recommends reviewing near-fit employees and creating a short training plan for ${skillGaps[0].name}. If the deadline is fixed, consider external capacity for the uncovered ${skillGaps[0].gap} slot(s).`
        : 'The current sample portfolio has enough internal coverage for the highest-priority required skills.',
    },
    {
      id: 'insight2',
      icon: Lightbulb,
      iconColor: 'bg-blue-100 text-blue-600',
      title: 'High-Capacity Employees Available',
      summary: `${employees.filter((employee) => employee.availability >= 70).length} employees have at least 70% capacity for near-term staffing.`,
      details: 'Use the Matching tab to prioritize delivery fit, then approve assignments. The task board will move fully staffed projects into In Progress automatically.',
    },
    {
      id: 'insight3',
      icon: TrendingDown,
      iconColor: 'bg-orange-100 text-orange-600',
      title: 'Project Staffing Risks',
      summary: topAtRiskTask ? `${topAtRiskTask.name} is the most constrained project in the active portfolio.` : 'No active project is currently flagged as constrained.',
      details: topAtRiskTask
        ? `The best available match is ${bestMatchForTask(matches, topAtRiskTask.id)?.score ?? 0}%. Review missing skills and availability warnings before approval.`
        : 'Continue monitoring high-urgency tasks as imports add new demand.',
    }
  ];
  const agentInsightsData = dashboardInsights?.output.insights.map((insight) => ({
    id: insight.insightId,
    icon: insight.severity === 'critical' || insight.severity === 'risk' ? AlertOctagon : insight.type === 'training_opportunity' ? Lightbulb : TrendingDown,
    iconColor:
      insight.severity === 'critical' || insight.severity === 'risk'
        ? 'bg-red-100 text-red-600'
        : insight.severity === 'watch'
          ? 'bg-orange-100 text-orange-600'
          : 'bg-blue-100 text-blue-600',
    title: insight.headline,
    summary: insight.explanation,
    details: insight.recommendedActions.join(' '),
  }));
  const visibleInsights = agentInsightsData?.length ? agentInsightsData : insightsData;

  const trendData = [
    { name: 'Min', value: Math.min(...matches.map((match) => match.score), 0) },
    { name: 'Avg', value: Math.round(matches.reduce((sum, match) => sum + match.score, 0) / Math.max(matches.length, 1)) },
    { name: 'Top', value: Math.max(...matches.map((match) => match.score), 0) },
    { name: 'AI', value: Math.round((metrics.recommendedMatches / Math.max(matches.length, 1)) * 100) }
  ];

  useEffect(() => {
    const controller = new AbortController();
    const loadingFrame = window.requestAnimationFrame(() => {
      if (!controller.signal.aborted) setDashboardInsightsLoading(true);
    });

    requestAgentOutput<DashboardInsightsOutput>(
      'dashboard_insights',
      {
        snapshotScope: 'dashboard',
        snapshotId: 'workmatch-dashboard',
        metrics: [
          { metricName: 'totalEmployees', value: metrics.totalEmployees, calculationSource: 'deterministic_query' },
          { metricName: 'availableCapacity', value: metrics.availableCapacity, calculationSource: 'deterministic_query' },
          { metricName: 'openTasks', value: metrics.openTasks, calculationSource: 'deterministic_query' },
          { metricName: 'recommendedMatches', value: metrics.recommendedMatches, calculationSource: 'deterministic_score' },
          { metricName: 'skillGaps', value: metrics.skillGaps.length, calculationSource: 'deterministic_query' },
          { metricName: 'atRiskTasks', value: metrics.atRiskTasks, calculationSource: 'deterministic_score' },
        ],
        employees,
        tasks,
      },
      { signal: controller.signal }
    )
      .then(setDashboardInsights)
      .catch(() => undefined)
      .finally(() => {
        window.cancelAnimationFrame(loadingFrame);
        setDashboardInsightsLoading(false);
      });

    return () => {
      window.cancelAnimationFrame(loadingFrame);
      controller.abort();
    };
  }, [
    employees,
    tasks,
    metrics.totalEmployees,
    metrics.availableCapacity,
    metrics.openTasks,
    metrics.recommendedMatches,
    metrics.skillGaps.length,
    metrics.atRiskTasks,
  ]);

  const askCopilot = async () => {
    if (!copilotQuestion.trim()) return;

    setCopilotLoading(true);
    requestAgentOutput<ManagerCopilotOutput>('manager_copilot', {
      conversationId: 'dashboard-copilot',
      messageId: `msg-${Date.now()}`,
      userQuestion: copilotQuestion,
      allowedActions: ['read', 'recommend', 'draft_review'],
      contextRefs: [{ sourceType: 'deterministic_score', sourceId: 'dashboard', recordId: 'workmatch-dashboard' }],
    })
      .then(setCopilotResponse)
      .catch(() => undefined)
      .finally(() => setCopilotLoading(false));
  };

  return (
    <div className="max-w-7xl mx-auto space-y-6 w-full pb-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-end gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Overview</h1>
          <p className="text-gray-500 text-sm mt-1">Resource capacity, staffing risk, and match recommendations.</p>
        </div>
        <div className="flex items-center gap-2 text-[11px] text-gray-500 font-medium bg-white border border-gray-200 px-3 py-1.5 rounded shadow-sm">
          <RefreshCw className="w-3.5 h-3.5" /> Last updated: Just now
        </div>
      </div>
      {persistenceStatus && (
        <div className="bg-white border border-gray-200 rounded px-4 py-2 text-xs font-medium text-gray-600 shadow-sm">
          {persistenceStatus}
        </div>
      )}

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
        <StatCard 
          title="Total Employees" value={metrics.totalEmployees} sub={`${employees.filter((employee) => employee.readiness === 'Ready').length} ready now`} icon={Users} 
        />
        <StatCard 
          title="Available Capacity" value={`${metrics.availableCapacity}%`} sub={`${employees.filter((employee) => employee.availability >= 50).length} people >= 50%`} icon={Clock} 
          subClass={metrics.availableCapacity < 50 ? 'text-red-600' : 'text-green-700'}
        />
        <StatCard 
          title="Open Tasks" value={metrics.openTasks} sub={`${tasks.filter((task) => task.status === 'Ready to Staff').length} ready to staff`} icon={AlertCircle} 
        />
        <StatCard 
          title="Recommended Matches" value={metrics.recommendedMatches} sub={`${matches.length} ranked options`} icon={Cpu} 
          borderClass="border-red-600 border-[1.5px]" colorClass="text-red-600"
        />
        <StatCard 
          title="Skill Gaps" value={metrics.skillGaps.length} sub={skillGaps[0] ? `${skillGaps[0].name} highest` : 'No gaps'} icon={ShieldAlert} 
          colorClass="text-red-600" valueClass="text-red-600" subClass="text-red-600"
        />
        <StatCard 
          title="At-Risk Projects" value={metrics.atRiskTasks} sub="Requires attention" icon={AlertCircle} 
          colorClass="text-red-600" valueClass="text-red-600" subClass="text-red-600"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="bg-white border border-gray-200 rounded shadow-sm p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-bold text-gray-900">Manager Scan</h2>
            <CheckCircle2 className="w-4 h-4 text-green-600" />
          </div>
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="border border-gray-200 rounded p-3">
              <div className="text-xl font-black text-gray-900">{strongMatches.length}</div>
              <div className="text-[10px] font-bold uppercase text-gray-500">Strong Matches</div>
            </div>
            <div className="border border-gray-200 rounded p-3">
              <div className="text-xl font-black text-gray-900">{teamProjects.length}</div>
              <div className="text-[10px] font-bold uppercase text-gray-500">Team Projects</div>
            </div>
            <div className="border border-gray-200 rounded p-3">
              <div className="text-xl font-black text-red-600">{atRiskTasks.length}</div>
              <div className="text-[10px] font-bold uppercase text-gray-500">Needs Review</div>
            </div>
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded shadow-sm p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">Team / Project Buckets</h2>
          <div className="space-y-2">
            {teamProjects.slice(0, 3).map((task) => {
              const topMatch = bestMatchForTask(matches, task.id);
              return (
                <div key={task.id} className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-gray-900 truncate">{task.name}</div>
                    <div className="text-gray-500">{task.teamSize} seats - {task.status}</div>
                  </div>
                  <span className="shrink-0 rounded border border-gray-200 bg-gray-50 px-2 py-1 font-bold text-gray-700">
                    {topMatch ? formatMatchScoreLabel(topMatch) : 'No match'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
        <div className="bg-white border border-gray-200 rounded shadow-sm p-4">
          <h2 className="text-sm font-bold text-gray-900 mb-3">At-Risk Project Watch</h2>
          <div className="space-y-2">
            {atRiskTasks.slice(0, 3).map((task) => {
              const topMatch = bestMatchForTask(matches, task.id);
              return (
                <div key={task.id} className="flex items-center justify-between gap-3 text-xs">
                  <div className="min-w-0">
                    <div className="font-bold text-gray-900 truncate">{task.name}</div>
                    <div className="text-gray-500">{task.urgency} urgency - due {task.deadline}</div>
                  </div>
                  <span className="shrink-0 rounded bg-red-50 px-2 py-1 font-bold text-red-700">
                    {topMatch ? `${topMatch.score}% best` : 'Unmatched'}
                  </span>
                </div>
              );
            })}
            {atRiskTasks.length === 0 && <p className="text-xs text-gray-500">No active project is below the staffing threshold.</p>}
          </div>
        </div>
      </div>

      <div className="bg-white border border-gray-200 rounded shadow-sm p-4">
        <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-red-600" />
              <h2 className="text-sm font-bold text-gray-900">Manager Copilot</h2>
              <span className="text-[10px] font-bold uppercase text-red-700">
                {copilotLoading ? 'Working' : copilotResponse ? 'Updated' : 'Ready'}
              </span>
            </div>
            <p className="text-xs text-gray-500 mt-1">Answers from current dashboard context and returns review-only proposed actions.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 w-full lg:w-[520px]">
            <input
              value={copilotQuestion}
              onChange={(event) => setCopilotQuestion(event.target.value)}
              aria-label="Ask Manager Copilot"
              className="flex-1 border border-gray-200 rounded px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-red-500"
            />
            <button
              type="button"
              onClick={askCopilot}
              disabled={copilotLoading}
              className="inline-flex items-center justify-center gap-2 rounded bg-gray-900 px-4 py-2 text-sm font-bold text-white disabled:bg-gray-300"
            >
              <Send className="w-4 h-4" /> Ask
            </button>
          </div>
        </div>
        {copilotResponse && (
          <div className="mt-4 grid grid-cols-1 lg:grid-cols-3 gap-3 text-sm" role="status" aria-live="polite">
            <div className="lg:col-span-2 border border-gray-200 rounded p-3">
              <div className="font-bold text-gray-900 mb-1">{copilotResponse.output.answer.summary}</div>
              <div className="text-xs text-gray-600 leading-relaxed">{copilotResponse.output.answer.details.join(' ')}</div>
            </div>
            <div className="border border-gray-200 rounded p-3">
              <div className="text-[10px] font-bold uppercase text-gray-500 mb-2">Proposed Actions</div>
              <div className="space-y-2">
                {copilotResponse.output.proposedActions.slice(0, 3).map((action) => (
                  <div key={action.actionId} className="text-xs font-bold text-gray-800">
                    {action.label}
                  </div>
                ))}
                {!copilotResponse.output.proposedActions.length && <div className="text-xs text-gray-500">No actions proposed.</div>}
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Side (Charts) */}
        <div className="lg:col-span-2 flex flex-col gap-6">
          <div className="bg-white border border-gray-200 rounded p-5 shadow-sm min-h-[300px] flex flex-col">
            <h2 className="text-wrap font-medium text-lg text-gray-900 mb-6">Availability Distribution</h2>
            <div ref={availabilityChartRef} className="flex-1 min-h-[220px] min-w-0 w-full" role="img" aria-label={`Availability distribution: ${availabilityData.map((item) => `${item.name} ${item.value}`).join(', ')}`}>
              {availabilityChartWidth > 0 ? (
                <BarChart width={availabilityChartWidth} height={220} data={availabilityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 10}} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{fill: '#6b7280', fontSize: 10}} />
                  <Tooltip cursor={{fill: '#f9fafb'}} contentStyle={{borderRadius: '4px', border: '1px solid #e5e7eb', fontSize: '12px'}} />
                  <Bar dataKey="value" fill="#e31837" radius={[2, 2, 0, 0]} maxBarSize={80} />
                </BarChart>
              ) : (
                <div className="h-full min-h-[220px] w-full rounded bg-gray-50" aria-hidden="true" />
              )}
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 pt-4 border-t border-gray-100">
              {departmentCapacity.slice(0, 4).map((department) => (
                <div key={department.name} className="text-xs">
                  <div className="font-bold text-gray-900 truncate">{department.name}</div>
                  <div className="text-gray-500">{department.value}% avg capacity</div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-white border border-gray-200 rounded p-5 shadow-sm">
              <h2 className="text-wrap font-medium text-lg text-gray-900 mb-6">Demand vs. Supply</h2>
              <div className="space-y-5">
                {demandSupplyData.slice(0, 5).map((skill) => (
                  <div key={skill.name}>
                    <div className="flex justify-between text-xs mb-1.5 font-bold">
                      <span className="text-gray-800">{skill.name}</span>
                      <span className={skill.gap > 0 ? 'text-red-600' : 'text-green-700'}>
                        {skill.supply}/{skill.demand} supply
                      </span>
                    </div>
                    <div className="h-2 w-full bg-gray-200 rounded-full overflow-hidden">
                      <div className={skill.gap > 0 ? 'h-full bg-red-600 rounded-full' : 'h-full bg-green-600 rounded-full'} style={{ width: `${Math.min(100, (skill.supply / Math.max(skill.demand, 1)) * 100)}%` }}></div>
                    </div>
                  </div>
                ))}
                {demandSupplyData.length === 0 && (
                  <p className="text-sm text-gray-500">No active shortages across open requirements.</p>
                )}
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded p-5 shadow-sm">
              <h2 className="text-wrap font-medium text-lg text-gray-900 mb-6">Match Quality Trend</h2>
              <div ref={trendChartRef} className="h-32 min-w-0 w-full" role="img" aria-label={`Match quality trend: ${trendData.map((item) => `${item.name} ${item.value}%`).join(', ')}`}>
                {trendChartWidth > 0 ? (
                  <AreaChart width={trendChartWidth} height={128} data={trendData} margin={{ top: 5, right: 0, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTrend" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#e31837" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#e31837" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fill: '#9ca3af', fontSize: 10}} dy={10} />
                    <Tooltip contentStyle={{borderRadius: '4px', border: '1px solid #e5e7eb', fontSize: '12px'}} />
                    <Area type="monotone" dataKey="value" stroke="#e31837" strokeWidth={4} fillOpacity={1} fill="url(#colorTrend)" />
                  </AreaChart>
                ) : (
                  <div className="h-full w-full rounded bg-gray-50" aria-hidden="true" />
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Right Side (Insights & Skills) */}
        <div className="flex flex-col gap-6">
          
          {/* AI Insights panel */}
          {isInsightsFullscreen && (
            <div aria-hidden="true" className="fixed inset-0 bg-gray-900/40 backdrop-blur-sm z-40 transition-opacity duration-300" onClick={() => setIsInsightsFullscreen(false)} />
          )}
          <div className={isInsightsFullscreen ? 
            "fixed inset-4 md:inset-12 z-50 bg-white border border-gray-200 rounded shadow-2xl overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200" : 
            "bg-white border border-gray-200 rounded shadow-sm overflow-hidden flex flex-col"}
          >
            <div className="bg-red-50/50 p-4 border-b border-gray-100 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Cpu className="w-5 h-5 text-red-600" />
                <h2 className="font-medium text-gray-900 text-lg">Staffing Insights</h2>
                <span className="text-[10px] font-bold uppercase text-red-700">
                  {dashboardInsightsLoading ? 'Working' : dashboardInsights ? 'Updated' : 'Ready'}
                </span>
              </div>
              <button 
                type="button"
                onClick={() => setIsInsightsFullscreen(!isInsightsFullscreen)}
                className="p-1.5 hover:bg-gray-200/50 rounded-md text-gray-500 hover:text-gray-900 transition-colors"
                aria-label={isInsightsFullscreen ? 'Restore AI insights panel' : 'Expand AI insights panel'}
                aria-expanded={isInsightsFullscreen}
              >
                {isInsightsFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
            </div>
            
            <div className={`p-0 flex-1 bg-white flex flex-col ${isInsightsFullscreen ? 'overflow-y-auto' : ''}`}>
              {visibleInsights.map((item, index) => {
                const Icon = item.icon;
                const isExpanded = expandedInsight === item.id;
                return (
                  <div key={item.id} className={`p-5 ${index !== 0 ? 'border-t border-gray-100' : ''}`}>
                    <button
                      type="button"
                      className="flex w-full gap-3 items-start text-left cursor-pointer group focus:outline-none focus:ring-2 focus:ring-red-500 rounded"
                      onClick={() => setExpandedInsight(isExpanded ? null : item.id)}
                      aria-expanded={isExpanded}
                    >
                      <div className={`p-1.5 rounded-sm mt-0.5 ${item.iconColor}`}>
                        <Icon className="w-4 h-4" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between items-start">
                          <h4 className="text-sm font-bold text-gray-900 group-hover:text-red-700 transition-colors leading-tight pr-4">{item.title}</h4>
                          {isExpanded ? (
                            <ChevronUp className="w-4 h-4 text-gray-400 mt-0.5 shrink-0" />
                          ) : (
                            <ChevronDown className="w-4 h-4 text-gray-400 group-hover:text-gray-600 transition-colors mt-0.5 shrink-0" />
                          )}
                        </div>
                        <p className="text-[13px] text-gray-600 mt-1.5 leading-relaxed pr-6">
                          {item.summary}
                        </p>
                        
                        {isExpanded && (
                          <div className="mt-4 pt-4 border-t border-gray-50">
                            <p className="text-[13px] text-gray-700 leading-relaxed mb-3">
                              {item.details}
                            </p>
                          </div>
                        )}
                      </div>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Critical Skill Needs */}
          <div className="bg-white border border-gray-200 rounded shadow-sm p-5 flex flex-col flex-1 max-h-fit">
            <div className="flex justify-between items-end mb-6">
              <h2 className="text-lg font-medium text-gray-900">Critical Skill Needs</h2>
              <span className="text-[11px] uppercase font-medium text-gray-500">Open Demand</span>
            </div>
            
            <div className="space-y-6 mb-8">
              {skillGaps.slice(0, 3).map((skill) => (
                <div key={skill.name}>
                  <div className="flex justify-between text-sm mb-1.5 font-bold">
                    <span className="text-gray-800">{skill.name}</span>
                    <span className="text-gray-900">{skill.needed}</span>
                  </div>
                  <div className="h-2 w-full bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-red-600 rounded-full" style={{ width: `${Math.min(100, (skill.needed / Math.max(skill.needed, skill.available + skill.needed)) * 100)}%` }}></div>
                  </div>
                </div>
              ))}
              {skillGaps.length === 0 && (
                <p className="text-sm text-gray-500">All open requirements have at least one rated internal skill match.</p>
              )}
            </div>

            <div className="mt-auto border border-gray-200 rounded p-3 text-xs text-gray-600 bg-gray-50">
              Skill demand is summarized from current task requirements and employee skill ratings.
            </div>
          </div>

        </div>

      </div>
    </div>
  );
}

function getDemandSupplyData(employees: Employee[], tasks: Task[]) {
  const demand = new Map<string, number>();
  const supply = new Map<string, number>();

  tasks
    .filter((task) => task.status !== 'In Progress')
    .forEach((task) => task.requiredSkills.forEach((skill) => demand.set(skill, (demand.get(skill) ?? 0) + task.teamSize)));

  employees.forEach((employee) => {
    if (employee.availability <= 0) return;
    employee.skills
      .filter((skill) => skill.rating >= 6)
      .forEach((skill) => supply.set(skill.name, (supply.get(skill.name) ?? 0) + 1));
  });

  return Array.from(demand, ([name, demandValue]) => {
    const supplyValue = supply.get(name) ?? 0;
    return {
      name,
      demand: demandValue,
      supply: supplyValue,
      gap: Math.max(demandValue - supplyValue, 0),
    };
  }).sort((a, b) => b.gap - a.gap || b.demand - a.demand || a.name.localeCompare(b.name));
}

function useMeasuredChartWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const updateWidth = () => {
      setWidth(Math.max(1, Math.floor(element.getBoundingClientRect().width)));
    };

    const frame = window.requestAnimationFrame(updateWidth);
    if (typeof ResizeObserver === 'undefined') {
      return () => window.cancelAnimationFrame(frame);
    }

    const observer = new ResizeObserver(updateWidth);
    observer.observe(element);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, []);

  return [ref, width] as const;
}

function getAvailabilityBand(employee: Employee) {
  if (employee.availabilityStatus) return employee.availabilityStatus;
  if (employee.availability >= 65) return 'Available';
  if (employee.availability >= 30) return 'Partial';
  return 'Busy';
}
