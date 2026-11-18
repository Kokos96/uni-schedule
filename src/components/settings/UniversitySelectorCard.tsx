import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowsClockwise,
  CheckCircle,
  GraduationCap,
  Info,
  WarningCircle,
} from '@phosphor-icons/react';
import type { ScheduleSyncStatus } from '../../hooks/useScheduleSource';
import {
  getUniversityAdapter,
  listUniversities,
} from '../../integrations/universities/registry';
import type {
  Course,
  Faculty,
  Group,
  StudentSelection,
} from '../../integrations/universities/types';
import type { ResolvedUserSettings, UserSettings } from '../../types';
import { MetaChip } from '../ui/Badge';
import { GlassCard } from '../ui/GlassCard';
import { useToast } from '../ui/Toast';

export interface UniversitySelectorCardProps {
  resolved: ResolvedUserSettings;
  onUpdate: (newSettings: Partial<UserSettings>) => void;
  syncStatus?: ScheduleSyncStatus;
  lastSyncedAt?: string | null;
  syncError?: string | null;
  onSyncGroupSchedule?: (selection: StudentSelection) => Promise<boolean>;
  onResetBuiltinSchedule?: () => void;
}

export const UniversitySelectorCard: React.FC<UniversitySelectorCardProps> = ({
  resolved,
  onUpdate,
  syncStatus = 'builtin',
  lastSyncedAt,
  syncError,
  onSyncGroupSchedule,
  onResetBuiltinSchedule,
}) => {
  const { toast } = useToast();
  const universities = useMemo(() => listUniversities(), []);

  const currentProfile = resolved.universityProfile;
  const [selectedUniId, setSelectedUniId] = useState<string>(
    currentProfile?.universityId ?? 'lnu'
  );
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const [facultyId, setFacultyId] = useState<string>(
    currentProfile?.facultyId ?? '1005'
  );
  const [courseNum, setCourseNum] = useState<number>(
    currentProfile?.course ?? 3
  );
  const [groupInput, setGroupInput] = useState<string>(
    currentProfile?.groupName ?? 'ФЕП-33с'
  );

  const adapter = useMemo(
    () => getUniversityAdapter(selectedUniId),
    [selectedUniId]
  );

  useEffect(() => {
    if (!adapter) return;
    let cancelled = false;

    const loadMeta = async () => {
      const [facList, courseList] = await Promise.all([
        adapter.getFaculties(),
        adapter.getCourses(),
      ]);
      if (cancelled) return;
      setFaculties(facList);
      setCourses(courseList);

      if (adapter.meta.supportStatus === 'live') {
        setLoadingGroups(true);
        setGroupsError(null);
        try {
          const groupList = await adapter.getGroups({ course: courseNum });
          if (!cancelled) {
            setGroups(groupList);
          }
        } catch (err) {
          if (!cancelled) {
            setGroups([]);
            setGroupsError(
              err instanceof Error
                ? err.message
                : 'Не вдалося завантажити список груп.'
            );
          }
        } finally {
          if (!cancelled) setLoadingGroups(false);
        }
      } else {
        setGroups([]);
        setGroupsError(null);
      }
    };

    void loadMeta();
    return () => {
      cancelled = true;
    };
  }, [adapter, courseNum]);

  const filteredGroups = useMemo(() => {
    const q = groupInput.trim().toLowerCase();
    if (!q) return groups.slice(0, 60);
    return groups.filter((g) => g.name.toLowerCase().includes(q)).slice(0, 60);
  }, [groups, groupInput]);

  const handleSync = async () => {
    const cleanGroup = groupInput.trim();
    if (!cleanGroup) {
      toast.warning('Вкажіть назву академічної групи');
      return;
    }

    const facultyName = faculties.find((f) => f.id === facultyId)?.name;
    const selection: StudentSelection = {
      universityId: selectedUniId,
      facultyId: facultyId || undefined,
      facultyName,
      course: courseNum,
      groupId: cleanGroup,
      groupName: cleanGroup,
      subgroup: resolved.subgroup,
    };

    onUpdate({ universityProfile: selection });

    if (adapter?.meta.supportStatus === 'manual_only') {
      toast.info('Обрано ручний режим для іншого університету');
      return;
    }

    if (onSyncGroupSchedule) {
      const ok = await onSyncGroupSchedule(selection);
      if (ok) {
        toast.success(`Розклад групи ${cleanGroup} оновлено`);
      } else {
        toast.warning('Не вдалося синхронізувати розклад онлайн');
      }
    }
  };

  const handleResetBuiltin = () => {
    onUpdate({ universityProfile: undefined });
    onResetBuiltinSchedule?.();
    setSelectedUniId('lnu');
    setFacultyId('1005');
    setCourseNum(3);
    setGroupInput('ФЕП-33с');
    toast.info('Повернуто вбудований розклад ФЕП-33с');
  };

  const formattedSyncTime = lastSyncedAt
    ? new Date(lastSyncedAt).toLocaleString('uk-UA', {
        day: '2-digit',
        month: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
      })
    : null;

  return (
    <GlassCard variant="glass" padding="lg" className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.06em] text-ink-secondary">
          <GraduationCap weight="duotone" className="h-4 w-4 text-amber-fg" aria-hidden="true" />
          <span>Університет і група</span>
        </div>

        <MetaChip
          variant={
            syncStatus === 'synced'
              ? 'sage'
              : syncStatus === 'error'
                ? 'terracotta'
                : syncStatus === 'manual'
                  ? 'neutral'
                  : 'amber'
          }
          mono
        >
          {syncStatus === 'synced' && formattedSyncTime
            ? `Оновлено ${formattedSyncTime}`
            : syncStatus === 'syncing'
              ? 'Синхронізація…'
              : syncStatus === 'error'
                ? 'Помилка джерела'
                : syncStatus === 'manual'
                  ? 'Ручний режим'
                  : 'Вбудований ФЕП-33с'}
        </MetaChip>
      </div>

      <div className="space-y-3">
        <div>
          <label
            htmlFor="uni-select"
            className="mb-1 block text-xs font-medium text-ink-secondary"
          >
            Університет
          </label>
          <select
            id="uni-select"
            value={selectedUniId}
            onChange={(e) => setSelectedUniId(e.target.value)}
            className="w-full rounded-xl border border-line bg-surface-elevated/70 px-3 py-2.5 text-xs font-medium text-ink focus:border-amber focus:outline-none"
          >
            {universities.map((u) => (
              <option key={u.id} value={u.id}>
                {u.shortName}
                {u.supportStatus === 'manual_only' ? ' (без автосинхронізації)' : ''}
              </option>
            ))}
          </select>
        </div>

        {adapter?.meta.supportStatus === 'manual_only' ? (
          <div className="flex items-start gap-2.5 rounded-xl border border-line bg-surface-elevated/60 p-3 text-xs text-ink-secondary">
            <Info weight="duotone" className="mt-0.5 h-4 w-4 shrink-0 text-amber-fg" aria-hidden="true" />
            <p className="leading-relaxed">
              {adapter.meta.sourceNote} Ви можете використовувати локальний розклад або імпортувати резервну копію JSON нижче.
            </p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label
                  htmlFor="uni-faculty"
                  className="mb-1 block text-xs font-medium text-ink-secondary"
                >
                  Факультет
                </label>
                <select
                  id="uni-faculty"
                  value={facultyId}
                  onChange={(e) => setFacultyId(e.target.value)}
                  className="w-full rounded-xl border border-line bg-surface-elevated/70 px-3 py-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                >
                  {faculties.map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label
                  htmlFor="uni-course"
                  className="mb-1 block text-xs font-medium text-ink-secondary"
                >
                  Курс
                </label>
                <select
                  id="uni-course"
                  value={courseNum}
                  onChange={(e) => setCourseNum(Number(e.target.value))}
                  className="w-full rounded-xl border border-line bg-surface-elevated/70 px-3 py-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                >
                  {courses.map((c) => (
                    <option key={c.id} value={c.number}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="uni-group"
                className="mb-1 block text-xs font-medium text-ink-secondary"
              >
                Академічна група {loadingGroups ? '(завантаження списку…)' : ''}
              </label>
              <input
                id="uni-group"
                type="text"
                list="uni-groups-datalist"
                value={groupInput}
                onChange={(e) => setGroupInput(e.target.value)}
                placeholder="Напр., ФЕП-33с"
                className="w-full rounded-xl border border-line bg-surface-elevated/70 px-3 py-2.5 text-xs font-medium text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
              />
              <datalist id="uni-groups-datalist">
                {filteredGroups.map((g) => (
                  <option key={g.id} value={g.name} />
                ))}
              </datalist>
              {groupsError && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-secondary">
                  {groupsError}
                </p>
              )}
            </div>
          </>
        )}

        {syncError && syncStatus === 'error' && (
          <div
            role="alert"
            className="flex items-start gap-2 rounded-xl border border-terracotta/40 bg-terracotta-soft px-3 py-2.5 text-xs text-terracotta-fg"
          >
            <WarningCircle weight="duotone" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
            <span className="leading-relaxed">{syncError}</span>
          </div>
        )}

        {syncStatus === 'synced' && (
          <div className="flex items-center gap-2 rounded-xl border border-sage/35 bg-sage-soft px-3 py-2 text-xs text-sage-fg">
            <CheckCircle weight="duotone" className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Активний синхронізований розклад: <strong>{currentProfile?.groupName}</strong>
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            disabled={syncStatus === 'syncing'}
            onClick={() => void handleSync()}
            className="inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl border border-amber/40 bg-amber px-3.5 text-xs font-semibold text-[#242522] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
          >
            <ArrowsClockwise
              weight="bold"
              className={`h-3.5 w-3.5 ${syncStatus === 'syncing' ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>
              {adapter?.meta.supportStatus === 'manual_only'
                ? 'Зберегти вибір'
                : 'Отримати розклад'}
            </span>
          </button>

          {currentProfile && (
            <button
              type="button"
              onClick={handleResetBuiltin}
              className="inline-flex min-h-[38px] items-center justify-center rounded-xl border border-line bg-surface-elevated px-3 text-xs font-medium text-ink-secondary transition-colors hover:border-line-strong hover:text-ink"
            >
              Вбудований ФЕП-33с
            </button>
          )}
        </div>
      </div>
    </GlassCard>
  );
};
