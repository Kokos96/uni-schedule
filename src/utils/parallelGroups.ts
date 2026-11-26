import { resolveDepartmentsForLesson } from '../data/academicProgramRegistry';
import type { ScheduleLesson } from '../integrations/universities/types';

/**
 * Compact deterministic FNV-1a 32-bit slug (same algorithm as scheduleNormalizer.stableSlug,
 * kept self-contained so both frontend and Cloudflare Worker Push scheduler can import it
 * without circular dependencies).
 */
function stableHash(input: string): string {
  const normalized = input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[`'’"]/g, '');

  let hash = 0x811c9dc5;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(36);
}

/**
 * Conservative source marker check: only lessons explicitly marked by the university
 * source as a combined/subgroup section (e.g. "Збірна група", "Підгрупа ...") qualify
 * as parallel subgroup candidates by label. Shared flow lectures ("Потік") or unmarked
 * lessons are NEVER treated as mutually exclusive subgroups unless distinct parenthetical
 * variants (e.g. "(іспанська)" vs "(німецька)") appear in the exact same time slot.
 */
const PARALLEL_GROUP_LABEL_RE = /(?:збірн|підгр|підг\.)/i;
const SHARED_FLOW_LABEL_RE = /^(?:потік|лекц|загальн)/i;

export function hasConfirmedParallelLabel(groupLabel?: string | null): boolean {
  if (!groupLabel) return false;
  const trimmed = groupLabel.trim();
  if (!trimmed || SHARED_FLOW_LABEL_RE.test(trimmed)) return false;
  return PARALLEL_GROUP_LABEL_RE.test(trimmed);
}

function normalizeParallelLessonType(rawType?: string | null): string {
  const clean = (rawType ?? '').trim().toLowerCase();
  if (clean.startsWith('лаб')) return 'lab';
  if (clean.startsWith('прак') || clean === 'п' || clean.startsWith('сем') || clean.startsWith('прс')) {
    return 'practice';
  }
  return 'lecture';
}

export interface ParsedParallelSubject {
  /** Base subject family without trailing parenthetical variant, e.g. "Друга іноземна мова". */
  baseSubject: string;
  /** Optional parenthetical variant, e.g. "німецька" -> "Німецька". */
  variantLabel?: string;
}

/**
 * Splits a subject name into its canonical family and optional trailing parenthetical variant.
 * Example:
 * - "Друга іноземна мова (німецька)" -> { baseSubject: "Друга іноземна мова", variantLabel: "Німецька" }
 * - "Перша іноземна мова" -> { baseSubject: "Перша іноземна мова" }
 */
export function parseParallelSubject(rawSubject: string): ParsedParallelSubject {
  const cleaned = rawSubject.replace(/\s+/g, ' ').trim();
  const match = cleaned.match(/^(.+?)\s*\(([^()]{2,40})\)\s*$/);
  if (!match) {
    return { baseSubject: cleaned };
  }
  const baseSubject = match[1].trim();
  const rawVariant = match[2].trim();
  if (!baseSubject || !rawVariant) {
    return { baseSubject: cleaned };
  }
  const variantLabel = rawVariant.charAt(0).toUpperCase() + rawVariant.slice(1);
  return { baseSubject, variantLabel };
}

export function computeParallelDimensionKey(subject: string): string {
  const { baseSubject } = parseParallelSubject(subject);
  return `pg_${stableHash(baseSubject)}`;
}

export function computeParallelVariantKey(subject: string): string | undefined {
  const { baseSubject, variantLabel } = parseParallelSubject(subject);
  if (!variantLabel) return undefined;
  return `var_${stableHash(`${baseSubject}|${variantLabel}`)}`;
}

export function computeParallelOptionKey(subject: string, teacher?: string | null): string {
  const cleanSubject = subject.replace(/\s+/g, ' ').trim();
  const cleanTeacher = (teacher ?? '').replace(/\s+/g, ' ').trim();
  return `opt_${stableHash(`${cleanSubject}|${cleanTeacher}`)}`;
}

export interface ParallelGroupOption {
  /** Stable option key (`opt_...` for specific teacher/subgroup or `var_...` for language-level filter). */
  key: string;
  /** Primary display label shown in PremiumSelect. */
  label: string;
  /** Optional secondary description (e.g. full subject name or hint). */
  description?: string;
  /** Optional compact badge (e.g. variant/language name like "Німецька"). */
  badge?: string;
  /** True when this option represents a broader variant/language filter rather than a single teacher. */
  isVariantGroup?: boolean;
  /** Number of scheduled lessons in the current window matching this option. */
  lessonCount: number;
}

export interface ParallelGroupDimension {
  /** Stable dimension key (`pg_...`). */
  key: string;
  /** Human-readable dimension title, e.g. "Перша іноземна мова", "Друга іноземна мова", "Іноземна мова". */
  label: string;
  /** True when options span multiple parenthetical variants (e.g. Іспанська / Німецька / Французька). */
  hasVariants: boolean;
  /** Ordered selectable options for this parallel dimension. */
  options: ParallelGroupOption[];
}

export type ParallelSelectionMap = Record<string, string>;

const MAX_PARALLEL_DIMENSIONS = 12;

/**
 * Sanitizes a user's `selectedParallelGroups` record from storage, backup, or API payload.
 */
export function normalizeSelectedParallelGroups(
  raw: unknown
): ParallelSelectionMap | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return undefined;
  }
  const result: ParallelSelectionMap = {};
  let count = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (count >= MAX_PARALLEL_DIMENSIONS) break;
    const key = k.trim();
    const val = typeof v === 'string' ? v.trim() : '';
    if (
      key.length > 0 &&
      key.length <= 48 &&
      key.startsWith('pg_') &&
      val.length > 0 &&
      val.length <= 48 &&
      (val.startsWith('opt_') || val.startsWith('var_'))
    ) {
      result[key] = val;
      count += 1;
    }
  }
  return count > 0 ? result : undefined;
}

/**
 * Checks whether a single lesson is eligible for conservative parallel-subgroup classification:
 * - Not an optional DVVS elective (`!isElective`)
 * - Does not already have an explicit numeric subgroup (`!subgroup`)
 * - Does not already have a numbered track (`trackNumber === undefined`)
 * - Does not already have a verified department rule (`!departments`)
 * - Has a confirmed source marker (`Збірна група` / `Підгрупа`) OR an explicit parenthetical variant
 *   (e.g. `Друга іноземна мова (німецька)`). Unmarked or `Потік` lessons are never hidden.
 */
export function isParallelLessonCandidate(
  lesson: Pick<
    ScheduleLesson,
    'subject' | 'isElective' | 'subgroup' | 'trackNumber' | 'groupLabel'
  >,
  universityId?: string,
  groupId?: string
): boolean {
  if (lesson.isElective) return false;
  if (lesson.subgroup === 1 || lesson.subgroup === 2) return false;
  if (lesson.trackNumber !== undefined) return false;
  if (universityId && groupId) {
    const depts = resolveDepartmentsForLesson(universityId, groupId, lesson.subject);
    if (depts && depts.length > 0) return false;
  }
  if (hasConfirmedParallelLabel(lesson.groupLabel)) {
    return true;
  }
  // Allow parenthetical language/topic variants only when not explicitly marked as a shared flow
  if (!lesson.groupLabel || !SHARED_FLOW_LABEL_RE.test(lesson.groupLabel.trim())) {
    const { variantLabel } = parseParallelSubject(lesson.subject);
    if (variantLabel) return true;
  }
  return false;
}

/**
 * Universally and conservatively detects parallel un-personalized combined-group dimensions.
 *
 * A subject family (`baseSubject`) becomes a selectable `ParallelGroupDimension` ONLY when:
 * 1. Candidate lessons carry confirmed source markers (`Збірна група` / `Підгрупа`) or explicit
 *    distinct parenthetical variants (e.g. `іспанська` vs `німецька`).
 * 2. At least one exact slot `(date|dayOfWeek, number, normalizedLessonType)` contains `>= 2`
 *    distinct `(subject, teacher)` candidate lessons of the SAME lesson type & SAME week parity.
 *
 * This guarantees:
 * - Ordinary time conflicts between different subjects: NOT flagged
 * - Lecture + Practice of the same subject in one slot: NOT flagged
 * - Shared flow lessons (`Потік`) or unmarked lessons: NOT flagged
 * - Different week parities (`numerator` vs `denominator`): NOT flagged
 * - `ІНА-35с` / `ІНА-34с` / `ІНА-36с`: detects `Перша іноземна мова` & `Друга іноземна мова`
 * - `ФЕП-13с`: detects `Іноземна мова`
 * - `ФЕП-33с` / `ПМІ-31с` / `ІНІ-32с`: returns `[]`
 */
export function detectParallelGroupDimensions(
  lessons: readonly ScheduleLesson[],
  context?: { universityId?: string; groupId?: string }
): ParallelGroupDimension[] {
  const slotEvidenceByDimension = new Map<
    string,
    Map<string, { optionKeys: Set<string>; variantKeys: Set<string>; hasConfirmedLabel: boolean }>
  >();
  const baseLabelByDimension = new Map<string, string>();

  for (const lesson of lessons) {
    if (!isParallelLessonCandidate(lesson, context?.universityId, context?.groupId)) {
      continue;
    }
    const { baseSubject } = parseParallelSubject(lesson.subject);
    if (!baseSubject) continue;
    const dimKey = computeParallelDimensionKey(lesson.subject);
    const optKey = computeParallelOptionKey(lesson.subject, lesson.teacher);
    const varKey = computeParallelVariantKey(lesson.subject);
    const normType = normalizeParallelLessonType(lesson.lessonType);
    const weekKey = lesson.date ?? `d${lesson.dayOfWeek}:${lesson.weekType ?? 'both'}`;
    const slotKey = `${weekKey}|${lesson.number}|${normType}`;

    if (!baseLabelByDimension.has(dimKey)) {
      baseLabelByDimension.set(dimKey, baseSubject);
    }
    let slotsMap = slotEvidenceByDimension.get(dimKey);
    if (!slotsMap) {
      slotsMap = new Map();
      slotEvidenceByDimension.set(dimKey, slotsMap);
    }
    let ev = slotsMap.get(slotKey);
    if (!ev) {
      ev = { optionKeys: new Set(), variantKeys: new Set(), hasConfirmedLabel: false };
      slotsMap.set(slotKey, ev);
    }
    ev.optionKeys.add(optKey);
    if (varKey) ev.variantKeys.add(varKey);
    if (hasConfirmedParallelLabel(lesson.groupLabel)) ev.hasConfirmedLabel = true;
  }

  const confirmedDimensions = new Set<string>();
  for (const [dimKey, slotsMap] of slotEvidenceByDimension.entries()) {
    for (const ev of slotsMap.values()) {
      // Confirmed if: (>=2 distinct options AND confirmed source label) OR (>=2 distinct parenthetical variants in same slot)
      if ((ev.optionKeys.size >= 2 && ev.hasConfirmedLabel) || ev.variantKeys.size >= 2) {
        confirmedDimensions.add(dimKey);
        break;
      }
    }
  }

  if (confirmedDimensions.size === 0) {
    return [];
  }

  const optionsByDim = new Map<
    string,
    Map<
      string,
      {
        subject: string;
        teacher: string;
        variantLabel?: string;
        variantKey?: string;
        lessonCount: number;
      }
    >
  >();
  const variantsByDim = new Map<
    string,
    Map<string, { variantLabel: string; lessonCount: number; optionKeys: Set<string> }>
  >();

  for (const lesson of lessons) {
    if (!isParallelLessonCandidate(lesson, context?.universityId, context?.groupId)) {
      continue;
    }
    const dimKey = computeParallelDimensionKey(lesson.subject);
    if (!confirmedDimensions.has(dimKey)) continue;

    const { variantLabel } = parseParallelSubject(lesson.subject);
    const variantKey = computeParallelVariantKey(lesson.subject);
    const optKey = computeParallelOptionKey(lesson.subject, lesson.teacher);
    const teacher = lesson.teacher?.replace(/\s+/g, ' ').trim() || '';

    let dimOpts = optionsByDim.get(dimKey);
    if (!dimOpts) {
      dimOpts = new Map();
      optionsByDim.set(dimKey, dimOpts);
    }
    const existingOpt = dimOpts.get(optKey);
    if (existingOpt) {
      existingOpt.lessonCount += 1;
    } else {
      dimOpts.set(optKey, {
        subject: lesson.subject.replace(/\s+/g, ' ').trim(),
        teacher,
        variantLabel,
        variantKey,
        lessonCount: 1,
      });
    }

    if (variantKey && variantLabel) {
      let dimVars = variantsByDim.get(dimKey);
      if (!dimVars) {
        dimVars = new Map();
        variantsByDim.set(dimKey, dimVars);
      }
      const existingVar = dimVars.get(variantKey);
      if (existingVar) {
        existingVar.lessonCount += 1;
        existingVar.optionKeys.add(optKey);
      } else {
        dimVars.set(variantKey, {
          variantLabel,
          lessonCount: 1,
          optionKeys: new Set([optKey]),
        });
      }
    }
  }

  const dimensions: ParallelGroupDimension[] = [];
  for (const dimKey of confirmedDimensions) {
    const label = baseLabelByDimension.get(dimKey) ?? dimKey;
    const dimOpts = optionsByDim.get(dimKey);
    if (!dimOpts || dimOpts.size < 2) continue;

    const dimVars = variantsByDim.get(dimKey);
    const hasVariants = Boolean(dimVars && dimVars.size >= 2);
    const options: ParallelGroupOption[] = [];

    if (hasVariants && dimVars) {
      const sortedVars = Array.from(dimVars.entries()).sort((a, b) =>
        a[1].variantLabel.localeCompare(b[1].variantLabel, 'uk')
      );
      for (const [varKey, info] of sortedVars) {
        if (info.optionKeys.size >= 2) {
          options.push({
            key: varKey,
            label: `${info.variantLabel} (усі викладачі)`,
            description: `Частковий фільтр за мовою — показано ${info.optionKeys.size} паралельних викладачів`,
            badge: `Мова · ${info.optionKeys.size}`,
            isVariantGroup: true,
            lessonCount: info.lessonCount,
          });
        }
      }
    }

    const sortedConcrete = Array.from(dimOpts.entries()).sort((a, b) => {
      const varCmp = (a[1].variantLabel ?? '').localeCompare(b[1].variantLabel ?? '', 'uk');
      if (varCmp !== 0) return varCmp;
      return (a[1].teacher || a[1].subject).localeCompare(b[1].teacher || b[1].subject, 'uk');
    });

    for (const [optKey, info] of sortedConcrete) {
      const teacherDisplay = info.teacher || 'Викладач не вказаний у джерелі';
      const primaryLabel = info.variantLabel
        ? `${info.variantLabel} · ${teacherDisplay}`
        : teacherDisplay;
      options.push({
        key: optKey,
        label: primaryLabel,
        description: info.variantLabel ? info.subject : undefined,
        badge: info.variantLabel,
        lessonCount: info.lessonCount,
      });
    }

    dimensions.push({
      key: dimKey,
      label,
      hasVariants,
      options,
    });
  }

  return dimensions.sort((a, b) => a.label.localeCompare(b.label, 'uk'));
}

export interface ResolvedParallelSelectionsState {
  /** Only selections that actually match at least one option in the current schedule window. */
  effectiveSelections: ParallelSelectionMap | undefined;
  /** Dimensions with no selection yet. */
  unconfiguredDimensions: ParallelGroupDimension[];
  /** Dimensions whose saved selection no longer matches any option (e.g. teacher replacement). */
  staleDimensions: ParallelGroupDimension[];
  /** Dimensions filtered only at language/variant level ("усі викладачі" — still contains multiple subgroups). */
  partialDimensions: ParallelGroupDimension[];
}

/**
 * Validates saved `selectedParallelGroups` against the currently loaded schedule's dimensions.
 * Guarantees that a stale or replaced teacher NEVER causes lessons to silently disappear:
 * stale keys are omitted from `effectiveSelections` and surfaced via `staleDimensions`.
 */
export function resolveActiveParallelSelections(
  dimensions: readonly ParallelGroupDimension[],
  selectedParallelGroups?: ParallelSelectionMap | null
): ResolvedParallelSelectionsState {
  if (dimensions.length === 0) {
    return {
      effectiveSelections: undefined,
      unconfiguredDimensions: [],
      staleDimensions: [],
      partialDimensions: [],
    };
  }

  const effective: ParallelSelectionMap = {};
  const unconfiguredDimensions: ParallelGroupDimension[] = [];
  const staleDimensions: ParallelGroupDimension[] = [];
  const partialDimensions: ParallelGroupDimension[] = [];

  for (const dim of dimensions) {
    const chosen = selectedParallelGroups?.[dim.key];
    if (!chosen) {
      unconfiguredDimensions.push(dim);
      continue;
    }
    const matchedOption = dim.options.find((opt) => opt.key === chosen);
    if (!matchedOption) {
      staleDimensions.push(dim);
      continue;
    }
    effective[dim.key] = chosen;
    if (matchedOption.isVariantGroup) {
      partialDimensions.push(dim);
    }
  }

  return {
    effectiveSelections: Object.keys(effective).length > 0 ? effective : undefined,
    unconfiguredDimensions,
    staleDimensions,
    partialDimensions,
  };
}

/**
 * Checks if a lesson matches the user's `selectedParallelGroups` preferences.
 * When no preference is set for the lesson's dimension, returns `true` (never silently hides lessons).
 */
export function matchesParallelGroupSelection(
  lesson: {
    subject: string;
    teacher?: string | null;
    isElective?: boolean;
    subgroup?: 1 | 2 | null;
    trackNumber?: number | null;
    groupLabel?: string | null;
    parallelGroupKey?: string;
    parallelOptionKey?: string;
    parallelVariantKey?: string;
  },
  selectedParallelGroups?: ParallelSelectionMap | null
): boolean {
  if (!selectedParallelGroups) return true;
  if (lesson.isElective) return true;
  if (lesson.subgroup === 1 || lesson.subgroup === 2) return true;
  if (lesson.trackNumber !== undefined && lesson.trackNumber !== null) return true;

  // If groupLabel is explicitly present and not a parallel marker nor variant, never hide it
  if (
    !lesson.parallelGroupKey &&
    lesson.groupLabel !== undefined &&
    !hasConfirmedParallelLabel(lesson.groupLabel) &&
    !computeParallelVariantKey(lesson.subject)
  ) {
    return true;
  }

  const dimKey = lesson.parallelGroupKey ?? computeParallelDimensionKey(lesson.subject);
  const chosen = selectedParallelGroups[dimKey];
  if (!chosen) return true;

  const optKey = lesson.parallelOptionKey ?? computeParallelOptionKey(lesson.subject, lesson.teacher);
  if (optKey === chosen) return true;

  const varKey = lesson.parallelVariantKey ?? computeParallelVariantKey(lesson.subject);
  if (varKey && varKey === chosen) return true;

  return false;
}
