import { normalizeGroupHomoglyphs } from '../../integrations/universities/lnu/lnuParser';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  CheckCircle,
  GraduationCap,
  Info,
  WarningCircle,
} from '@phosphor-icons/react';
import type { ScheduleSyncStatus } from '../../hooks/useScheduleSource';
import type { UseSettingsResult } from '../../hooks/useSettings';
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
  profileSyncStatus?: UseSettingsResult['profileSyncStatus'];
  profileSyncError?: string | null;
  onConfirmProfileOverwrite?: () => void;
  onSyncGroupSchedule?: (selection: StudentSelection, options?: { force?: boolean }) => Promise<boolean>;
  onResetBuiltinSchedule?: () => void;
}

export const UniversitySelectorCard: React.FC<UniversitySelectorCardProps> = ({
  resolved,
  onUpdate,
  syncStatus = 'builtin',
  lastSyncedAt,
  syncError,
  profileSyncStatus = 'idle',
  profileSyncError,
  onConfirmProfileOverwrite,
  onSyncGroupSchedule,
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
  const [comboOpen, setComboOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [searchAllFaculties, setSearchAllFaculties] = useState(false);
  const comboContainerRef = useRef<HTMLDivElement | null>(null);
  const groupsReqSeqRef = useRef(0);

  const [facultyId, setFacultyId] = useState<string>(
    currentProfile?.facultyId ?? ''
  );
  const [courseNum, setCourseNum] = useState<number | undefined>(
    currentProfile?.course
  );
  const [groupInput, setGroupInput] = useState<string>(
    currentProfile?.groupName ?? ''
  );

  const adapter = useMemo(
    () => getUniversityAdapter(selectedUniId),
    [selectedUniId]
  );

  useEffect(() => {
    setSelectedUniId(resolved.universityProfile?.universityId ?? universities[0]?.id ?? 'lnu');
    setFacultyId(resolved.universityProfile?.facultyId ?? '');
    setCourseNum(resolved.universityProfile?.course);
    setGroupInput(resolved.universityProfile?.groupName ?? '');
  }, [resolved.universityProfile, universities]);

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
          const seq = ++groupsReqSeqRef.current;
          const groupList = await adapter.getGroups({
            facultyId: searchAllFaculties ? undefined : (facultyId || undefined),
            course: courseNum,
          });
          if (!cancelled && groupsReqSeqRef.current === seq) {
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
  }, [adapter, facultyId, courseNum, searchAllFaculties]);

  const filteredGroups = useMemo(() => {
    const q = groupInput.trim().toLowerCase();
    const qNorm = q ? normalizeGroupHomoglyphs(q) : '';
    const list = q
      ? groups.filter((g) => g.name.toLowerCase().includes(q) || normalizeGroupHomoglyphs(g.name).includes(qNorm))
      : groups;
    return list.slice(0, 120);
  }, [groups, groupInput]);

  const verifiedGroups = useMemo(
    () => (facultyId && !searchAllFaculties ? filteredGroups.filter((g) => g.facultyVerified) : []),
    [filteredGroups, facultyId, searchAllFaculties]
  );
  const unverifiedGroups = useMemo(
    () => (facultyId && !searchAllFaculties ? filteredGroups.filter((g) => !g.facultyVerified) : filteredGroups),
    [filteredGroups, facultyId, searchAllFaculties]
  );
  const orderedVisibleGroups = useMemo(
    () => [...verifiedGroups, ...unverifiedGroups],
    [verifiedGroups, unverifiedGroups]
  );

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (comboContainerRef.current && !comboContainerRef.current.contains(event.target as Node)) {
        setComboOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const handleSync = async () => {
    const cleanGroup = groupInput.trim();
    if (!cleanGroup) {
      toast.warning('Вкажіть назву академічної групи');
      return;
    }

    const facultyName = faculties.find((f) => f.id === facultyId)?.name;
    const lowerClean = cleanGroup.toLocaleLowerCase('uk-UA');
    const normClean = normalizeGroupHomoglyphs(cleanGroup);
    let matchedGroup = groups.find(
      (g) => g.name.toLocaleLowerCase('uk-UA') === lowerClean || normalizeGroupHomoglyphs(g.name) === normClean
    );
    if (!matchedGroup && groups.length > 0) {
      const prefixMatches = groups.filter((g) =>
        g.name.toLocaleLowerCase('uk-UA').startsWith(lowerClean) || normalizeGroupHomoglyphs(g.name).startsWith(normClean)
      );
      if (prefixMatches.length === 1) {
        matchedGroup = prefixMatches[0];
        setGroupInput(matchedGroup.name);
      }
    }
    const selection: StudentSelection = {
      universityId: selectedUniId,
      facultyId: facultyId || undefined,
      facultyName,
      course: courseNum,
      groupId: matchedGroup?.id ?? cleanGroup,
      groupName: matchedGroup?.name ?? cleanGroup,
      subgroup: resolved.subgroup,
    };

    const groupChanged =
      resolved.universityProfile?.universityId !== selection.universityId ||
      (resolved.universityProfile?.facultyId ?? '') !== (selection.facultyId ?? '') ||
      resolved.universityProfile?.groupId !== selection.groupId;

    if (adapter?.meta.supportStatus === 'manual_only') {
      onUpdate({
        universityProfile: selection,
        scheduleSourceMode: 'manual',
        ...(groupChanged ? { selectedElectives: [], selectedTrack: undefined } : {}),
      });
      toast.info('Обрано ручний режим для іншого університету');
      return;
    }

    if (onSyncGroupSchedule) {
      const ok = await onSyncGroupSchedule(selection, { force: !groupChanged });
      if (ok) {
        onUpdate({
          universityProfile: selection,
          scheduleSourceMode: 'live',
          ...(groupChanged ? { selectedElectives: [], selectedTrack: undefined } : {}),
        });
        toast.success(`Розклад групи ${selection.groupName} оновлено`);
      } else {
        toast.warning('Не вдалося завантажити розклад цієї групи — попередній профіль збережено');
      }
    } else {
      onUpdate({
        universityProfile: selection,
        scheduleSourceMode: 'live',
        ...(groupChanged ? { selectedElectives: [], selectedTrack: undefined } : {}),
      });
    }
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
            resolved.scheduleSourceMode === 'unconfigured'
              ? 'neutral'
              : syncStatus === 'synced'
              ? 'sage'
              : syncStatus === 'error'
                ? 'terracotta'
                : syncStatus === 'manual'
                  ? 'neutral'
                  : 'amber'
          }
          mono
        >
          {resolved.scheduleSourceMode === 'unconfigured'
            ? 'Профіль не налаштовано'
            : resolved.scheduleSourceMode === 'builtin'
              ? 'Перехід на живий розклад…'
            : syncStatus === 'synced' && formattedSyncTime
            ? `Оновлено ${formattedSyncTime}`
            : syncStatus === 'synced'
              ? 'Розклад завантажено'
            : syncStatus === 'syncing'
              ? 'Синхронізація…'
              : syncStatus === 'error'
                ? 'Помилка джерела'
                : syncStatus === 'manual'
                  ? 'Ручний режим'
                  : 'Очікує синхронізації'}
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
            onChange={(e) => {
              setSelectedUniId(e.target.value);
              setFacultyId('');
              setCourseNum(undefined);
              setGroupInput('');
              setGroups([]);
              setGroupsError(null);
            }}
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
                  onChange={(e) => {
                    setFacultyId(e.target.value);
                    setCourseNum(undefined);
                    setGroupInput('');
                    setGroups([]);
                    setGroupsError(null);
                  }}
                  className="w-full rounded-xl border border-line bg-surface-elevated/70 px-3 py-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                >
                  <option value="">Усі факультети</option>
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
                  value={courseNum ?? ''}
                  onChange={(e) => {
                    setCourseNum(e.target.value ? Number(e.target.value) : undefined);
                    setGroupInput('');
                    setGroups([]);
                    setGroupsError(null);
                  }}
                  className="w-full rounded-xl border border-line bg-surface-elevated/70 px-3 py-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                >
                  <option value="">Усі курси</option>
                  {courses.map((c) => (
                    <option key={c.id} value={c.number}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div ref={comboContainerRef} className="relative">
              <div className="mb-1 flex items-center justify-between gap-2">
                <label
                  htmlFor="uni-group"
                  className="block text-xs font-medium text-ink-secondary"
                >
                  Академічна група {loadingGroups ? '(завантаження списку…)' : ''}
                </label>
                {facultyId && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchAllFaculties((prev) => !prev);
                      setComboOpen(true);
                    }}
                    className="text-[11px] font-medium text-amber-fg hover:underline"
                  >
                    {searchAllFaculties ? 'Лише обраний факультет' : 'Шукати серед усіх груп'}
                  </button>
                )}
              </div>
              <input
                id="uni-group"
                type="text"
                role="combobox"
                aria-expanded={comboOpen}
                aria-controls="uni-group-listbox"
                aria-autocomplete="list"
                autoComplete="off"
                value={groupInput}
                onFocus={() => setComboOpen(true)}
                onClick={() => setComboOpen(true)}
                onChange={(e) => {
                  setGroupInput(e.target.value);
                  setHighlightedIndex(0);
                  setComboOpen(true);
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Escape') {
                    setComboOpen(false);
                    return;
                  }
                  if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setComboOpen(true);
                    setHighlightedIndex((idx) =>
                      orderedVisibleGroups.length > 0 ? Math.min(idx + 1, orderedVisibleGroups.length - 1) : 0
                    );
                  } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlightedIndex((idx) => Math.max(0, idx - 1));
                  } else if (e.key === 'Enter' && comboOpen && orderedVisibleGroups[highlightedIndex]) {
                    e.preventDefault();
                    setGroupInput(orderedVisibleGroups[highlightedIndex]!.name);
                    setComboOpen(false);
                  }
                }}
                placeholder="Оберіть або введіть назву групи"
                className="w-full rounded-xl border border-line bg-surface-elevated/70 px-3 py-2.5 text-sm font-medium text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
              />
              {comboOpen && (
                <div
                  id="uni-group-listbox"
                  role="listbox"
                  aria-label="Список академічних груп"
                  className="mt-1.5 max-h-60 overflow-y-auto rounded-xl border border-line bg-surface-elevated p-1 shadow-[0_10px_28px_rgba(0,0,0,0.22)]"
                >
                  {loadingGroups ? (
                    <div className="px-3 py-3 text-xs text-ink-secondary">Завантаження списку груп…</div>
                  ) : orderedVisibleGroups.length === 0 ? (
                    <div className="px-3 py-3 text-xs text-ink-secondary">
                      {groupsError ? groupsError : 'Груп за цим запитом не знайдено.'}
                    </div>
                  ) : (
                    <>
                      {verifiedGroups.length > 0 && (
                        <div>
                          <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-sage-fg">
                            Підтверджені групи факультету
                          </div>
                          {verifiedGroups.map((g, i) => {
                            const selected = g.name.toLocaleLowerCase('uk-UA') === groupInput.trim().toLocaleLowerCase('uk-UA');
                            return (
                              <button
                                key={`v-${g.id}`}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => {
                                  setGroupInput(g.name);
                                  setComboOpen(false);
                                }}
                                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                                  selected || highlightedIndex === i
                                    ? 'bg-amber-soft font-semibold text-amber-fg'
                                    : 'text-ink hover:bg-surface'
                                }`}
                              >
                                <span>{g.name}</span>
                                {g.course && (
                                  <span className="font-mono text-[10px] text-ink-muted">{g.course} курс</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                      {unverifiedGroups.length > 0 && (
                        <div className={verifiedGroups.length > 0 ? 'mt-1 border-t border-line pt-1' : ''}>
                          {facultyId && !searchAllFaculties && (
                            <div className="px-2.5 py-1 text-[10px] font-medium text-ink-muted">
                              Групи без підтвердженої прив&apos;язки до факультету (довідник ЛНУ)
                            </div>
                          )}
                          {unverifiedGroups.map((g, idx) => {
                            const flatIndex = verifiedGroups.length + idx;
                            const selected = g.name.toLocaleLowerCase('uk-UA') === groupInput.trim().toLocaleLowerCase('uk-UA');
                            return (
                              <button
                                key={`u-${g.id}`}
                                type="button"
                                role="option"
                                aria-selected={selected}
                                onClick={() => {
                                  setGroupInput(g.name);
                                  setComboOpen(false);
                                }}
                                className={`flex w-full items-center justify-between rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                                  selected || highlightedIndex === flatIndex
                                    ? 'bg-amber-soft font-semibold text-amber-fg'
                                    : 'text-ink hover:bg-surface'
                                }`}
                              >
                                <span>{g.name}</span>
                                {g.course && (
                                  <span className="font-mono text-[10px] text-ink-muted">{g.course} курс</span>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
              {groupsError && !comboOpen && (
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

        {profileSyncStatus !== 'idle' && (
          <div
            role={profileSyncStatus === 'error' || profileSyncStatus === 'conflict' ? 'alert' : 'status'}
            className="rounded-xl border border-line bg-surface-elevated/60 px-3 py-2 text-xs text-ink-secondary"
          >
            {profileSyncStatus === 'synced'
              ? 'Профіль збережено на сервері.'
              : profileSyncStatus === 'conflict'
                ? 'Профіль змінився на іншому пристрої. Ваш вибір збережено локально; застосуйте його лише якщо хочете замінити новішу серверну версію.'
              : profileSyncStatus === 'error'
                ? `Профіль збережено локально, але серверне підтвердження не отримано. Повторимо спробу автоматично.${profileSyncError ? ` ${profileSyncError}` : ''}`
                : 'Профіль збережено локально. Очікуємо серверного підтвердження…'}
            {profileSyncStatus === 'conflict' && onConfirmProfileOverwrite && (
              <button
                type="button"
                onClick={onConfirmProfileOverwrite}
                className="mt-2 rounded-xl border border-amber/40 bg-amber-soft px-3 py-2 font-semibold text-amber-fg"
              >
                Застосувати мій вибір
              </button>
            )}
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


        </div>
      </div>
    </GlassCard>
  );
};
