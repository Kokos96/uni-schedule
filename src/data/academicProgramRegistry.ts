const LATIN_TO_CYRILLIC: Record<string, string> = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', i: 'і', k: 'к', m: 'м',
  o: 'о', p: 'р', t: 'т', x: 'х', y: 'у',
};

function normalizeGroupHomoglyphs(input: string): string {
  return input
    .trim()
    .toLocaleLowerCase('uk-UA')
    .replace(/[abcehikmoptxy]/g, (ch) => LATIN_TO_CYRILLIC[ch] ?? ch)
    .replace(/\s+/g, '');
}
import type { DepartmentType } from '../types';

export interface SubjectDepartmentRule {
  /** Normalized subject substring (homoglyphs/apostrophes/case normalized). */
  normalizedSubject: string;
  departments: readonly DepartmentType[];
}

export interface AcademicProgramDefinition {
  id: string;
  universityId: string;
  facultyId: string;
  name: string;
  /** Canonical group IDs verified against the university directory. */
  groupIds: readonly string[];
  departments: readonly DepartmentType[];
  subjectDepartmentRules: readonly SubjectDepartmentRule[];
}

function normalizeSubjectForMatch(subject: string): string {
  return normalizeGroupHomoglyphs(
    subject
      .replace(/[`'’"]/g, '')
      .replace(/^\d+\.\s*/, '')
      .trim()
  );
}

/**
 * Data-driven registry of verified academic programs with department-specific subjects.
 * Sources:
 * - LNU group directory (n=701&lev=142): canonical IDs ФЕП-31с, ФЕП-32с, ФЕП-33с, ФЕП-34с
 * - Verified historical & live LNU timetable mappings (СП/ОІТ: Нереляційні та розподілені бази даних;
 *   РКС/РКТ: Вибрані розділи мови програмування С/C).
 * Shared subjects (e.g. Професійний Python, М'які обчислення) are intentionally unmapped so they
 * remain visible to all departments.
 */
export const ACADEMIC_PROGRAM_REGISTRY: readonly AcademicProgramDefinition[] = [
  {
    id: 'lnu-fep-3',
    universityId: 'lnu',
    facultyId: '1005',
    name: 'Інженерія програмного забезпечення (3 курс, ФЕП)',
    groupIds: ['ФЕП-31с', 'ФЕП-32с', 'ФЕП-33с', 'ФЕП-34с'],
    departments: ['sp', 'oit', 'rks', 'rkt'],
    subjectDepartmentRules: [
      {
        normalizedSubject: normalizeSubjectForMatch('Нереляційні та розподілені бази даних'),
        departments: ['sp', 'oit'],
      },
      {
        normalizedSubject: normalizeSubjectForMatch('Вибрані розділи мови програмування C'),
        departments: ['rks', 'rkt'],
      },
    ],
  },
] as const;

export function findAcademicProgramForGroup(
  universityId?: string | null,
  groupId?: string | null
): AcademicProgramDefinition | undefined {
  if (!universityId || !groupId) return undefined;
  const targetGroup = normalizeGroupHomoglyphs(groupId);
  if (!targetGroup) return undefined;
  return ACADEMIC_PROGRAM_REGISTRY.find(
    (program) =>
      program.universityId === universityId &&
      program.groupIds.some((g) => normalizeGroupHomoglyphs(g) === targetGroup)
  );
}

export function hasDepartmentSupportForGroup(
  universityId?: string | null,
  groupId?: string | null
): boolean {
  return Boolean(findAcademicProgramForGroup(universityId, groupId));
}

export function resolveDepartmentsForLesson(
  universityId: string | null | undefined,
  groupId: string | null | undefined,
  subject: string
): DepartmentType[] | undefined {
  const program = findAcademicProgramForGroup(universityId, groupId);
  if (!program) return undefined;
  const normSubj = normalizeSubjectForMatch(subject);
  if (!normSubj) return undefined;
  for (const rule of program.subjectDepartmentRules) {
    if (normSubj === rule.normalizedSubject || normSubj.includes(rule.normalizedSubject)) {
      return [...rule.departments];
    }
  }
  return undefined;
}
