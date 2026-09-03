import React from 'react';
import { Lesson, Teacher, Classroom, AttendanceStatus } from '../../types';
import { Check, X, Clock, MapPin, User } from 'lucide-react';

interface PairCardProps {
  lesson: Lesson;
  teacher?: Teacher;
  classroom?: Classroom;
  attendanceStatus: AttendanceStatus | null;
  onToggleAttendance: (status: AttendanceStatus) => void;
  isCurrent?: boolean;
}

export const PairCard: React.FC<PairCardProps> = ({
  lesson,
  teacher,
  classroom,
  attendanceStatus,
  onToggleAttendance,
  isCurrent,
}) => {
  const badgeColor = {
    Лекція: 'bg-blue-500/15 text-blue-400 border-blue-500/20',
    Практична: 'bg-amber-500/15 text-amber-400 border-amber-500/20',
    Лабораторна: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/20',
  }[lesson.type];

  return (
    <div
      className={`rounded-2xl p-4 transition-all duration-200 border ${
        isCurrent
          ? 'bg-[#1C1C1E] border-[#0A84FF] shadow-lg shadow-[#0A84FF]/10'
          : 'bg-[#1C1C1E]/80 border-white/5'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center w-6 h-6 rounded-full bg-white/10 text-xs font-bold text-neutral-300">
            {lesson.order}
          </span>
          <span className="text-xs font-medium text-neutral-400">
            {lesson.startTime} – {lesson.endTime}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          {lesson.subgroup && (
            <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 border border-purple-500/20">
              Підгр. {lesson.subgroup}
            </span>
          )}
          <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full border ${badgeColor}`}>
            {lesson.type}
          </span>
        </div>
      </div>

      <h3 className="text-base font-semibold text-white tracking-tight mb-3">
        {lesson.name}
      </h3>

      <div className="space-y-1.5 text-xs text-neutral-300 mb-4">
        {classroom && (
          <div className="flex items-center gap-2">
            <MapPin className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span>Аудиторія: <strong className="text-white font-medium">{classroom.code}</strong> ({classroom.building})</span>
          </div>
        )}
        {teacher && (
          <div className="flex items-center gap-2">
            <User className="w-3.5 h-3.5 text-neutral-400 shrink-0" />
            <span className="truncate">{teacher.fullName}</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 pt-2 border-t border-white/5">
        <span className="text-[11px] text-neutral-400 mr-auto font-medium">Відмітка:</span>
        <button
          type="button"
          onClick={() => onToggleAttendance('present')}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 ${
            attendanceStatus === 'present'
              ? 'bg-emerald-500 text-white font-semibold'
              : 'bg-white/5 text-neutral-300 hover:bg-white/10'
          }`}
        >
          <Check className="w-3.5 h-3.5" />
          Був
        </button>
        <button
          type="button"
          onClick={() => onToggleAttendance('absent')}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 ${
            attendanceStatus === 'absent'
              ? 'bg-rose-500 text-white font-semibold'
              : 'bg-white/5 text-neutral-300 hover:bg-white/10'
          }`}
        >
          <X className="w-3.5 h-3.5" />
          Н-ка
        </button>
        <button
          type="button"
          onClick={() => onToggleAttendance('excused')}
          className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all active:scale-95 ${
            attendanceStatus === 'excused'
              ? 'bg-amber-500 text-black font-semibold'
              : 'bg-white/5 text-neutral-300 hover:bg-white/10'
          }`}
        >
          <Clock className="w-3.5 h-3.5" />
          Поважна
        </button>
      </div>
    </div>
  );
};
