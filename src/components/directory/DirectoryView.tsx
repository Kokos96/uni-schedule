import React, { useState } from 'react';
import { DoorOpen, Users } from '@phosphor-icons/react';
import type { Classroom, ScheduleDay, Teacher } from '../../types';
import {
  classroomsData as defaultClassroomsData,
  classroomsMap as defaultClassroomsMap,
  scheduleData as defaultScheduleData,
  teachersData as defaultTeachersData,
  teachersMap as defaultTeachersMap,
} from '../../utils/schedule';
import { ClassroomsList } from '../classrooms/ClassroomsList';
import { PageTransition } from '../motion/MotionPrimitives';
import { TeachersList } from '../teachers/TeachersList';
import { MetaChip } from '../ui/Badge';
import { EditorialUnderline } from '../ui/EditorialOrnaments';
import { SegmentedControl } from '../ui/SegmentedControl';

export type DirectorySection = 'teachers' | 'classrooms';

export interface DirectoryViewProps {
  initialSection?: DirectorySection;
  teachers?: readonly Teacher[];
  classrooms?: readonly Classroom[];
  schedule?: readonly ScheduleDay[];
  teachersMap?: Map<string, Teacher>;
  classroomsMap?: Map<string, Classroom>;
}

export const DirectoryView: React.FC<DirectoryViewProps> = ({
  initialSection = 'teachers',
  teachers = defaultTeachersData,
  classrooms = defaultClassroomsData,
  schedule = defaultScheduleData,
  teachersMap = defaultTeachersMap,
  classroomsMap = defaultClassroomsMap,
}) => {
  const [section, setSection] = useState<DirectorySection>(initialSection);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <MetaChip variant="beige" mono>
              Викладачів: {teachers.length}
            </MetaChip>
            <MetaChip variant="neutral" mono>
              Аудиторій: {classrooms.length}
            </MetaChip>
          </div>
          <h2 className="mt-1.5 font-serif text-2xl font-medium tracking-[-0.015em] text-ink sm:text-[26px]">
            Довідник
          </h2>
          <EditorialUnderline width={80} className="mt-1.5" />
        </div>

        <SegmentedControl<DirectorySection>
          layoutId="directory-section-switch"
          ariaLabel="Розділ довідника"
          size="md"
          value={section}
          onChange={setSection}
          options={[
            {
              value: 'teachers',
              label: 'Викладачі',
              icon: <Users weight="duotone" className="h-4 w-4" />,
            },
            {
              value: 'classrooms',
              label: 'Аудиторії',
              icon: <DoorOpen weight="duotone" className="h-4 w-4" />,
            },
          ]}
        />
      </div>

      {/* Active Directory Section */}
      <PageTransition
        pageKey={section}
        direction={section === 'classrooms' ? 1 : -1}
      >
        {section === 'teachers' ? (
          <TeachersList
            teachers={teachers}
            schedule={schedule}
            classroomsMap={classroomsMap}
          />
        ) : (
          <ClassroomsList
            classrooms={classrooms}
            schedule={schedule}
            teachersMap={teachersMap}
          />
        )}
      </PageTransition>
    </div>
  );
};
