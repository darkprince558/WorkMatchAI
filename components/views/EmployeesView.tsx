'use client';

import { useEffect, useState } from 'react';
import { Employee } from '@/lib/types';
import { Search, Filter, Sparkles, X, MapPin, Briefcase, Award, Target, Building2 } from 'lucide-react';
import { requestAgentOutput } from '@/lib/agents/client';
import type { AgentOutputEnvelope, EmployeeSummaryOutput } from '@/lib/agents/contracts';

interface EmployeesViewProps {
  employees: Employee[];
  focusedEmployeeId?: string | null;
  onFocusedEmployeeHandled?: () => void;
}

export default function EmployeesView({ employees, focusedEmployeeId, onFocusedEmployeeHandled }: EmployeesViewProps) {
  const [selectedEmp, setSelectedEmp] = useState<Employee | null>(null);
  const [search, setSearch] = useState('');
  const [availability, setAvailability] = useState('All');
  const [department, setDepartment] = useState('All');
  const [skill, setSkill] = useState('All');
  const [summaryByEmployee, setSummaryByEmployee] = useState<Record<string, AgentOutputEnvelope<EmployeeSummaryOutput>>>({});
  const [summaryLoadingId, setSummaryLoadingId] = useState<string | null>(null);

  const departments = Array.from(new Set(employees.map((employee) => employee.department))).sort();
  const skills = Array.from(new Set(employees.flatMap((employee) => employee.skills.map((item) => item.name)))).sort();
  const availableCount = employees.filter((employee) => getAvailabilityBand(employee) === 'Available').length;
  const partialCount = employees.filter((employee) => getAvailabilityBand(employee) === 'Partial').length;
  const busyCount = employees.filter((employee) => getAvailabilityBand(employee) === 'Busy').length;
  const filteredExps = employees.filter((employee) => {
    const matchesSearch =
      employee.name.toLowerCase().includes(search.toLowerCase()) ||
      employee.role.toLowerCase().includes(search.toLowerCase()) ||
      employee.skills.some((item) => item.name.toLowerCase().includes(search.toLowerCase()));
    const matchesAvailability = availability === 'All' || getAvailabilityBand(employee) === availability;
    const matchesDepartment = department === 'All' || employee.department === department;
    const matchesSkill = skill === 'All' || employee.skills.some((item) => item.name === skill);
    return matchesSearch && matchesAvailability && matchesDepartment && matchesSkill;
  });

  useEffect(() => {
    if (!focusedEmployeeId) return;
    const employee = employees.find((item) => item.id === focusedEmployeeId);
    queueMicrotask(() => {
      if (employee) setSelectedEmp(employee);
      onFocusedEmployeeHandled?.();
    });
  }, [employees, focusedEmployeeId, onFocusedEmployeeHandled]);
  const selectedSummary = selectedEmp ? summaryByEmployee[selectedEmp.id] : undefined;

  useEffect(() => {
    if (!selectedEmp || summaryByEmployee[selectedEmp.id]) return;

    const controller = new AbortController();
    queueMicrotask(() => setSummaryLoadingId(selectedEmp.id));

    requestAgentOutput<EmployeeSummaryOutput>(
      'employee_summary',
      {
        employee: selectedEmp,
      },
      { signal: controller.signal }
    )
      .then((envelope) => {
        setSummaryByEmployee((current) => ({
          ...current,
          [selectedEmp.id]: envelope,
        }));
      })
      .catch(() => undefined)
      .finally(() => {
        setSummaryLoadingId((current) => (current === selectedEmp.id ? null : current));
      });

    return () => controller.abort();
  }, [selectedEmp, summaryByEmployee]);

  return (
    <div className="w-full max-w-7xl mx-auto flex h-full min-w-0 gap-6 relative">
      {/* Main List */}
      <div className={`min-w-0 flex-1 flex flex-col transition-all duration-300 ${selectedEmp ? '2xl:pr-[420px]' : ''}`}>
        <div className="flex flex-col gap-4 mb-6">
          <div className="flex flex-col xl:flex-row xl:justify-between xl:items-start gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Employee Directory</h1>
            <p className="text-gray-500 text-sm mt-1">Review employee profiles and skill availability</p>
          </div>
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input 
                type="text"
                placeholder="Search name, role, skill..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-9 pr-4 py-2 border border-gray-200 rounded-md text-sm w-full sm:w-64 bg-white focus:outline-none focus:ring-1 focus:ring-red-500 focus:border-red-500 transition-all placeholder:text-gray-400"
              />
            </div>
            <div className="flex items-center gap-2 px-3 py-2 border border-gray-200 rounded-md text-sm font-medium text-gray-700 bg-white">
              <Filter className="w-4 h-4" /> {filteredExps.length}
            </div>
          </div>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-gray-200 rounded p-3">
              <div className="text-[10px] font-bold uppercase text-gray-500">Available</div>
              <div className="text-xl font-black text-green-700">{availableCount}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded p-3">
              <div className="text-[10px] font-bold uppercase text-gray-500">Partial</div>
              <div className="text-xl font-black text-amber-700">{partialCount}</div>
            </div>
            <div className="bg-white border border-gray-200 rounded p-3">
              <div className="text-[10px] font-bold uppercase text-gray-500">Busy</div>
              <div className="text-xl font-black text-gray-700">{busyCount}</div>
            </div>
            <div className="bg-white border border-red-200 rounded p-3">
              <div className="text-[10px] font-bold uppercase text-gray-500">Filtered Profiles</div>
              <div className="text-xl font-black text-red-600">{filteredExps.length}</div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white border border-gray-200 rounded p-3 shadow-sm">
            <h2 className="sr-only">Filters</h2>
            <label className="text-xs font-bold text-gray-700">
              Availability
              <select aria-label="Availability" value={availability} onChange={(event) => setAvailability(event.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-white text-gray-700 font-medium">
                <option>All</option>
                <option>Available</option>
                <option>Partial</option>
                <option>Busy</option>
              </select>
            </label>
            <label className="text-xs font-bold text-gray-700">
              Department
              <select aria-label="Department" value={department} onChange={(event) => setDepartment(event.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-white text-gray-700 font-medium">
                <option>All</option>
                {departments.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <label className="text-xs font-bold text-gray-700">
              Skill
              <select aria-label="Skill" value={skill} onChange={(event) => setSkill(event.target.value)} className="mt-1 w-full px-3 py-2 border border-gray-200 rounded-md text-sm bg-white text-gray-700 font-medium">
                <option>All</option>
                {skills.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
          </div>
        </div>

        <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden flex-1 flex flex-col min-h-0">
          <div className="overflow-auto flex-1">
            <table className="w-full min-w-[1120px] table-fixed text-left text-sm">
              <colgroup>
                <col style={{ width: '210px' }} />
                <col style={{ width: '230px' }} />
                <col style={{ width: '160px' }} />
                <col />
                <col style={{ width: '120px' }} />
              </colgroup>
              <thead className="bg-gray-50 border-b border-gray-200 text-gray-600 font-medium whitespace-nowrap">
                <tr>
                  <th className="px-4 py-3 leading-tight">Employee</th>
                  <th className="px-4 py-3 leading-tight hidden lg:table-cell">Role & Dept</th>
                  <th className="px-4 py-3 leading-tight hidden xl:table-cell">Availability</th>
                  <th className="px-4 py-3 leading-tight">Top Skills</th>
                  <th className="px-4 py-3 leading-tight text-center">Readiness</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {filteredExps.map(emp => (
                  <tr 
                    key={emp.id} 
                    onClick={() => setSelectedEmp(emp)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') setSelectedEmp(emp);
                    }}
                    tabIndex={0}
                    role="button"
                    aria-label={`Open profile for ${emp.name}`}
                    className={`hover:bg-gray-50 cursor-pointer transition-colors ${selectedEmp?.id === emp.id ? 'bg-red-50 hover:bg-red-50/80' : ''}`}
                  >
                    <td className="px-4 py-4">
                      <div className="flex items-center gap-3">
                        <img src={emp.avatar} alt="" className="w-10 h-10 rounded border border-gray-200 object-cover flex-shrink-0" />
                        <div className="min-w-0">
                          <div className="font-bold text-gray-900 truncate">{emp.name}</div>
                          <div className="text-gray-500 text-xs truncate">{emp.location}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-4 hidden lg:table-cell">
                      <div className="text-gray-900 truncate">{emp.role}</div>
                      <div className="text-gray-500 text-xs truncate">{emp.department}</div>
                    </td>
                    <td className="px-4 py-4 hidden xl:table-cell">
                      <div className="flex items-center gap-3 whitespace-nowrap">
                        <div className="w-20 h-2 bg-gray-100 rounded-full overflow-hidden flex-shrink-0">
                          <div 
                            className={`h-full rounded-full ${emp.availability > 50 ? 'bg-green-500' : emp.availability > 20 ? 'bg-yellow-500' : 'bg-red-500'}`}
                            style={{ width: `${emp.availability}%` }}
                          ></div>
                        </div>
                        <span className="w-9 shrink-0 text-right text-xs font-medium tabular-nums text-gray-700">{emp.availability}%</span>
                      </div>
                    </td>
                    <td className="px-4 py-4">
                      <div className="flex min-w-0 flex-wrap gap-1.5">
                        {emp.skills.slice(0, 2).map(skill => (
                          <span
                            key={skill.name}
                            title={`${skill.name} ${skill.rating}/10`}
                            className="max-w-[170px] truncate whitespace-nowrap px-2 py-1 bg-white text-gray-700 text-[10px] font-medium rounded border border-gray-200"
                          >
                            {skill.name} {skill.rating}/10
                          </span>
                        ))}
                        {emp.skills.length > 2 && (
                          <span className="px-2 py-1 bg-gray-50 text-gray-500 text-[10px] font-medium rounded border border-gray-200">
                            +{emp.skills.length - 2}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-4 text-center">
                      <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                        emp.readiness === 'Ready' ? 'bg-green-100 text-green-800' : 
                        emp.readiness === 'Busy' ? 'bg-gray-100 text-gray-800' : 
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {emp.readiness}
                      </span>
                    </td>
                  </tr>
                ))}
                {filteredExps.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-gray-500">
                      No employees match the current filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Slide-out Drawer */}
      <div
        role={selectedEmp ? 'dialog' : undefined}
        aria-modal={selectedEmp ? 'true' : undefined}
        aria-label={selectedEmp ? `${selectedEmp.name} profile` : undefined}
        className={`fixed top-16 right-0 bottom-0 w-[400px] bg-white border-l border-gray-200 shadow-2xl transition-transform duration-300 ease-in-out z-20 flex flex-col
        ${selectedEmp ? 'translate-x-0' : 'translate-x-[400px]'}
      `}
      >
        {selectedEmp && (
          <>
            <div className="p-6 border-b border-gray-200 flex justify-between items-start relative overflow-hidden bg-gray-50">
              <div className="absolute top-0 right-0 w-32 h-32 bg-red-50 rounded-bl-full -mr-10 -mt-10"></div>
              <div className="flex gap-4 relative z-10">
                <img src={selectedEmp.avatar} alt={selectedEmp.name} className="w-16 h-16 rounded border border-gray-300 object-cover shadow-sm bg-white" />
                <div>
                  <h2 className="text-xl font-bold text-gray-900">{selectedEmp.name}</h2>
                  <p className="text-sm font-medium text-gray-600 mb-1">{selectedEmp.role}</p>
                <div className="flex items-center gap-3 text-xs text-gray-500 mt-2">
                    <span className="flex items-center gap-1"><MapPin className="w-3 h-3" /> {selectedEmp.location}</span>
                    <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" /> {selectedEmp.yearsExp} YOE</span>
                  </div>
                  <div className="flex items-center gap-1 text-xs text-gray-500 mt-1">
                    <Building2 className="w-3 h-3" /> {selectedEmp.department}
                  </div>
                </div>
              </div>
              <button 
                onClick={() => setSelectedEmp(null)}
                aria-label="Close employee profile"
                className="p-1.5 text-gray-400 hover:text-gray-900 hover:bg-gray-200 rounded transition-colors relative z-10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              
              {/* AI Summary Panel */}
              <div className="bg-red-50 border border-red-100 rounded p-4 relative">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-red-600" />
                    <span className="text-[10px] font-bold text-red-600 uppercase tracking-wider">AI WorkMatch Summary</span>
                  </div>
                  <span className="text-[10px] font-bold uppercase text-red-700">
                    {summaryLoadingId === selectedEmp.id ? 'Working' : selectedSummary ? 'Updated' : 'Ready'}
                  </span>
                </div>
                <p className="text-xs text-gray-700 leading-relaxed">
                  {selectedSummary
                    ? selectedSummary.output.headline
                    : selectedEmp.availability >= 40
                      ? `${selectedEmp.name} is a highly rated ${selectedEmp.role} currently available for immediate assignments. Exhibits top decile proficiency in ${selectedEmp.skills[0]?.name}.`
                      : `${selectedEmp.name} is deeply allocated currently. Only recommend for advisory roles or high-leverage architectural reviews within ${selectedEmp.skills[0]?.name}.`}
                </p>
                {selectedSummary && (
                  <div className="mt-3 grid grid-cols-1 gap-2 text-xs text-gray-700">
                    <div><strong>Capacity:</strong> {selectedSummary.output.capacitySummary}</div>
                    <div><strong>Next:</strong> {selectedSummary.output.recommendedNextActions.slice(0, 2).join(' ')}</div>
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="border border-gray-200 rounded p-3">
                  <div className="text-[10px] font-bold uppercase text-gray-500 mb-1">Capacity</div>
                  <div className="text-lg font-black text-gray-900">{selectedEmp.availability}%</div>
                  <div className="text-gray-500">{selectedEmp.availabilityStatus ?? selectedEmp.readiness}</div>
                </div>
                <div className="border border-gray-200 rounded p-3">
                  <div className="text-[10px] font-bold uppercase text-gray-500 mb-1">Timezone</div>
                  <div className="text-sm font-bold text-gray-900">{selectedEmp.timezone ?? 'Local'}</div>
                  <div className="text-gray-500">{selectedEmp.readiness}</div>
                </div>
              </div>

              {/* Skills (1-10) */}
              <div>
                <h3 className="text-[10px] font-bold text-gray-900 uppercase tracking-wider mb-4 border-b border-gray-100 pb-2">Skill Ratings</h3>
                <div className="space-y-4">
                  {selectedEmp.skills.map(s => (
                    <div key={s.name}>
                      <div className="flex justify-between text-xs mb-1 font-medium">
                        <span className="text-gray-800">{s.name}</span>
                        <span className="text-gray-500 font-mono text-[10px]">{s.rating}/10</span>
                      </div>
                      <div
                        className="flex gap-1 h-2"
                        role="meter"
                        aria-label={`${s.name} skill rating`}
                        aria-valuemin={0}
                        aria-valuemax={10}
                        aria-valuenow={s.rating}
                        aria-valuetext={`${s.rating} out of 10`}
                      >
                        {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => (
                          <div 
                            key={n} 
                            className={`flex-1 rounded-sm ${n <= s.rating ? 'bg-gray-800' : 'bg-gray-100'}`}
                          ></div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Goals / Certs */}
              <div className="space-y-4">
                {selectedEmp.careerGoals && (
                  <div>
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Target className="w-3 h-3" /> Career Goals</h3>
                    <p className="text-xs text-gray-800 p-3 bg-gray-50 rounded border border-gray-200 leading-relaxed">
                      {selectedEmp.careerGoals}
                    </p>
                  </div>
                )}
                {selectedEmp.certifications && (
                  <div>
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2 flex items-center gap-1"><Award className="w-3 h-3" /> Certifications</h3>
                    <ul className="list-disc pl-4 text-xs text-gray-800 space-y-1">
                      {selectedEmp.certifications.map(c => <li key={c}>{c}</li>)}
                    </ul>
                  </div>
                )}
                {selectedEmp.pastProjects && selectedEmp.pastProjects.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Past Projects</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedEmp.pastProjects.map(project => (
                        <span key={project} className="px-2 py-1 bg-gray-50 border border-gray-200 rounded text-xs text-gray-700">{project}</span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedEmp.interests && selectedEmp.interests.length > 0 && (
                  <div>
                    <h3 className="text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-2">Interests</h3>
                    <div className="flex flex-wrap gap-2">
                      {selectedEmp.interests.map(interest => (
                        <span key={interest} className="px-2 py-1 bg-white border border-gray-200 rounded text-xs text-gray-700">{interest}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-gray-200 bg-gray-50">
               <div className="grid grid-cols-2 gap-3 text-xs">
                 <div className="bg-white border border-gray-200 rounded p-3">
                   <div className="text-gray-500 font-bold uppercase text-[10px] mb-1">Capacity</div>
                   <div className="text-gray-900 font-bold">{selectedEmp.availability}%</div>
                 </div>
                 <div className="bg-white border border-gray-200 rounded p-3">
                   <div className="text-gray-500 font-bold uppercase text-[10px] mb-1">Readiness</div>
                   <div className="text-gray-900 font-bold">{selectedEmp.readiness}</div>
                 </div>
               </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function getAvailabilityBand(employee: Employee) {
  if (employee.availabilityStatus) return employee.availabilityStatus;
  if (employee.availability >= 65) return 'Available';
  if (employee.availability >= 30) return 'Partial';
  return 'Busy';
}
