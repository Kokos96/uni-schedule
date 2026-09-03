import React, { useState } from 'react';
import { AttendanceRecord, Lesson } from '../../types';
import scheduleData from '../../data/schedule.json';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';

interface StatsViewProps {
  records: AttendanceRecord[];
}

export const StatsView: React.FC<StatsViewProps> = ({ records }) => {
  const [filterMode, setFilterMode] = useState<'month' | 'all'>('month');

  // Окремий стан для обраного місяця (за замовчуванням — поточний місяць системи)
  const [selectedDate, setSelectedDate] = useState(() => new Date());

  const monthNames = [
    'Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень',
    'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'
  ];

  const selectedYear = selectedDate.getFullYear();
  const selectedMonthIndex = selectedDate.getMonth();
  const selectedMonthTitle = monthNames[selectedMonthIndex];

  // Рядок у форматі "YYYY-MM" для точної фільтрації записів
  const selectedYearMonth = `${selectedYear}-${String(selectedMonthIndex + 1).padStart(2, '0')}`;

  const changeMonth = (offset: number) => {
    setSelectedDate((prev) => {
      const next = new Date(prev);
      next.setMonth(next.getMonth() + offset);
      return next;
    });
  };

  // Фільтрація: або обраний місяць, або весь семестр
  const filteredRecords = filterMode === 'month'
    ? records.filter((r) => r.date.startsWith(selectedYearMonth))
    : records;

  const allLessons = scheduleData.flatMap((d) => d.lessons) as Lesson[];

  const totalMarked = filteredRecords.length;
  const presentCount = filteredRecords.filter((r) => r.status === 'present').length;
  const absentCount = filteredRecords.filter((r) => r.status === 'absent').length;
  const excusedCount = filteredRecords.filter((r) => r.status === 'excused').length;

  const totalAttended = presentCount + excusedCount;
  const percentage = totalMarked > 0 ? Math.round((totalAttended / totalMarked) * 100) : 100;

  // Групування за предметами
  const subjectsMap: Record<string, { present: number; absent: number; excused: number }> = {};

  filteredRecords.forEach((rec) => {
    const lesson = allLessons.find((l) => l.id === rec.lessonId);
    if (!lesson) return;

    if (!subjectsMap[lesson.name]) {
      subjectsMap[lesson.name] = { present: 0, absent: 0, excused: 0 };
    }
    subjectsMap[lesson.name][rec.status]++;
  });

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      {/* Перемикач режимів: Місяць / Семестр */}
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold tracking-tight text-white">Відвідуваність</h2>

        <div className="flex bg-[#1C1C1E] p-1 rounded-xl border border-white/5">
          <button
            type="button"
            onClick={() => setFilterMode('month')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              filterMode === 'month'
                ? 'bg-[#2C2C2E] text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            По місяцях
          </button>
          <button
            type="button"
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
              filterMode === 'all'
                ? 'bg-[#2C2C2E] text-white shadow-sm'
                : 'text-neutral-400 hover:text-white'
            }`}
          >
            Весь семестр
          </button>
        </div>
      </div>

      {/* Селектор гортання місяців (активний у режимі "По місяцях") */}
      {filterMode === 'month' && (
        <div className="bg-[#1C1C1E] px-4 py-2.5 rounded-2xl border border-white/5 flex items-center justify-between">
          <span className="text-xs text-neutral-400">Період звіту:</span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => changeMonth(-1)}
              className="p-1 rounded-lg hover:bg-white/10 active:scale-90 text-neutral-300 transition-all"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="text-xs font-bold text-white min-w-[100px] text-center">
              {selectedMonthTitle} {selectedYear}
            </span>
            <button
              type="button"
              onClick={() => changeMonth(1)}
              className="p-1 rounded-lg hover:bg-white/10 active:scale-90 text-neutral-300 transition-all"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Головна картка статистики */}
      <div className="bg-[#1C1C1E] border border-white/5 rounded-3xl p-5 text-center">
        <div className="text-5xl font-extrabold text-white mb-1 tracking-tight">
          {percentage}%
        </div>
        <p className="text-xs font-medium text-neutral-400 flex items-center justify-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-[#0A84FF]" />
          {filterMode === 'month'
            ? `Дані за ${selectedMonthTitle} ${selectedYear}`
            : 'Загальні дані за весь семестр'}
        </p>

        <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-white/5 text-center">
          <div className="bg-emerald-500/10 rounded-xl p-2">
            <span className="block text-base font-bold text-emerald-400">{presentCount}</span>
            <span className="text-[10px] text-neutral-400">Був</span>
          </div>
          <div className="bg-rose-500/10 rounded-xl p-2">
            <span className="block text-base font-bold text-rose-400">{absentCount}</span>
            <span className="text-[10px] text-neutral-400">Н-ка</span>
          </div>
          <div className="bg-amber-500/10 rounded-xl p-2">
            <span className="block text-base font-bold text-amber-400">{excusedCount}</span>
            <span className="text-[10px] text-neutral-400">Поважна</span>
          </div>
        </div>
      </div>

      {/* Розбивка по предметах */}
      <div className="space-y-2.5">
        <h3 className="text-sm font-semibold text-neutral-300 px-1">
          {filterMode === 'month' ? `Предмети за ${selectedMonthTitle}` : 'Усі предмети'}
        </h3>
        {Object.keys(subjectsMap).length === 0 ? (
          <p className="text-xs text-neutral-500 text-center py-6">
            За цей період відміток немає.
          </p>
        ) : (
          Object.entries(subjectsMap).map(([name, data]) => {
            const subjectTotal = data.present + data.absent + data.excused;
            const subPercentage = Math.round(((data.present + data.excused) / subjectTotal) * 100);

            return (
              <div key={name} className="bg-[#1C1C1E] border border-white/5 rounded-xl p-3.5 space-y-2">
                <div className="flex justify-between items-start">
                  <h4 className="text-xs font-semibold text-white max-w-[75%]">{name}</h4>
                  <span className="text-xs font-bold text-[#0A84FF]">{subPercentage}%</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-1.5 overflow-hidden flex">
                  <div style={{ width: `${(data.present / subjectTotal) * 100}%` }} className="bg-emerald-500 h-full" />
                  <div style={{ width: `${(data.excused / subjectTotal) * 100}%` }} className="bg-amber-500 h-full" />
                  <div style={{ width: `${(data.absent / subjectTotal) * 100}%` }} className="bg-rose-500 h-full" />
                </div>
                <div className="flex justify-between text-[10px] text-neutral-400">
                  <span>Відвідано: {data.present + data.excused}</span>
                  <span>Пропусків: {data.absent}</span>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
