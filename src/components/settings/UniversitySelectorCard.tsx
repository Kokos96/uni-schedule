import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowsClockwise,
  CheckCircle,
  Globe,
  GraduationCap,
  Info,
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
import { PremiumSelect, type PremiumSelectOption } from '../ui/PremiumSelect';
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
  const [globalSearchMode, setGlobalSearchMode] = useState(false);

  const [isActivating, setIsActivating] = useState(false);
  const [activationError, setActivationError] = useState<string | null>(null);
  const [activatedGroupName, setActivatedGroupName] = useState<string | null>(null);

  const groupsReqSeqRef = useRef(0);
  const metaReqSeqRef = useRef(0);

  const adapter = useMemo(
    () => getUniversityAdapter(selectedUniId),
    [selectedUniId]
  );

  // Sync draft ONLY when the committed academic profile VALUE changes
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
  }, [committedSig, currentProfile, universities]);

  // Load faculties, courses, and verified programs
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

  // Load groups for current scope
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

  const universityOptions = useMemo<PremiumSelectOption[]>(
    () =>
      universities.map((u) => ({
        value: u.id,
        label: u.shortName,
        description: u.supportStatus === 'manual_only' ? 'Без автосинхронізації' : u.city,
      })),
    [universities]
  );

  const facultyOptions = useMemo<PremiumSelectOption[]>(
    () => [
      { value: '', label: 'Усі факультети' },
      ...faculties.map((f) => ({ value: f.id, label: f.name })),
    ],
    [faculties]
  );

  const courseOptions = useMemo<PremiumSelectOption[]>(
    () => [
      { value: '', label: 'Усі курси' },
      ...courses.map((c) => ({ value: String(c.number), label: c.label })),
    ],
    [courses]
  );

  const programOptions = useMemo<PremiumSelectOption[]>(
    () => [
      { value: '', label: 'Усі підтверджені спеціальності' },
      ...programs.map((p) => ({ value: p.id, label: p.name })),
    ],
    [programs]
  );

  const groupOptions = useMemo<PremiumSelectOption[]>(
    () =>
      groups.map((g) => ({
        value: g.id,
        label: g.name,
        description: g.programName,
        badge: g.course ? `${g.course} курс` : undefined,
      })),
    [groups]
  );

  const handleSelectGroupValue = (nextValue: string) => {
    setActivationError(null);
    const trimmed = nextValue.trim();
    if (!trimmed) {
      setSelectedGroup(null);
      return;
    }
    const matched = groups.find(
      (g) =>
        g.id === trimmed ||
        normalizeGroupHomoglyphs(g.name) === normalizeGroupHomoglyphs(trimmed)
    );
    const nextGroup: Group = matched ?? { id: trimmed, name: trimmed };
    setSelectedGroup(nextGroup);

    // If selected via global search and the group belongs to another verified faculty,
    // align the academic hierarchy to its verified identity instead of relabeling it.
    if (globalSearchMode) {
      const verified =
        nextGroup.facultyId
          ? { facultyId: nextGroup.facultyId, programId: nextGroup.programId }
          : resolveVerifiedLnuGroupMetadata(nextGroup.name);
      if (verified?.facultyId && verified.facultyId !== facultyId) {
        const matchedFac = faculties.find((f) => f.id === verified.facultyId);
        setFacultyId(verified.facultyId);
        setProgramId(verified.programId ?? '');
        if (nextGroup.course) setCourseNum(nextGroup.course);
        setGlobalSearchMode(false);
        if (matchedFac) {
          toast.info(`Факультет оновлено відповідно до групи: ${matchedFac.name}`);
        }
      }
    }
  };

  const resolveDraftSelection = (): { selection?: StudentSelection; error?: string } => {
    if (!selectedGroup || !selectedGroup.name.trim()) {
      return { error: 'Оберіть або введіть назву академічної групи.' };
    }

    const canonicalGroupId = selectedGroup.id;
    const canonicalGroupName = selectedGroup.name;
    const verifiedMeta =
      selectedUniId === 'lnu' ? resolveVerifiedLnuGroupMetadata(canonicalGroupName) : null;

    const effectiveFacultyId =
      verifiedMeta?.facultyId ?? selectedGroup.facultyId ?? (facultyId || undefined);
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
    const effectiveProgramId =
      verifiedMeta?.programId ?? selectedGroup.programId ?? (programId || undefined);
    const effectiveProgramName =
      verifiedMeta?.programName ??
      selectedGroup.programName ??
      programs.find((p) => p.id === effectiveProgramId)?.name;

    return {
      selection: {
        universityId: selectedUniId,
        facultyId: effectiveFacultyId,
        facultyName,
        programId: effectiveProgramId,
        programName: effectiveProgramName,
        course: selectedGroup.course ?? courseNum,
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
    Boolean(selectedGroup?.id) &&
    normalizeGroupHomoglyphs(currentProfile?.groupId ?? '') ===
      normalizeGroupHomoglyphs(selectedGroup?.id ?? '') &&
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
        <PremiumSelect
          id="uni-select"
          label="Університет"
          value={selectedUniId}
          options={universityOptions}
          onChange={(nextUni) => {
            setSelectedUniId(nextUni);
            setFacultyId('');
            setProgramId('');
            setCourseNum(undefined);
            setSelectedGroup(null);
            setGroups([]);
            setGroupsError(null);
            setGlobalSearchMode(false);
            setActivationError(null);
          }}
        />

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
                <PremiumSelect
                  id="uni-faculty"
                  label="Факультет"
                  value={facultyId}
                  options={facultyOptions}
                  placeholder="Усі факультети"
                  searchable={faculties.length > 8}
                  searchPlaceholder="Пошук факультету…"
                  onChange={(nextFaculty) => {
                    setFacultyId(nextFaculty);
                    setProgramId('');
                    setCourseNum(undefined);
                    setSelectedGroup(null);
                    setGroups([]);
                    setGroupsError(null);
                    setGlobalSearchMode(false);
                    setActivationError(null);
                  }}
                />
              </div>

              <div>
                <PremiumSelect
                  id="uni-course"
                  label="Курс"
                  value={courseNum ? String(courseNum) : ''}
                  options={courseOptions}
                  placeholder="Усі курси"
                  onChange={(nextCourse) => {
                    setCourseNum(nextCourse ? Number(nextCourse) : undefined);
                    setSelectedGroup(null);
                    setActivationError(null);
                  }}
                />
              </div>
            </div>

            {facultyId && !globalSearchMode && programs.length > 0 && (
              <PremiumSelect
                id="uni-program"
                label="Спеціальність / освітня програма"
                value={programId}
                options={programOptions}
                placeholder="Усі підтверджені спеціальності"
                onChange={(nextProgram) => {
                  setProgramId(nextProgram);
                  setSelectedGroup(null);
                  setActivationError(null);
                }}
              />
            )}

            <div>
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

              <PremiumSelect
                id="uni-group"
                label={`Академічна група${loadingGroups ? ' (завантаження…)' : ''}`}
                value={selectedGroup?.id ?? ''}
                options={groupOptions}
                placeholder="Оберіть або введіть назву групи"
                loading={loadingGroups}
                errorMessage={groupsError}
                searchable
                searchPlaceholder="Введіть назву групи (напр. ФЕП-33с)…"
                allowCustomValue
                customValueLabel={(q) => `Вказати групу «${q}»`}
                sheetSubtitle={
                  globalSearchMode || !facultyId
                    ? `Довідник груп ЛНУ (${groups.length})`
                    : `Підтверджені групи факультету (${groups.length})`
                }
                emptyMessage={
                  facultyId && !globalSearchMode && !facultyHasCatalog
                    ? 'Для цього факультету підтверджений каталог груп ще неповний.'
                    : 'Груп за цим запитом не знайдено.'
                }
                filterOption={(opt, q) => {
                  const lower = q.toLocaleLowerCase('uk-UA');
                  const qNorm = normalizeGroupHomoglyphs(q);
                  return (
                    opt.label.toLocaleLowerCase('uk-UA').includes(lower) ||
                    normalizeGroupHomoglyphs(opt.label).includes(qNorm)
                  );
                }}
                headerAction={
                  facultyId ? (
                    <button
                      type="button"
                      onClick={() => setGlobalSearchMode((prev) => !prev)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-fg hover:underline"
                    >
                      <Globe weight="regular" className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>
                        {globalSearchMode
                          ? 'Лише обраний факультет'
                          : 'Глобальний пошук'}
                      </span>
                    </button>
                  ) : undefined
                }
                footerAction={
                  facultyId && !globalSearchMode ? (
                    <button
                      type="button"
                      onClick={() => setGlobalSearchMode(true)}
                      className="inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-xl border border-amber/35 bg-amber-soft px-3 py-1.5 text-xs font-semibold text-amber-fg"
                    >
                      <Globe weight="regular" className="h-3.5 w-3.5" />
                      <span>Шукати серед усіх груп ЛНУ</span>
                    </button>
                  ) : undefined
                }
                onChange={handleSelectGroupValue}
              />

              {facultyId && !globalSearchMode && !facultyHasCatalog && (
                <p className="mt-1.5 text-[11px] leading-relaxed text-ink-muted">
                  Для цього факультету підтверджений каталог груп наразі неповний. Скористайтеся глобальним пошуком вище.
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
                className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-terracotta/40 bg-surface-elevated/80 px-3 py-1 text-[11px] font-semibold text-ink hover:border-terracotta disabled:opacity-60"
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
            className="inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-xl border border-amber/40 bg-amber px-4 text-xs font-semibold text-[#242522] transition-all hover:brightness-105 active:scale-[0.98] disabled:opacity-60"
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
