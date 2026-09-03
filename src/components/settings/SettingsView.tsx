import React from 'react';
import { UserSettings } from '../../types';
import { Users, BookOpen, Smartphone } from 'lucide-react';

interface SettingsViewProps {
  settings: UserSettings;
  onUpdate: (newSettings: Partial<UserSettings>) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onUpdate }) => {
  return (
    <div className="p-4 space-y-6 max-w-md mx-auto">
      <h2 className="text-xl font-bold tracking-tight text-white">Налаштування</h2>

      {/* Секція: Підгрупа */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-1">
          Підгрупа в групі
        </span>
        <div className="bg-[#1C1C1E] border border-white/5 rounded-2xl p-1.5 flex gap-1.5">
          <button
            onClick={() => onUpdate({ subgroup: 1 })}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              settings.subgroup === 1
                ? 'bg-[#0A84FF] text-white shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            1-ша підгрупа
          </button>
          <button
            onClick={() => onUpdate({ subgroup: 2 })}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              settings.subgroup === 2
                ? 'bg-[#0A84FF] text-white shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            <Users className="w-4 h-4" />
            2-га підгрупа
          </button>
        </div>
      </div>

      {/* Секція: Вибіркова дисципліна */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-1">
          Вибіркова дисципліна (Понеділок)
        </span>
        <div className="bg-[#1C1C1E] border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden">
          <button
            onClick={() => onUpdate({ electiveCourse: 'freelance' })}
            className="w-full px-4 py-3.5 flex items-center justify-between text-left text-xs font-medium transition-colors hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <BookOpen className="w-4 h-4 text-[#0A84FF]" />
              <span className="text-white">Freelance: робота онлайн</span>
            </div>
            {settings.electiveCourse === 'freelance' && (
              <span className="w-2 h-2 rounded-full bg-[#0A84FF]"></span>
            )}
          </button>

          <button
            onClick={() => onUpdate({ electiveCourse: 'management' })}
            className="w-full px-4 py-3.5 flex items-center justify-between text-left text-xs font-medium transition-colors hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <BookOpen className="w-4 h-4 text-purple-400" />
              <span className="text-white">Інноваційний менеджмент</span>
            </div>
            {settings.electiveCourse === 'management' && (
              <span className="w-2 h-2 rounded-full bg-[#0A84FF]"></span>
            )}
          </button>

          <button
            onClick={() => onUpdate({ electiveCourse: 'both' })}
            className="w-full px-4 py-3.5 flex items-center justify-between text-left text-xs font-medium transition-colors hover:bg-white/5"
          >
            <div className="flex items-center gap-3">
              <BookOpen className="w-4 h-4 text-neutral-400" />
              <span className="text-neutral-300">Показувати обидві</span>
            </div>
            {settings.electiveCourse === 'both' && (
              <span className="w-2 h-2 rounded-full bg-[#0A84FF]"></span>
            )}
          </button>
        </div>
      </div>

      {/* Інфо картка */}
      <div className="bg-[#1C1C1E]/60 border border-white/5 rounded-2xl p-4 flex items-start gap-3">
        <Smartphone className="w-5 h-5 text-neutral-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-neutral-400 leading-relaxed">
          <p className="text-neutral-200 font-medium">Як додати на екран iPhone:</p>
          <p>1. Відкрий сайт у Safari.</p>
          <p>2. Натисни кнопку «Поділитися» знизу.</p>
          <p>3. Обери пункт «На початковий екран».</p>
        </div>
      </div>
    </div>
  );
};