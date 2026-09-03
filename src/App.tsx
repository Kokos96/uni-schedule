import React, { useState } from 'react';
import { BottomNav, TabType } from './components/layout/BottomNav';
import { PairCard } from './components/schedule/PairCard';
import { StatsView } from './components/stats/StatsView';
import { SettingsView } from './components/settings/SettingsView';
import { useAttendance } from './hooks/useAttendance';
import { useCurrentPair } from './hooks/useCurrentPair';
import { useSettings } from './hooks/useSettings';
import scheduleData from './data/schedule.json';
import teachersData from './data/teachers.json';
import classroomsData from './data/classrooms.json';
import { Lesson, Teacher, Classroom } from './types';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  const [selectedDay, setSelectedDay] = useState<number>(() => {
    const today = new Date().getDay();
    return today >= 1 && today <= 5 ? today : 1;
  });

  const { settings, updateSettings } = useSettings();
  const { records, toggleAttendance, getStatus } = useAttendance();

  const currentDayData = scheduleData.find((d) => d.dayNumber === selectedDay);
  const rawLessons = (currentDayData ? currentDayData.lessons : []) as Lesson[];

  // Фільтрація за підгрупою та вибірковою парою з налаштувань
  const filteredLessons = rawLessons.filter((lesson) => {
    if (lesson.subgroup && lesson.subgroup !== settings.subgroup) {
      return false;
    }
    if (lesson.isElective && settings.electiveCourse !== 'both') {
      if (lesson.electiveKey && lesson.electiveKey !== settings.electiveCourse) {
        return false;
      }
    }
    return true;
  });

  const { currentLesson } = useCurrentPair(filteredLessons);

  const days = [
    { num: 1, label: 'Пн' },
    { num: 2, label: 'Вт' },
    { num: 3, label: 'Ср' },
    { num: 4, label: 'Чт' },
    { num: 5, label: 'Пт' },
  ];

  return (
    <div className="min-h-screen bg-black text-white pb-24 pt-safe select-none">
      {/* Верхня панель */}
      <header className="px-4 py-3 max-w-md mx-auto flex justify-between items-center border-b border-white/5">
        <div>
          <span className="text-[11px] font-semibold text-[#0A84FF] uppercase tracking-wider">
            ФЕП-33с • Підгрупа {settings.subgroup}
          </span>
          <h1 className="text-xl font-bold tracking-tight">Розклад занять</h1>
        </div>
      </header>

      {/* 1. РОЗКЛАД */}
      {activeTab === 'schedule' && (
        <main className="max-w-md mx-auto px-4 py-4 space-y-4">
          {/* Перемикач днів */}
          <div className="flex bg-[#1C1C1E] p-1 rounded-xl border border-white/5">
            {days.map((d) => (
              <button
                key={d.num}
                type="button"
                onClick={() => setSelectedDay(d.num)}
                className={`flex-1 py-2 rounded-lg text-xs font-semibold transition-all ${
                  selectedDay === d.num
                    ? 'bg-[#2C2C2E] text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {/* Список пар */}
          <div className="space-y-3">
            {filteredLessons.length === 0 ? (
              <div className="text-center py-12 text-neutral-500 text-sm">
                Пар немає, можна відпочивати 🌴
              </div>
            ) : (
              filteredLessons.map((lesson) => {
                const teacher = teachersData.find((t) => t.id === lesson.teacherId) as Teacher | undefined;
                const classroom = classroomsData.find((c) => c.id === lesson.classroomId) as Classroom | undefined;
                const todayIso = new Date().toISOString().split('T')[0];

                return (
                  <PairCard
                    key={lesson.id}
                    lesson={lesson}
                    teacher={teacher}
                    classroom={classroom}
                    isCurrent={currentLesson?.id === lesson.id}
                    attendanceStatus={getStatus(lesson.id, todayIso)}
                    onToggleAttendance={(status) => toggleAttendance(lesson.id, todayIso, status)}
                  />
                );
              })
            )}
          </div>
        </main>
      )}

      {/* 2. ВІДВІДУВАНІСТЬ */}
      {activeTab === 'stats' && <StatsView records={records} />}

      {/* 3. ВИКЛАДАЧІ */}
      {activeTab === 'teachers' && (
        <div className="p-4 max-w-md mx-auto space-y-3">
          <h2 className="text-xl font-bold tracking-tight mb-2">Викладачі кафедри</h2>
          {teachersData.map((t) => (
            <div key={t.id} className="bg-[#1C1C1E] p-3.5 rounded-2xl border border-white/5 space-y-1.5">
              <h4 className="text-sm font-semibold text-white">{t.fullName}</h4>
              <p className="text-xs text-neutral-400">{t.department}</p>
              <div className="flex flex-wrap gap-1.5 pt-1">
                {t.subjects.map((s, idx) => (
                  <span key={idx} className="text-[10px] bg-white/5 px-2 py-0.5 rounded-md text-neutral-300">
                    {s}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* 4. АУДИТОРІЇ */}
      {activeTab === 'classrooms' && (
        <div className="p-4 max-w-md mx-auto space-y-3">
          <h2 className="text-xl font-bold tracking-tight mb-2">Аудиторії та корпуси</h2>
          <div className="grid grid-cols-2 gap-2.5">
            {classroomsData.map((c) => (
              <div key={c.id} className="bg-[#1C1C1E] p-3.5 rounded-2xl border border-white/5">
                <span className="text-base font-bold text-white block">{c.code}</span>
                <span className="text-xs text-neutral-400">{c.building}, {c.floor} пов.</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 5. НАЛАШТУВАННЯ */}
      {activeTab === 'settings' && (
        <SettingsView settings={settings} onUpdate={updateSettings} />
      )}

      {/* Нижній таб-бар */}
      <BottomNav currentTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default App;