import React from 'react';
import { UserSettings, DepartmentType, ElectiveType } from '../../types';
import { Users, Building2, BookOpen, Smartphone } from 'lucide-react';

interface SettingsViewProps {
  settings: UserSettings;
  onUpdate: (newSettings: Partial<UserSettings>) => void;
}

export const SettingsView: React.FC<SettingsViewProps> = ({ settings, onUpdate }) => {
  const departments: { id: DepartmentType; label: string; sub: string }[] = [
    { id: 'sp', label: 'СП', sub: 'Системне проектування (NoSQL бази)' },
    { id: 'oit', label: 'ОІТ', sub: 'Оптоелектроніка та ІТ (NoSQL бази)' },
    { id: 'rks', label: 'РКС', sub: 'Радіоелектронні та комп. системи (Мова C)' },
    { id: 'rkt', label: 'РКТ', sub: 'Радіофізика та комп. технології (Мова C)' },
  ];

  const electives: { id: ElectiveType; label: string }[] = [
    { id: 'freelance', label: 'Freelance: робота онлайн' },
    { id: 'management', label: 'Інноваційний менеджмент' },
    { id: 'space', label: 'Людина і космос' },
    { id: 'both', label: 'Показувати всі' },
  ];

  return (
    <div className="p-4 space-y-6 max-w-md mx-auto">
      <h2 className="text-xl font-bold tracking-tight text-white">Налаштування</h2>

      {/* 1. Вибір кафедри */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
          <Building2 className="w-3.5 h-3.5 text-[#0A84FF]" /> Твоя кафедра (Спецпотік)
        </span>
        <div className="bg-[#1C1C1E] border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden">
          {departments.map((d) => (
            <button
              key={d.id}
              type="button"
              onClick={() => onUpdate({ department: d.id })}
              className="w-full px-4 py-3 flex items-center justify-between text-left transition-colors hover:bg-white/5"
            >
              <div>
                <span className="text-sm font-semibold text-white block">{d.label}</span>
                <span className="text-[11px] text-neutral-400">{d.sub}</span>
              </div>
              {settings.department === d.id && (
                <span className="w-2.5 h-2.5 rounded-full bg-[#0A84FF]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* 2. Підгрупа */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-[#0A84FF]" /> Підгрупа для лабораторних
        </span>
        <div className="bg-[#1C1C1E] border border-white/5 rounded-2xl p-1.5 flex gap-1.5">
          <button
            type="button"
            onClick={() => onUpdate({ subgroup: 1 })}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              settings.subgroup === 1
                ? 'bg-[#0A84FF] text-white shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            1-ша підгрупа
          </button>
          <button
            type="button"
            onClick={() => onUpdate({ subgroup: 2 })}
            className={`flex-1 py-2.5 rounded-xl text-xs font-semibold transition-all ${
              settings.subgroup === 2
                ? 'bg-[#0A84FF] text-white shadow-md'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            2-га підгрупа
          </button>
        </div>
      </div>

      {/* 3. Вибіркові дисципліни */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-neutral-400 uppercase tracking-wider px-1 flex items-center gap-1.5">
          <BookOpen className="w-3.5 h-3.5 text-[#0A84FF]" /> Вибіркова пара (Понеділок)
        </span>
        <div className="bg-[#1C1C1E] border border-white/5 rounded-2xl divide-y divide-white/5 overflow-hidden">
          {electives.map((e) => (
            <button
              key={e.id}
              type="button"
              onClick={() => onUpdate({ electiveCourse: e.id })}
              className="w-full px-4 py-3 flex items-center justify-between text-left text-xs font-medium transition-colors hover:bg-white/5"
            >
              <span className="text-white">{e.label}</span>
              {settings.electiveCourse === e.id && (
                <span className="w-2.5 h-2.5 rounded-full bg-[#0A84FF]" />
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Інфо Safari iOS */}
      <div className="bg-[#1C1C1E]/60 border border-white/5 rounded-2xl p-4 flex items-start gap-3">
        <Smartphone className="w-5 h-5 text-neutral-400 shrink-0 mt-0.5" />
        <div className="space-y-1 text-xs text-neutral-400 leading-relaxed">
          <p className="text-neutral-200 font-medium">Встановлення на iPhone:</p>
          <p>«Поділитися» в Safari ➔ «На початковий екран».</p>
        </div>
      </div>
    </div>
  );
};
