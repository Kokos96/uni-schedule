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
import { ChevronLeft, ChevronRight, RotateCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('schedule');
  
  const [currentDate, setCurrentDate] = useState<Date>(() => new Date());

  const { settings, updateSettings } = useSettings();
  const { records, toggleAttendance, getStatus } = useAttendance();

  const formatIsoDate = (d: Date) => {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };

  const selectedIso = formatIsoDate(currentDate);

  const dayOfWeek = currentDate.getDay();
  const scheduleDayNumber = dayOfWeek === 0 ? 7 : dayOfWeek;

  const changeDateByDays = (days: number) => {
    setCurrentDate((prev) => {
      const next = new Date(prev);
      next.setDate(next.getDate() + days);
      return next;
    });
  };

  const resetToToday = () => {
    setCurrentDate(new Date());
  };

  const getWeekDates = () => {
    const curr = new Date(currentDate);
    const first = curr.getDate() - (curr.getDay() === 0 ? 6 : curr.getDay() - 1);
    return [0, 1, 2, 3, 4].map((offset) => {
      const d = new Date(curr);
      d.setDate(first + offset);
      return d;
    });
  };

  const weekDates = getWeekDates();
  const dayNamesShort = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт'];

  const currentDayData = scheduleData.find((d) => d.dayNumber === scheduleDayNumber);
  const rawLessons = (currentDayData ? currentDayData.lessons : []) as Lesson[];

  const filteredLessons = rawLessons.filter((lesson) => {
    if (lesson.subgroup && lesson.subgroup !== settings.subgroup) return false;
    if (lesson.departments && !lesson.departments.includes(settings.department)) return false;
    if (lesson.isElective && settings.electiveCourse !== 'both') {
      if (lesson.electiveKey && lesson.electiveKey !== settings.electiveCourse) return false;
    }
    return true;
  });

  const { currentLesson } = useCurrentPair(filteredLessons);

  const monthNamesGenitive = [
    'січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
    'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'
  ];

  return (
    <div className="min-h-screen bg-black text-white pb-24 pt-safe select-none">
      {/* Лаконічна верхня панель */}
      <header className="px-4 py-3 max-w-md mx-auto border-b border-white/5">
        <span className="text-[11px] font-semibold text-[#0A84FF] uppercase tracking-wider">
          ФЕП-33с • {settings.department.toUpperCase()} • Підгр. {settings.subgroup}
        </span>
        <h1 className="text-xl font-bold tracking-tight">Розклад занять</h1>
      </header>

      {/* 1. РОЗКЛАД */}
      {activeTab === 'schedule' && (
        <main className="max-w-md mx-auto px-4 py-4 space-y-4">
          <div className="bg-[#1C1C1E] p-3 rounded-2xl border border-white/5 space-y-3">
            {/* Місяць, стрілки гортання та кнопка повернення на Сьогодні */}
            <div className="flex items-center justify-between px-1">
              <span className="text-sm font-bold text-white capitalize">
                {currentDate.getDate()} {monthNamesGenitive[currentDate.getMonth()]}, {currentDate.getFullYear()}
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={resetToToday}
                  className="text-[11px] font-medium bg-white/5 hover:bg-white/10 text-neutral-300 px-2 py-1 rounded-lg flex items-center gap-1 transition-all active:scale-95"
                  title="Повернутися на сьогодні"
                >
                  <RotateCcw className="w-3 h-3 text-[#0A84FF]" />
                  Сьогодні
                </button>
                <div className="w-[1px] h-3.5 bg-white/10 mx-0.5" />
                <button
                  type="button"
                  onClick={() => changeDateByDays(-7)}
                  className="p-1 rounded-lg hover:bg-white/10 active:scale-90 text-neutral-400 hover:text-white transition-all"
                  title="Попередній тиждень"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => changeDateByDays(7)}
                  className="p-1 rounded-lg hover:bg-white/10 active:scale-90 text-neutral-400 hover:text-white transition-all"
                  title="Наступний тиждень"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Стрічка днів */}
            <div className="flex gap-1.5">
              {weekDates.map((d, index) => {
                const isSelected = formatIsoDate(d) === selectedIso;
                const isToday = formatIsoDate(d) === formatIsoDate(new Date());

                return (
                  <button
                    key={d.toISOString()}
                    type="button"
                    onClick={() => setCurrentDate(new Date(d))}
                    className={`flex-1 py-2 rounded-xl flex flex-col items-center justify-center transition-all ${
                      isSelected
                        ? 'bg-[#0A84FF] text-white shadow-md shadow-[#0A84FF]/25 scale-[1.02]'
                        : 'bg-black/30 text-neutral-400 hover:text-white hover:bg-black/50'
                    }`}
                  >
                    <span className="text-[10px] font-semibold uppercase">{dayNamesShort[index]}</span>
                    <span className={`text-sm font-bold mt-0.5 ${isToday && !isSelected ? 'text-[#0A84FF]' : ''}`}>
                      {d.getDate()}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Список пар */}
          <AnimatePresence mode="wait">
            <motion.div
              key={selectedIso}
              initial={{ opacity: 0, x: 6 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -6 }}
              transition={{ duration: 0.15 }}
              className="space-y-3"
            >
              {filteredLessons.length === 0 ? (
                <div className="text-center py-12 text-neutral-500 text-sm">
                  {scheduleDayNumber > 5 ? 'Вихідний день 🏖️' : 'Пар немає, можна відпочивати 🌴'}
                </div>
              ) : (
                filteredLessons.map((lesson) => {
                  const teacher = teachersData.find((t) => t.id === lesson.teacherId) as Teacher | undefined;
                  const classroom = classroomsData.find((c) => c.id === lesson.classroomId) as Classroom | undefined;

                  return (
                    <PairCard
                      key={lesson.id}
                      lesson={lesson}
                      teacher={teacher}
                      classroom={classroom}
                      isCurrent={currentLesson?.id === lesson.id && formatIsoDate(new Date()) === selectedIso}
                      attendanceStatus={getStatus(lesson.id, selectedIso)}
                      onToggleAttendance={(status) => toggleAttendance(lesson.id, selectedIso, status)}
                    />
                  );
                })
              )}
            </motion.div>
          </AnimatePresence>
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

      {/* 4. НАЛАШТУВАННЯ */}
      {activeTab === 'settings' && (
        <SettingsView settings={settings} onUpdate={updateSettings} />
      )}

      {/* Нижній таб-бар */}
      <BottomNav currentTab={activeTab} onTabChange={setActiveTab} />
    </div>
  );
};

export default App;
