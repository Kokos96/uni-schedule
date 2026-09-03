import React from 'react';
import { Calendar, CheckCircle2, Users, School, Settings } from 'lucide-react';

export type TabType = 'schedule' | 'stats' | 'teachers' | 'classrooms' | 'settings';

interface BottomNavProps {
  currentTab: TabType;
  onTabChange: (tab: TabType) => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({ currentTab, onTabChange }) => {
  const tabs = [
    { id: 'schedule', label: 'Розклад', icon: Calendar },
    { id: 'stats', label: 'Відвідуваність', icon: CheckCircle2 },
    { id: 'teachers', label: 'Викладачі', icon: Users },
    { id: 'classrooms', label: 'Аудиторії', icon: School },
    { id: 'settings', label: 'Опції', icon: Settings },
  ] as const;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-[#161618]/85 backdrop-blur-xl border-t border-white/10 pb-safe">
      <nav className="flex justify-around items-center h-14 max-w-md mx-auto">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const isActive = currentTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex flex-col items-center justify-center flex-1 h-full transition-colors active:scale-95 ${
                isActive ? 'text-[#0A84FF]' : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              <Icon className="w-5 h-5 mb-0.5" strokeWidth={isActive ? 2.4 : 1.8} />
              <span className="text-[10px] font-medium tracking-tight">{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};