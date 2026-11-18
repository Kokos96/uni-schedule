import React, { useEffect, useMemo, useState } from 'react';
import { CalendarPlus, Note } from '@phosphor-icons/react';
import type { Classroom, Lesson, Teacher } from '../../types';
import type {
  CreateDeadlineInput,
  DeadlineItem,
  LessonNote,
  SaveNoteInput,
} from '../../types/notes';
import { formatShortDateUa } from '../../utils/date';
import { LessonTypeBadge, MetaChip } from '../ui/Badge';
import { ModalDrawer } from '../ui/ModalDrawer';
import { SegmentedControl } from '../ui/SegmentedControl';
import { LessonDeadlineTab } from './LessonDeadlineTab';
import { LessonNoteTab } from './LessonNoteTab';

export interface LessonNotesDrawerProps {
  open: boolean;
  onClose: () => void;
  lesson: Lesson | null;
  dateIso: string;
  notes: readonly LessonNote[];
  onSaveNote: (input: SaveNoteInput) => LessonNote;
  onDeleteNote: (id: string) => void;
  onCreateDeadline?: (input: CreateDeadlineInput) => DeadlineItem;
  teacher?: Teacher;
  classroom?: Classroom;
}

type DrawerTab = 'notes' | 'deadline';

export const LessonNotesDrawer: React.FC<LessonNotesDrawerProps> = ({
  open,
  onClose,
  lesson,
  dateIso,
  notes,
  onSaveNote,
  onDeleteNote,
  onCreateDeadline,
  teacher,
  classroom,
}) => {
  const [activeTab, setActiveTab] = useState<DrawerTab>('notes');

  useEffect(() => {
    if (open) {
      setActiveTab('notes');
    }
  }, [open, lesson?.id, dateIso]);

  const lessonNotes = useMemo(() => {
    if (!lesson) return [];
    return notes
      .filter(
        (n) =>
          n.lessonId === lesson.id &&
          (n.date === undefined || n.date === dateIso)
      )
      .sort((a, b) => {
        if (a.date && !b.date) return -1;
        if (!a.date && b.date) return 1;
        return b.updatedAt.localeCompare(a.updatedAt);
      });
  }, [notes, lesson, dateIso]);

  const drawerTitle = lesson ? (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <MetaChip variant="amber" mono>
          {lesson.startTime}–{lesson.endTime}
        </MetaChip>
        <LessonTypeBadge type={lesson.type} compact />
        <MetaChip variant="neutral" mono>
          {formatShortDateUa(dateIso)}
        </MetaChip>
      </div>
      <div className="font-serif text-lg font-medium leading-snug text-ink">
        {lesson.name}
      </div>
    </div>
  ) : (
    'Нотатки'
  );

  const drawerDescription = [
    classroom ? `Ауд. ${classroom.code} (${classroom.building})` : null,
    teacher?.fullName ?? null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <ModalDrawer
      open={open && lesson !== null}
      onClose={onClose}
      title={drawerTitle}
      description={drawerDescription || undefined}
      maxWidthClassName="md:max-w-[540px]"
    >
      {lesson && (
        <div className="space-y-5">
          {onCreateDeadline && (
            <SegmentedControl<DrawerTab>
              layoutId="lesson-drawer-tab"
              ariaLabel="Розділ картки пари"
              fullWidth
              size="sm"
              value={activeTab}
              onChange={setActiveTab}
              options={[
                {
                  value: 'notes',
                  label: `Нотатки (${lessonNotes.length})`,
                  icon: <Note className="h-3.5 w-3.5" weight="regular" />,
                },
                {
                  value: 'deadline',
                  label: 'Створити дедлайн',
                  icon: <CalendarPlus className="h-3.5 w-3.5" weight="regular" />,
                },
              ]}
            />
          )}

          {activeTab === 'notes' ? (
            <LessonNoteTab
              lesson={lesson}
              dateIso={dateIso}
              lessonNotes={lessonNotes}
              onSaveNote={onSaveNote}
              onDeleteNote={onDeleteNote}
              onCreateDeadline={onCreateDeadline}
            />
          ) : (
            onCreateDeadline && (
              <LessonDeadlineTab
                lesson={lesson}
                dateIso={dateIso}
                onCreateDeadline={onCreateDeadline}
                onCreated={() => setActiveTab('notes')}
              />
            )
          )}
        </div>
      )}
    </ModalDrawer>
  );
};
