import { normalizeGroupHomoglyphs } from '../integrations/universities/lnu/lnuParser';
import type { Program } from '../integrations/universities/types';

export interface LnuProgramCatalogEntry {
  id: string;
  facultyId: string;
  name: string;
  /** Canonical Cyrillic group prefixes verified against official LNU sources. */
  prefixes: readonly string[];
  /** Authoritative provenance URL or reference. */
  provenance: string;
}

export interface VerifiedLnuGroupMetadata {
  facultyId: string;
  programId: string;
  programName: string;
  prefix: string;
  provenance: string;
}

/**
 * Authoritative LNU group-prefix → faculty/specialty catalog.
 * Only mappings backed by official lnu.edu.ua faculty pages and deanery timetables are listed.
 * Groups with prefixes not listed here remain unverified (unknown) and are never guessed.
 */
export const LNU_ACADEMIC_CATALOG: readonly LnuProgramCatalogEntry[] = [
  // Faculty 1005: Факультет електроніки та комп'ютерних технологій
  // Sources: electronics.lnu.edu.ua/education/schedule, guide.electronics.lnu.edu.ua
  {
    id: 'lnu-1005-se',
    facultyId: '1005',
    name: 'Інженерія програмного забезпечення (121)',
    prefixes: ['ФЕП'],
    provenance: 'https://electronics.lnu.edu.ua/education/schedule',
  },
  {
    id: 'lnu-1005-cs',
    facultyId: '1005',
    name: "Комп'ютерні науки (122)",
    prefixes: ['ФЕІ', 'ФЕІМ'],
    provenance: 'https://electronics.lnu.edu.ua/education/schedule',
  },
  {
    id: 'lnu-1005-ist',
    facultyId: '1005',
    name: 'Інформаційні системи та технології (126)',
    prefixes: ['ФЕС'],
    provenance: 'https://electronics.lnu.edu.ua/education/schedule',
  },
  {
    id: 'lnu-1005-el',
    facultyId: '1005',
    name: "Електроніка та комп'ютерні системи (171)",
    prefixes: ['ФЕЛ', 'ФЕЛМ'],
    provenance: 'https://electronics.lnu.edu.ua/education/schedule',
  },
  {
    id: 'lnu-1005-mnt',
    facultyId: '1005',
    name: 'Мікро- та наносистемна техніка (153)',
    prefixes: ['ФЕМ'],
    provenance: 'https://electronics.lnu.edu.ua/education/schedule',
  },

  // Faculty 1007: Факультет іноземних мов
  // Source: lingua.lnu.edu.ua/education/schedule
  {
    id: 'lnu-1007-en',
    facultyId: '1007',
    name: 'Англійська філологія',
    prefixes: ['ІНА'],
    provenance: 'https://lingua.lnu.edu.ua/education/schedule',
  },
  {
    id: 'lnu-1007-de',
    facultyId: '1007',
    name: 'Німецька філологія',
    prefixes: ['ІНН'],
    provenance: 'https://lingua.lnu.edu.ua/education/schedule',
  },
  {
    id: 'lnu-1007-fr',
    facultyId: '1007',
    name: 'Французька філологія',
    prefixes: ['ІНФ'],
    provenance: 'https://lingua.lnu.edu.ua/education/schedule',
  },
  {
    id: 'lnu-1007-es',
    facultyId: '1007',
    name: 'Іспанська філологія',
    prefixes: ['ІНІ'],
    provenance: 'https://lingua.lnu.edu.ua/education/schedule',
  },
  {
    id: 'lnu-1007-tr',
    facultyId: '1007',
    name: 'Перекладознавство',
    prefixes: ['ІНП'],
    provenance: 'https://lingua.lnu.edu.ua/education/schedule',
  },

  // Faculty 1013: Факультет прикладної математики та інформатики
  // Source: ami.lnu.edu.ua
  {
    id: 'lnu-1013-cs',
    facultyId: '1013',
    name: "Комп'ютерні науки / Інформатика",
    prefixes: ['ПМІ', 'ПМІМ'],
    provenance: 'https://ami.lnu.edu.ua/',
  },
  {
    id: 'lnu-1013-am',
    facultyId: '1013',
    name: 'Прикладна математика',
    prefixes: ['ПМА'],
    provenance: 'https://ami.lnu.edu.ua/',
  },
  {
    id: 'lnu-1013-cb',
    facultyId: '1013',
    name: 'Кібербезпека',
    prefixes: ['ПМК'],
    provenance: 'https://ami.lnu.edu.ua/',
  },
  {
    id: 'lnu-1013-sa',
    facultyId: '1013',
    name: 'Системний аналіз / Програмна інженерія',
    prefixes: ['ПМП'],
    provenance: 'https://ami.lnu.edu.ua/',
  },

  // Faculty 1012: Факультет педагогічної освіти
  // Source: pedosvita.lnu.edu.ua
  {
    id: 'lnu-1012-pd',
    facultyId: '1012',
    name: 'Дошкільна освіта',
    prefixes: ['ФПД'],
    provenance: 'https://lnu.edu.ua/',
  },

  // Faculty 1014: Факультет управління фінансами та бізнесу
  // Source: financial.lnu.edu.ua
  {
    id: 'lnu-1014-fin',
    facultyId: '1014',
    name: 'Фінанси, банківська справа та страхування',
    prefixes: ['УФФ', 'УФФМ'],
    provenance: 'https://lnu.edu.ua/',
  },
  {
    id: 'lnu-1014-pub',
    facultyId: '1014',
    name: 'Публічне управління та адміністрування',
    prefixes: ['УФП', 'УФПМ'],
    provenance: 'https://lnu.edu.ua/',
  },
  {
    id: 'lnu-1014-acc',
    facultyId: '1014',
    name: 'Облік і оподаткування',
    prefixes: ['УФО'],
    provenance: 'https://lnu.edu.ua/',
  },
  {
    id: 'lnu-1014-econ',
    facultyId: '1014',
    name: 'Економіка та підприємництво',
    prefixes: ['УФЕ'],
    provenance: 'https://lnu.edu.ua/',
  },
] as const;

