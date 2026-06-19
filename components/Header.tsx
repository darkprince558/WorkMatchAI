'use client';

import { useEffect, useMemo, useState } from 'react';
import { Search, Bell, Upload, Menu } from 'lucide-react';
import { Employee, Task } from '@/lib/types';

interface HeaderProps {
  setView: (view: string) => void;
  toggleSidebar: () => void;
  employees: Employee[];
  tasks: Task[];
  openEmployeeProfile: (employeeId: string) => void;
  openTaskDetails: (taskId: string) => void;
}

export default function Header({ setView, toggleSidebar, employees, tasks, openEmployeeProfile, openTaskDetails }: HeaderProps) {
  const [query, setQuery] = useState('');
  const [showNotifications, setShowNotifications] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [sessionUser, setSessionUser] = useState<{ name?: string; email?: string } | null>(null);

  const searchResults = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return [];

    const employeeResults = employees
      .filter((employee) =>
        [employee.name, employee.role, employee.department, ...employee.skills.map((skill) => skill.name)]
          .some((value) => value.toLowerCase().includes(normalized))
      )
      .slice(0, 3)
      .map((employee) => ({
        id: employee.id,
        label: employee.name,
        meta: `${employee.role} - ${employee.availability}% capacity`,
        type: 'employee' as const,
      }));

    const taskResults = tasks
      .filter((task) =>
        [task.name, task.status, task.urgency, ...(task.requiredSkills ?? [])]
          .some((value) => value.toLowerCase().includes(normalized))
      )
      .slice(0, 3)
      .map((task) => ({
        id: task.id,
        label: task.name,
        meta: `${task.status} - ${task.teamSize} seat${task.teamSize === 1 ? '' : 's'}`,
        type: 'task' as const,
      }));

    return [...employeeResults, ...taskResults].slice(0, 5);
  }, [employees, query, tasks]);

  const openResult = (result: (typeof searchResults)[number]) => {
    if (result.type === 'employee') openEmployeeProfile(result.id);
    if (result.type === 'task') openTaskDetails(result.id);
    setQuery('');
  };

  const handleSearchSubmit = () => {
    if (searchResults[0]) {
      openResult(searchResults[0]);
    }
  };

  const atRiskCount = tasks.filter((task) => task.status === 'At Risk').length;
  const availableCount = employees.filter((employee) => employee.availability >= 50).length;
  const profileName = sessionUser?.name || sessionUser?.email || 'Admin Lead';

  useEffect(() => {
    fetch('/api/auth/session')
      .then((response) => (response.ok ? response.json() : undefined))
      .then((payload: { user?: { name?: string; email?: string } } | undefined) => {
        if (payload?.user) setSessionUser(payload.user);
      })
      .catch(() => undefined);
  }, []);

  const signOut = async () => {
    await fetch('/api/auth/sign-out', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/sign-in';
  };

  return (
    <header className="h-16 bg-white border-b border-gray-200 px-4 lg:px-8 flex items-center justify-between gap-3 sticky top-0 z-10 flex-shrink-0">
      <div className="min-w-0 flex-1 flex items-center max-w-xl gap-3 lg:gap-4">
        <button
          type="button"
          onClick={toggleSidebar}
          aria-label="Toggle navigation"
          className="p-2 -ml-2 text-gray-500 hover:text-gray-900 rounded-md hover:bg-gray-100 transition-colors"
        >
          <Menu className="w-5 h-5" />
        </button>
        <div className="relative min-w-0 w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <input 
            type="text" 
            placeholder="Search employees, skills, or projects..." 
            aria-label="Search employees, skills, or projects"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSearchSubmit();
              if (event.key === 'Escape') setQuery('');
            }}
            className="w-full pl-10 pr-4 py-2 bg-gray-50 border border-gray-200 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-1 focus:ring-red-500 transition-all placeholder:text-gray-400"
          />
          {query.trim() && (
            <div className="absolute left-0 right-0 top-[calc(100%+8px)] bg-white border border-gray-200 rounded shadow-lg overflow-hidden z-30">
              {searchResults.length > 0 ? (
                searchResults.map((result) => (
                  <button
                    key={`${result.type}-${result.id}`}
                    type="button"
                    onClick={() => openResult(result)}
                    className="w-full text-left px-4 py-3 hover:bg-gray-50 border-b last:border-b-0 border-gray-100"
                  >
                    <span className="block text-sm font-bold text-gray-900">{result.label}</span>
                    <span className="block text-xs text-gray-500">{result.meta}</span>
                  </button>
                ))
              ) : (
                <div className="px-4 py-3 text-sm text-gray-500">No matching employees or projects.</div>
              )}
            </div>
          )}
        </div>
      </div>
      
      <div className="flex items-center gap-2 md:gap-4 flex-shrink-0">
        <button 
          type="button"
          onClick={() => setView('imports')}
          className="flex shrink-0 items-center gap-2 bg-red-600 hover:bg-red-700 text-white px-3 lg:px-4 py-2 rounded-md text-sm font-medium transition-colors"
        >
          <Upload className="w-4 h-4" />
          <span className="hidden sm:inline">Import Data</span>
        </button>
        
        <div className="h-6 w-px bg-gray-200"></div>
        
        <div className="relative">
        <button
          type="button"
          onClick={() => {
            setShowNotifications((current) => !current);
            setShowProfile(false);
          }}
          className="relative p-2 text-gray-500 hover:text-gray-700 transition-colors"
          aria-label="Notifications"
          aria-haspopup="dialog"
          aria-expanded={showNotifications}
          aria-controls="workmatch-notifications-popover"
        >
          <Bell className="w-5 h-5" />
          {atRiskCount > 0 && <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-600 rounded-full border border-white"></span>}
        </button>
        {showNotifications && (
          <div id="workmatch-notifications-popover" role="dialog" aria-label="Notifications" className="absolute right-0 top-[calc(100%+10px)] w-80 bg-white border border-gray-200 rounded shadow-lg z-30 p-3">
            <div className="text-xs font-bold uppercase text-gray-500 mb-2">Alerts</div>
            <div className="space-y-2 text-sm">
              <button type="button" onClick={() => setView('dashboard')} className="w-full text-left border border-red-100 bg-red-50 rounded p-3">
                <span className="block font-bold text-red-700">{atRiskCount} status at-risk project{atRiskCount === 1 ? '' : 's'}</span>
                <span className="text-xs text-red-700">Open dashboard risk summary.</span>
              </button>
              <button type="button" onClick={() => setView('employees')} className="w-full text-left border border-gray-200 rounded p-3 hover:bg-gray-50">
                <span className="block font-bold text-gray-900">{availableCount} employees above 50% capacity</span>
                <span className="text-xs text-gray-500">Open employee directory.</span>
              </button>
            </div>
          </div>
        )}
        </div>
        
        <div className="relative">
        <button
          type="button"
          onClick={() => {
            setShowProfile((current) => !current);
            setShowNotifications(false);
          }}
          className="flex shrink-0 items-center gap-2 pl-1 md:pl-2 text-sm font-medium text-gray-700 hover:text-gray-900 transition-colors"
          aria-label={`Open profile menu for ${profileName}`}
          aria-haspopup="menu"
          aria-expanded={showProfile}
          aria-controls="workmatch-profile-menu"
        >
          <img src="https://picsum.photos/seed/admin/200/200" alt="Avatar" className="w-8 h-8 rounded-full border border-gray-200" />
          <span className="hidden lg:inline-block max-w-32 truncate">{profileName}</span>
        </button>
        {showProfile && (
          <div id="workmatch-profile-menu" role="menu" aria-label="Profile menu" className="absolute right-0 top-[calc(100%+10px)] w-56 bg-white border border-gray-200 rounded shadow-lg z-30 p-2">
            <div className="px-3 py-2 border-b border-gray-100">
              <div className="text-sm font-bold text-gray-900">{profileName}</div>
              <div className="text-xs text-gray-500">{sessionUser?.email ?? 'Workforce manager'}</div>
            </div>
            <button type="button" role="menuitem" onClick={() => setView('settings')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-50">
              Settings
            </button>
            <button type="button" role="menuitem" onClick={() => setView('employee-portal')} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-50">
              My Profile
            </button>
            <button type="button" role="menuitem" onClick={signOut} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-gray-50">
              Sign out
            </button>
          </div>
        )}
        </div>
      </div>
    </header>
  );
}
