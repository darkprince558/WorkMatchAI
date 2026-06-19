'use client';

import Image from 'next/image';
import { 
  LayoutDashboard, 
  UserRound,
  Users, 
  Briefcase, 
  FolderArchive,
  Shuffle, 
  UploadCloud, 
  Settings,
  LogOut
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  setView: (view: string) => void;
  isOpen: boolean;
}

export default function Sidebar({ currentView, setView, isOpen }: SidebarProps) {
  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'employee-portal', label: 'My Profile', icon: UserRound },
    { id: 'employees', label: 'Employees', icon: Users },
    { id: 'tasks', label: 'Tasks & Projects', icon: Briefcase },
    { id: 'documents', label: 'Document Vault', icon: FolderArchive },
    { id: 'matching', label: 'Match Recommendations', icon: Shuffle },
    { id: 'imports', label: 'Imports / Review', icon: UploadCloud },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  const signOut = async () => {
    await fetch('/api/auth/sign-out', { method: 'POST' }).catch(() => undefined);
    window.location.href = '/sign-in';
  };

  return (
    <aside className={`fixed md:relative inset-y-0 left-0 w-64 bg-gray-900 text-gray-400 flex flex-col h-full overflow-hidden border-gray-800 transition-[transform,opacity] duration-200 ease-out z-20 ${isOpen ? 'border-r translate-x-0 opacity-100' : 'md:w-0 border-r-0 -translate-x-full opacity-0 pointer-events-none'}`}>
      <div className="w-64 flex flex-col h-full">
        <div className="h-16 flex items-center px-5 border-b border-gray-800 gap-2.5 text-white flex-shrink-0">
          <Image src="/workmatch-logo.svg" alt="WorkMatch AI" width={34} height={34} priority className="h-8 w-8 flex-shrink-0" />
          <span className="min-w-0 whitespace-nowrap font-semibold tracking-tight text-base">
            WorkMatch <span className="bg-red-600 font-bold text-xs text-white px-1 py-0.5 rounded-full ml-1">AI</span>
          </span>
        </div>
        
        <div className="flex-1 py-6 px-3 flex flex-col gap-1 overflow-y-auto">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setView(item.id)}
                aria-current={isActive ? 'page' : undefined}
                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors w-full text-left
                  ${isActive ? 'bg-gray-800 text-white' : 'hover:bg-gray-800 hover:text-white'}
                `}
              >
                <Icon className="w-4 h-4 flex-shrink-0" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="p-4 border-t border-gray-800 flex-shrink-0">
          <button
            onClick={signOut}
            className="flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium hover:bg-gray-800 hover:text-white transition-colors w-full text-left"
          >
            <LogOut className="w-4 h-4 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </div>
    </aside>
  );
}