const PREFIX_LOOKUP = new Map<string, VerifiedLnuGroupMetadata>();
for (const entry of LNU_ACADEMIC_CATALOG) {
  for (const prefix of entry.prefixes) {
    PREFIX_LOOKUP.set(normalizeGroupHomoglyphs(prefix), {
      facultyId: entry.facultyId,
      programId: entry.id,
      programName: entry.name,
      prefix,
      provenance: entry.provenance,
    });
  }
}

export function extractNormalizedGroupPrefix(groupName: string): string {
  const normalized = normalizeGroupHomoglyphs(groupName);
  const match = normalized.match(/^([а-яіїєґ]+)/);
  return match?.[1] ?? '';
}

export function resolveVerifiedLnuGroupMetadata(
  groupName: string | null | undefined
): VerifiedLnuGroupMetadata | null {
  if (!groupName) return null;
  const prefix = extractNormalizedGroupPrefix(groupName);
  if (!prefix) return null;
  return PREFIX_LOOKUP.get(prefix) ?? null;
}

export function getVerifiedLnuPrograms(facultyId?: string): Program[] {
  const list = facultyId
    ? LNU_ACADEMIC_CATALOG.filter((entry) => entry.facultyId === facultyId)
    : LNU_ACADEMIC_CATALOG;
  return list.map((entry) => ({
    id: entry.id,
    facultyId: entry.facultyId,
    name: entry.name,
  }));
}

export function hasVerifiedLnuCatalogForFaculty(facultyId?: string | null): boolean {
  if (!facultyId) return false;
  return LNU_ACADEMIC_CATALOG.some((entry) => entry.facultyId === facultyId);
}

export function validateLnuAcademicSelection(params: {
  groupName: string;
  facultyId?: string | null;
  programId?: string | null;
}):
  | { ok: true; verified: VerifiedLnuGroupMetadata | null }
  | { ok: false; reason: string; verified: VerifiedLnuGroupMetadata } {
  const verified = resolveVerifiedLnuGroupMetadata(params.groupName);
  if (!verified) {
    return { ok: true, verified: null };
  }
  const requestedFaculty = params.facultyId?.trim();
  if (requestedFaculty && requestedFaculty !== '0' && requestedFaculty !== verified.facultyId) {
    return {
      ok: false,
      reason: `Група ${params.groupName} не належить до обраного факультету (підтверджена приналежність: ${verified.programName}).`,
      verified,
    };
  }
  const requestedProgram = params.programId?.trim();
  if (requestedProgram && requestedProgram !== verified.programId) {
    return {
      ok: false,
      reason: `Група ${params.groupName} не належить до обраної спеціальності (підтверджена спеціальність: ${verified.programName}).`,
      verified,
    };
  }
  return { ok: true, verified };
}
