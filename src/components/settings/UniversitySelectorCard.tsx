import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  CheckCircle,
  Globe,
  GraduationCap,
  Info,
  MagnifyingGlass,
  WarningCircle,
  X,
} from '@phosphor-icons/react';
import {
  hasVerifiedLnuCatalogForFaculty,
  resolveVerifiedLnuGroupMetadata,
} from '../../data/lnuAcademicCatalog';
import type {
  ScheduleActivationResult,
  ScheduleSyncStatus,
} from '../../hooks/useScheduleSource';
import type { UseSettingsResult } from '../../hooks/useSettings';
import { normalizeGroupHomoglyphs } from '../../integrations/universities/lnu/lnuParser';
import {
  getUniversityAdapter,
  listUniversities,
} from '../../integrations/universities/registry';
import type {
  Course,
  Faculty,
  Group,
  Program,
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
  onActivateGroupSchedule?: (
    selection: StudentSelection,
    options?: { force?: boolean }
  ) => Promise<ScheduleActivationResult>;
  onSyncGroupSchedule?: (
    selection: StudentSelection,
    options?: { force?: boolean }
  ) => Promise<boolean>;
  onResetBuiltinSchedule?: () => void;
}

function committedProfileSignature(profile: StudentSelection | undefined): string {
  if (!profile) return '';
  return [
    profile.universityId,
    profile.facultyId ?? '',
    profile.programId ?? '',
    profile.course ?? '',
    profile.groupId,
    profile.groupName,
  ].join('|');
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
  onActivateGroupSchedule,
  onSyncGroupSchedule,
}) => {
  const { toast } = useToast();
  const universities = useMemo(() => listUniversities(), []);

  const currentProfile = resolved.universityProfile;
  const committedSig = committedProfileSignature(currentProfile);
  const lastCommittedSigRef = useRef(committedSig);

  const [selectedUniId, setSelectedUniId] = useState<string>(
    currentProfile?.universityId ?? universities[0]?.id ?? 'lnu'
  );
  const [faculties, setFaculties] = useState<Faculty[]>([]);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [loadingGroups, setLoadingGroups] = useState(false);

  const [facultyId, setFacultyId] = useState<string>(currentProfile?.facultyId ?? '');
  const [programId, setProgramId] = useState<string>(currentProfile?.programId ?? '');
  const [courseNum, setCourseNum] = useState<number | undefined>(currentProfile?.course);

  // Separate canonical selected group from live search query
  const [selectedGroup, setSelectedGroup] = useState<Group | null>(() =>
    currentProfile?.groupId
      ? {
          id: currentProfile.groupId,
          name: currentProfile.groupName,
          facultyId: currentProfile.facultyId,
          programId: currentProfile.programId,
          programName: currentProfile.programName,
          course: currentProfile.course,
        }
      : null
  );
  const [groupQuery, setGroupQuery] = useState<string>(currentProfile?.groupName ?? '');
  const [comboOpen, setComboOpen] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState(0);
  const [globalSearchMode, setGlobalSearchMode] = useState(false);

  // Separate explicit user activation state from background syncStatus
  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activatedGroupName, setActivatedGroupName] = useState<string | null>(null);

  const comboContainerRef = useRef<HTMLDivElement | null>(null);
  const groupsReqSeqRef = useRef(0);
  const metaReqSeqRef = useRef(0);

  const adapter = useMemo(
    () => getUniversityAdapter(selectedUniId),
    [selectedUniId]
  );

  // Only resync local draft when the committed academic profile VALUE changes,
  // never when unrelated settings (electives, theme, subgroup) recreate the object.
  useEffect(() => {
    if (lastCommittedSigRef.current === committedSig) return;
    lastCommittedSigRef.current = committedSig;
    setSelectedUniId(currentProfile?.universityId ?? universities[0]?.id ?? 'lnu');
    setFacultyId(currentProfile?.facultyId ?? '');
    setProgramId(currentProfile?.programId ?? '');
    setCourseNum(currentProfile?.course);
    setSelectedGroup(
      currentProfile?.groupId
        ? {
            id: currentProfile.groupId,
            name: currentProfile.groupName,
            facultyId: currentProfile.facultyId,
            programId: currentProfile.programId,
            programName: currentProfile.programName,
            course: currentProfile.course,
          }
        : null
    );
    setGroupQuery(currentProfile?.groupName ?? '');
  }, [committedSig, currentProfile, universities]);

  // Load faculties, courses, and verified programs for selected university/faculty
  useEffect(() => {
    if (!adapter) return;
    const seq = ++metaReqSeqRef.current;
    let cancelled = false;

    const loadMeta = async () => {
      const [facList, courseList, progList] = await Promise.all([
        adapter.getFaculties(),
        adapter.getCourses(facultyId || undefined, programId || undefined),
        facultyId && adapter.getPrograms ? adapter.getPrograms(facultyId) : Promise.resolve([]),
      ]);
      if (cancelled || metaReqSeqRef.current !== seq) return;
      setFaculties(facList);
      setCourses(courseList);
      setPrograms(progList);
    };

    void loadMeta();
    return () => {
      cancelled = true;
    };
  }, [adapter, facultyId, programId]);

  // Load academic groups for current scope (strict faculty/program/course or explicit global mode)
  useEffect(() => {
    if (!adapter) return;
    if (adapter.meta.supportStatus !== 'live') {
      setGroups([]);
      setGroupsError(null);
      setLoadingGroups(false);
      return;
    }

    const seq = ++groupsReqSeqRef.current;
    let cancelled = false;
    setLoadingGroups(true);
    setGroupsError(null);

    const loadGroups = async () => {
      try {
        const groupList = await adapter.getGroups({
          facultyId: globalSearchMode ? undefined : facultyId || undefined,
          programId: globalSearchMode ? undefined : programId || undefined,
          course: courseNum,
          includeAll: globalSearchMode || (!facultyId && !programId),
        });
        if (!cancelled && groupsReqSeqRef.current === seq) {
          setGroups(groupList);
        }
      } catch (err) {
        if (!cancelled && groupsReqSeqRef.current === seq) {
          setGroups([]);
          setGroupsError(
            err instanceof Error ? err.message : 'Не вдалося завантажити список груп.'
          );
        }
      } finally {
        if (!cancelled && groupsReqSeqRef.current === seq) {
          setLoadingGroups(false);
        }
      }
    };

    void loadGroups();
    return () => {
      cancelled = true;
    };
  }, [adapter, facultyId, programId, courseNum, globalSearchMode]);

  const filteredGroups = useMemo(() => {
    const q = groupQuery.trim().toLowerCase();
    // When the input displays the already-selected group name, show full scoped list on open
    // so users can browse other groups without manually erasing the field first.
    if (!q || (selectedGroup && selectedGroup.name.toLowerCase() === q)) {
      return groups;
    }
    const qNorm = normalizeGroupHomoglyphs(q);
    return groups.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        normalizeGroupHomoglyphs(g.name).includes(qNorm)
    );
  }, [groups, groupQuery, selectedGroup]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (
        comboContainerRef.current &&
        !comboContainerRef.current.contains(event.target as Node)
      ) {
        setComboOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, []);

  const handleSelectGroupOption = (group: Group) => {
    setSelectedGroup(group);
    setGroupQuery(group.name);
    setComboOpen(false);
    setActivationError(null);

    // If selected via global search and the group belongs to a different verified faculty,
    // align the academic hierarchy to its verified identity instead of relabeling it.
    if (globalSearchMode) {
      const verified =
        group.facultyId
          ? { facultyId: group.facultyId, programId: group.programId }
          : resolveVerifiedLnuGroupMetadata(group.name);
      if (verified?.facultyId && verified.facultyId !== facultyId) {
        const matchedFac = faculties.find((f) => f.id === verified.facultyId);
        setFacultyId(verified.facultyId);
        setProgramId(verified.programId ?? '');
        if (group.course) setCourseNum(group.course);
        setGlobalSearchMode(false);
        if (matchedFac) {
          toast.info(`Факультет оновлено відповідно до групи: ${matchedFac.name}`);
        }
      }
    }
  };

  const resolveDraftSelection = (): { selection?: StudentSelection; error?: string } => {
    const cleanQuery = groupQuery.trim();
    if (!cleanQuery && !selectedGroup) {
      return { error: 'Оберіть або введіть назву академічної групи.' };
    }

    let matchedGroup: Group | undefined = selectedGroup ?? undefined;
    if (!matchedGroup || normalizeGroupHomoglyphs(matchedGroup.name) !== normalizeGroupHomoglyphs(cleanQuery)) {
      const lowerClean = cleanQuery.toLocaleLowerCase('uk-UA');
      const normClean = normalizeGroupHomoglyphs(cleanQuery);
      matchedGroup = groups.find(
        (g) =>
          g.name.toLocaleLowerCase('uk-UA') === lowerClean ||
          normalizeGroupHomoglyphs(g.name) === normClean
      );
      if (!matchedGroup && groups.length > 0) {
        const prefixMatches = groups.filter(
          (g) =>
            g.name.toLocaleLowerCase('uk-UA').startsWith(lowerClean) ||
            normalizeGroupHomoglyphs(g.name).startsWith(normClean)
        );
        if (prefixMatches.length === 1) {
          matchedGroup = prefixMatches[0];
        } else if (prefixMatches.length > 1) {
          return {
            error: `Знайдено кілька схожих груп (${prefixMatches.slice(0, 3).map((g) => g.name).join(', ')}…). Оберіть точну групу зі списку.`,
          };
        }
      }
    }

    const canonicalGroupId = matchedGroup?.id ?? cleanQuery;
    const canonicalGroupName = matchedGroup?.name ?? cleanQuery;
    const verifiedMeta =
      selectedUniId === 'lnu' ? resolveVerifiedLnuGroupMetadata(canonicalGroupName) : null;

    // Never relabel a verified group with an incompatible faculty.
    const effectiveFacultyId =
      verifiedMeta?.facultyId ?? matchedGroup?.facultyId ?? (facultyId || undefined);
    if (
      verifiedMeta?.facultyId &&
      facultyId &&
      !globalSearchMode &&
      verifiedMeta.facultyId !== facultyId
    ) {
      return {
        error: `Група ${canonicalGroupName} належить до іншого факультету (${verifiedMeta.programName}). Скористайтеся глобальним пошуком або змініть факультет.`,
      };
    }

    const facultyName = faculties.find((f) => f.id === effectiveFacultyId)?.name;
    const effectiveProgramId = verifiedMeta?.programId ?? matchedGroup?.programId ?? (programId || undefined);
    const effectiveProgramName =
      verifiedMeta?.programName ??
      matchedGroup?.programName ??
      programs.find((p) => p.id === effectiveProgramId)?.name;

    return {
      selection: {
        universityId: selectedUniId,
        facultyId: effectiveFacultyId,
        facultyName,
        programId: effectiveProgramId,
        programName: effectiveProgramName,
        course: matchedGroup?.course ?? courseNum,
        groupId: canonicalGroupId,
        groupName: canonicalGroupName,
        subgroup: resolved.subgroup,
      },
    };
  };

  const handleActivate = async () => {
    setActivationError(null);
    setActivatedGroupName(null);
    const { selection, error: validationError } = resolveDraftSelection();
    if (!selection) {
      const msg = validationError ?? 'Вкажіть коректну академічну групу.';
      setActivationError(msg);
      toast.warning(msg);
      return;
    }

    const groupChanged =
      resolved.universityProfile?.universityId !== selection.universityId ||
      (resolved.universityProfile?.facultyId ?? '') !== (selection.facultyId ?? '') ||
      normalizeGroupHomoglyphs(resolved.universityProfile?.groupId ?? '') !==
        normalizeGroupHomoglyphs(selection.groupId);

    if (adapter?.meta.supportStatus === 'manual_only') {
      onUpdate({
        universityProfile: selection,
        scheduleSourceMode: 'manual',
        ...(groupChanged ? { selectedElectives: [], selectedTrack: undefined } : {}),
      });
      setActivatedGroupName(selection.groupName);
      toast.info('Обрано ручний режим для іншого університету');
      return;
    }

    setIsActivating(true);
    try {
      if (onActivateGroupSchedule) {
        const result = await onActivateGroupSchedule(selection, { force: !groupChanged });
        if (result.cancelled) {
          return;
        }
        if (result.ok && result.schedule) {
          const committedSelection: StudentSelection = {
            ...selection,
            groupId: result.schedule.groupId,
            groupName: result.schedule.groupName,
            facultyId: result.schedule.facultyId ?? selection.facultyId,
          };
          setSelectedGroup({
            id: committedSelection.groupId,
            name: committedSelection.groupName,
            facultyId: committedSelection.facultyId,
            programId: committedSelection.programId,
            programName: committedSelection.programName,
            course: committedSelection.course,
          });
          setGroupQuery(committedSelection.groupName);
          onUpdate({
            universityProfile: committedSelection,
            scheduleSourceMode: 'live',
            ...(groupChanged ? { selectedElectives: [], selectedTrack: undefined } : {}),
          });
          setActivatedGroupName(committedSelection.groupName);
          toast.success(`Розклад групи ${committedSelection.groupName} активовано`);
        } else {
          const reason =
            result.error ?? 'Не вдалося завантажити розклад цієї групи — попередній профіль збережено.';
          setActivationError(reason);
          toast.warning(reason);
        }
      } else if (onSyncGroupSchedule) {
        const ok = await onSyncGroupSchedule(selection, { force: !groupChanged });
        if (ok) {
          onUpdate({
            universityProfile: selection,
            scheduleSourceMode: 'live',
            ...(groupChanged ? { selectedElectives: [], selectedTrack: undefined } : {}),
          });
          setActivatedGroupName(selection.groupName);
          toast.success(`Розклад групи ${selection.groupName} активовано`);
        } else {
          const reason =
            syncError ?? 'Не вдалося завантажити розклад цієї групи — попередній профіль збережено.';
          setActivationError(reason);
          toast.warning(reason);
        }
      } else {
        onUpdate({
          universityProfile: selection,
          scheduleSourceMode: 'live',
          ...(groupChanged ? { selectedElectives: [], selectedTrack: undefined } : {}),
        });
        setActivatedGroupName(selection.groupName);
      }
    } finally {
      setIsActivating(false);
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

  const isSelectedSameAsActive =
    Boolean(currentProfile?.groupId) &&
    Boolean(groupQuery.trim()) &&
    normalizeGroupHomoglyphs(currentProfile?.groupId ?? '') ===
      normalizeGroupHomoglyphs(selectedGroup?.id ?? groupQuery.trim()) &&
    (currentProfile?.facultyId ?? '') === (facultyId || (currentProfile?.facultyId ?? ''));

  const facultyHasCatalog =
    selectedUniId === 'lnu' && facultyId ? hasVerifiedLnuCatalogForFaculty(facultyId) : true;

  const displayedError = activationError ?? (syncStatus === 'error' ? syncError : null);

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
              : isActivating || syncStatus === 'syncing'
                ? 'amber'
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
          {isActivating
            ? 'Активація групи…'
            : resolved.scheduleSourceMode === 'unconfigured'
              ? 'Профіль не налаштовано'
              : resolved.scheduleSourceMode === 'builtin'
                ? 'Перехід на живий розклад…'
                : syncStatus === 'synced' && formattedSyncTime
                  ? `Оновлено ${formattedSyncTime}`
                  : syncStatus === 'synced'
                    ? 'Розклад завантажено'
                    : syncStatus === 'syncing'
                      ? 'Оновлення у фоні…'
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
              setProgramId('');
              setCourseNum(undefined);
              setSelectedGroup(null);
              setGroupQuery('');
              setGroups([]);
              setGroupsError(null);
              setGlobalSearchMode(false);
              setActivationError(null);
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
                    const nextFaculty = e.target.value;
                    setFacultyId(nextFaculty);
                    setProgramId('');
                    setCourseNum(undefined);
                    setSelectedGroup(null);
                    setGroupQuery('');
                    setGroups([]);
                    setGroupsError(null);
                    setGlobalSearchMode(false);
                    setActivationError(null);
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
                    setSelectedGroup(null);
                    setGroupQuery('');
                    setActivationError(null);
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

            {facultyId && !globalSearchMode && programs.length > 0 && (
              <div>
                <label
                  htmlFor="uni-program"
                  className="mb-1 block text-xs font-medium text-ink-secondary"
                >
                  Спеціальність / освітня програма
                </label>
                <select
                  id="uni-program"
                  value={programId}
                  onChange={(e) => {
                    setProgramId(e.target.value);
                    setSelectedGroup(null);
                    setGroupQuery('');
                    setActivationError(null);
                  }}
                  className="w-full rounded-xl border border-line bg-surface-elevated/70 px-3 py-2.5 text-xs text-ink focus:border-amber focus:outline-none"
                >
                  <option value="">Усі підтверджені спеціальності</option>
                  {programs.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            <div ref={comboContainerRef} className="relative z-20">
              <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
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
                      setGlobalSearchMode((prev) => !prev);
                      setComboOpen(true);
                    }}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-fg hover:underline"
                  >
                    <Globe weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
                    <span>
                      {globalSearchMode
                        ? 'Повернутися до обраного факультету'
                        : 'Глобальний пошук по всіх групах'}
                    </span>
                  </button>
                )}
              </div>

              {globalSearchMode && (
                <div className="mb-2 flex items-center justify-between gap-2 rounded-xl border border-amber/35 bg-amber-soft/60 px-3 py-1.5 text-[11px] text-amber-fg">
                  <span>Режим глобального пошуку по всьому довіднику ЛНУ</span>
                  <button
                    type="button"
                    onClick={() => setGlobalSearchMode(false)}
                    className="rounded-md p-0.5 hover:bg-amber/15"
                    aria-label="Закрити глобальний пошук"
                  >
                    <X weight="bold" className="h-3.5 w-3.5" />
                  </button>
                </div>
              )}

              <div className="relative">
                <MagnifyingGlass
                  weight="regular"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted"
                  aria-hidden="true"
                />
                <input
                  id="uni-group"
                  type="text"
                  role="combobox"
                  aria-expanded={comboOpen}
                  aria-controls="uni-group-listbox"
                  aria-autocomplete="list"
                  autoComplete="off"
                  value={groupQuery}
                  onFocus={() => setComboOpen(true)}
                  onClick={() => setComboOpen(true)}
                  onChange={(e) => {
                    const nextVal = e.target.value;
                    setGroupQuery(nextVal);
                    if (
                      selectedGroup &&
                      normalizeGroupHomoglyphs(nextVal) !==
                        normalizeGroupHomoglyphs(selectedGroup.name)
                    ) {
                      setSelectedGroup(null);
                    }
                    setHighlightedIndex(0);
                    setComboOpen(true);
                    setActivationError(null);
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
                        filteredGroups.length > 0
                          ? Math.min(idx + 1, filteredGroups.length - 1)
                          : 0
                      );
                    } else if (e.key === 'ArrowUp') {
                      e.preventDefault();
                      setHighlightedIndex((idx) => Math.max(0, idx - 1));
                    } else if (
                      e.key === 'Enter' &&
                      comboOpen &&
                      filteredGroups[highlightedIndex]
                    ) {
                      e.preventDefault();
                      handleSelectGroupOption(filteredGroups[highlightedIndex]!);
                    }
                  }}
                  placeholder="Оберіть зі списку або введіть назву групи"
                  className="w-full rounded-xl border border-line bg-surface-elevated/70 py-2.5 pl-9 pr-8 text-sm font-medium text-ink placeholder:text-ink-muted focus:border-amber focus:outline-none"
                />
                {groupQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setGroupQuery('');
                      setSelectedGroup(null);
                      setComboOpen(true);
                    }}
                    aria-label="Очистити поле групи"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-md p-1 text-ink-muted hover:text-ink"
                  >
                    <X weight="bold" className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>

              {comboOpen && (
                <div
                  id="uni-group-listbox"
                  role="listbox"
                  aria-label="Список академічних груп"
                  className="absolute left-0 right-0 top-full z-30 mt-1.5 max-h-60 overflow-y-auto overscroll-contain rounded-xl border border-line bg-surface-elevated p-1 shadow-[0_12px_32px_rgba(0,0,0,0.28)]"
                >
                  {loadingGroups ? (
                    <div className="px-3 py-3 text-xs text-ink-secondary">
                      Завантаження списку груп…
                    </div>
                  ) : filteredGroups.length === 0 ? (
                    <div className="space-y-2 px-3 py-3 text-xs text-ink-secondary">
                      <p>
                        {groupsError
                          ? groupsError
                          : facultyId && !globalSearchMode && !facultyHasCatalog
                            ? 'Для цього факультету підтверджений каталог груп ще неповний.'
                            : 'Груп за цим запитом не знайдено.'}
                      </p>
                      {facultyId && !globalSearchMode && (
                        <button
                          type="button"
                          onClick={() => {
                            setGlobalSearchMode(true);
                            setComboOpen(true);
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-amber/40 bg-amber-soft px-2.5 py-1.5 text-[11px] font-semibold text-amber-fg"
                        >
                          <Globe weight="regular" className="h-3.5 w-3.5" />
                          <span>Шукати серед усіх груп ЛНУ</span>
                        </button>
                      )}
                    </div>
                  ) : (
                    <>
                      <div className="px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-ink-muted">
                        {globalSearchMode || !facultyId
                          ? `Довідник груп ЛНУ (${filteredGroups.length})`
                          : `Підтверджені групи факультету (${filteredGroups.length})`}
                      </div>
                      {filteredGroups.map((g, i) => {
                        const isSelected =
                          selectedGroup?.id === g.id ||
                          normalizeGroupHomoglyphs(g.name) ===
                            normalizeGroupHomoglyphs(groupQuery);
                        return (
                          <button
                            key={g.id}
                            type="button"
                            role="option"
                            aria-selected={isSelected}
                            onClick={() => handleSelectGroupOption(g)}
                            className={`flex w-full items-center justify-between gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors ${
                              isSelected || highlightedIndex === i
                                ? 'bg-amber-soft font-semibold text-amber-fg'
                                : 'text-ink hover:bg-surface'
                            }`}
                          >
                            <div className="min-w-0">
                              <span className="block truncate">{g.name}</span>
                              {g.programName && (
                                <span className="block truncate text-[10px] font-normal text-ink-muted">
                                  {g.programName}
                                </span>
                              )}
                            </div>
                            {g.course && (
                              <span className="shrink-0 font-mono text-[10px] text-ink-muted">
                                {g.course} курс
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </>
                  )}
                </div>
              )}

              {groupsError && !comboOpen && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-secondary">
                  {groupsError}
                </p>
              )}

              {facultyId && !globalSearchMode && !facultyHasCatalog && !comboOpen && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
                  Для цього факультету підтверджений каталог груп наразі неповний. Ви можете скористатися глобальним пошуком по всіх групах ЛНУ вище.
                </p>
              )}
            </div>
          </>
        )}

        {displayedError && (
          <div
            role="alert"
            className="flex flex-col gap-2 rounded-xl border border-terracotta/40 bg-terracotta-soft px-3 py-2.5 text-xs text-terracotta-fg"
          >
            <div className="flex items-start gap-2">
              <WarningCircle weight="duotone" className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              <span className="leading-relaxed">{displayedError}</span>
            </div>
            <div>
              <button
                type="button"
                disabled={isActivating}
                onClick={() => void handleActivate()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-terracotta/40 bg-surface-elevated/80 px-2.5 py-1 text-[11px] font-semibold text-ink hover:border-terracotta disabled:opacity-60"
              >
                <ArrowsClockwise weight="bold" className="h-3 w-3" aria-hidden="true" />
                <span>Спробувати ще раз</span>
              </button>
            </div>
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

        {(activatedGroupName || (syncStatus === 'synced' && currentProfile?.groupName)) && !displayedError && (
          <div className="flex items-center gap-2 rounded-xl border border-sage/35 bg-sage-soft px-3 py-2 text-xs text-sage-fg">
            <CheckCircle weight="duotone" className="h-4 w-4 shrink-0" aria-hidden="true" />
            <span>
              Активний розклад групи:{' '}
              <strong>{activatedGroupName ?? currentProfile?.groupName}</strong>
            </span>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <button
            type="button"
            disabled={isActivating}
            onClick={() => void handleActivate()}
            className="inline-flex min-h-[42px] items-center justify-center gap-1.5 rounded-xl border border-amber/40 bg-amber px-4 text-xs font-semibold text-[#242522] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
          >
            <ArrowsClockwise
              weight="bold"
              className={`h-3.5 w-3.5 ${isActivating ? 'animate-spin' : ''}`}
              aria-hidden="true"
            />
            <span>
              {isActivating
                ? 'Активація…'
                : adapter?.meta.supportStatus === 'manual_only'
                  ? 'Зберегти вибір'
                  : isSelectedSameAsActive
                    ? 'Оновити розклад'
                    : 'Активувати групу'}
            </span>
          </button>
        </div>
      </div>
    </GlassCard>
  );
};
