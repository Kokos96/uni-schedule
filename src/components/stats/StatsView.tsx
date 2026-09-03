import React from 'react';
import { AttendanceRecord, Lesson } from '../../types';
import scheduleData from '../../data/schedule.json';

interface StatsViewProps {
  records: AttendanceRecord[];
}

export const StatsView: React.FC<StatsViewProps> = ({ records }) => {
  const allLessons = scheduleData.flatMap((d) => d.lessons) as Lesson[];

  const totalMarked = records.length;
  const presentCount = records.filter((r) => r.status === 'present').length;
  const absentCount = records.filter((r) => r.status === 'absent').length;
  const excusedCount = records.filter((r) => r.status === 'excused').length;

  const totalAttended = presentCount + excusedCount;
  const percentage = totalMarked > 0 ? Math.round((totalAttended / totalMarked) * 100) : 100;

  const subjectsMap: Record<string, { present: number; absent: number; excused: number }> = {};

  records.forEach((rec) => {
    const lesson = allLessons.find((l) => l.id === rec.lessonId);
    if (!lesson) return;

    if (!subjectsMap[lesson.name]) {
      subjectsMap[lesson.name] = { present: 0, absent: 0, excused: 0 };
    }
    subjectsMap[lesson.name][rec.status]++;
  });

  return (
    <div className="p-4 space-y-4 max-w-md mx-auto">
      <h2 className="text-xl font-bold tracking-tight text-white">Статистика відвідування</h2>

      <div className="bg-[#1C1C1E] border border-white/5 rounded-3xl p-5 text-center">
        <div className="text-5xl font-extrabold text-white mb-1 tracking-tight">
          {percentage}%
        </div>
        <p className="text-xs font-medium text-neutral-400">
          Загальний рівень присутності
        </p>

        <div className="grid grid-cols-3 gap-2 mt-5 pt-4 border-t border-white/5 text-center">
          <div className="bg-emerald-500/10 rounded-xl p-2">
            <span className="block text-base font-bold text-emerald-400">{presentCount}</span>
            <span className="text-[10px] text-neutral-400">Присутній</span>
          </div>
          <div className="bg-rose-500/10 rounded-xl p-2">
            <span className="block text-base font-bold text-rose-400">{absentCount}</span>
            <span className="text-[10px] text-neutral-400">Пропущено</span>
          </div>
          <div className="bg-amber-500/10 rounded-xl p-2">
            <span className="block text-base font-bold text-amber-400">{excusedCount}</span>
            <span className="text-[10px] text-neutral-400">Поважна</span>
          </div>
        </div>
      </div>

      <div className="space-y-2.5">
        <h3 className="text-sm font-semibold text-neutral-300 px-1">По предметах</h3>
        {Object.keys(subjectsMap).length === 0 ? (
          <p className="text-xs text-neutral-500 text-center py-6">
            Поки немає відміток. Відмічай пари у вкладці «Розклад».
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
