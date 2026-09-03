import { useState, useEffect } from 'react';
import { Lesson } from '../types';

export const useCurrentPair = (lessons: Lesson[]) => {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 10000);
    return () => clearInterval(timer);
  }, []);

  const currentTimeStr = `${String(now.getHours()).padStart(2, '0')}:${String(
    now.getMinutes()
  ).padStart(2, '0')}`;

  const currentLesson = lessons.find(
    (l) => currentTimeStr >= l.startTime && currentTimeStr <= l.endTime
  );

  const nextLesson = lessons.find((l) => l.startTime > currentTimeStr);

  return { currentLesson, nextLesson, currentTimeStr };
};
