import { useState, useEffect } from 'react';
import { AttendanceRecord, AttendanceStatus } from '../types';

const STORAGE_KEY = 'uni_schedule_attendance_v1';

export const useAttendance = () => {
  const [records, setRecords] = useState<AttendanceRecord[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
  }, [records]);

  const toggleAttendance = (lessonId: string, date: string, status: AttendanceStatus) => {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(15);
    }

    setRecords((prev) => {
      const existingIndex = prev.findIndex(
        (r) => r.lessonId === lessonId && r.date === date
      );

      if (existingIndex > -1) {
        if (prev[existingIndex].status === status) {
          return prev.filter((_, idx) => idx !== existingIndex);
        }
        const updated = [...prev];
        updated[existingIndex].status = status;
        return updated;
      }

      return [...prev, { lessonId, date, status }];
    });
  };

  const getStatus = (lessonId: string, date: string): AttendanceStatus | null => {
    const record = records.find((r) => r.lessonId === lessonId && r.date === date);
    return record ? record.status : null;
  };

  return { records, toggleAttendance, getStatus };
};
