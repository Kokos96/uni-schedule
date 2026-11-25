import { getApiBaseUrl } from '../../../services/apiClient';
import {
  getVerifiedLnuPrograms,
  resolveVerifiedLnuGroupMetadata,
} from '../../../data/lnuAcademicCatalog';
import { addDays, formatIsoDate } from '../../../utils/date';
import type {
  Course,
  Faculty,
  Group,
  NormalizedSchedule,
  Program,
  StudentSelection,
  Subgroup,
  UniversityAdapter,
  UniversityMeta,
} from '../types';
import { decodeCp1251, encodeCp1251Form } from './cp1251';
import {
  parseLnuFacultiesHtml,
  parseLnuGroupsJson,
  parseLnuScheduleHtml,
} from './lnuParser';

const LNU_TIMETABLE_URL = 'https://dekanat.lnu.edu.ua/cgi-bin/timetable.cgi';
const DEFAULT_MEMORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

const LNU_DEFAULT_FACULTIES: Faculty[] = [
  { id: '1021', name: 'Педагогічний фаховий коледж Львівського національного університету імені Івана Франка' },
  { id: '1024', name: 'Загальноуніверситетські кафедри' },
  { id: '1025', name: 'Аспірантура' },
  { id: '1001', name: 'Біологічний факультет' },
  { id: '1002', name: 'Географічний факультет' },
  { id: '1003', name: 'Геологічний факультет' },
  { id: '1004', name: 'Економічний факультет' },
  { id: '1005', name: "Факультет електроніки та комп'ютерних технологій" },
  { id: '1006', name: 'Факультет журналістики' },
  { id: '1007', name: 'Факультет іноземних мов' },
  { id: '1008', name: 'Історичний факультет' },
  { id: '1009', name: 'Факультет культури і мистецтв' },
  { id: '1010', name: 'Факультет міжнародних відносин' },
  { id: '1011', name: 'Механіко-математичний факультет' },
  { id: '1012', name: 'Факультет педагогічної освіти' },
  { id: '1013', name: 'Факультет прикладної математики та інформатики' },
  { id: '1014', name: 'Факультет управління фінансами та бізнесу' },
  { id: '1015', name: 'Фізичний факультет' },
  { id: '1016', name: 'Філологічний факультет' },
  { id: '1017', name: 'Філософський факультет' },
  { id: '1018', name: 'Хімічний факультет' },
  { id: '1019', name: 'Юридичний факультет' },
  { id: '1020', name: 'Інститут післядипломної освіти та доуніверситетської підготовки' },
];

const LNU_COURSES: Course[] = [1, 2, 3, 4, 5, 6].map((n) => ({
  id: String(n),
  number: n,
  label: `${n} курс`,
}));

const LNU_SUBGROUPS: Subgroup[] = [
  { id: '1', label: '1-ша підгрупа', value: 1 },
  { id: '2', label: '2-га підгрупа', value: 2 },
];

function formatDdMmYyyy(date: Date): string {
  const iso = formatIsoDate(date);
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}.${mm}.${yyyy}`;
}

async function parseApiJson<T>(res: Response, fallbackMessage: string): Promise<T> {
  const contentType = res.headers.get('content-type') ?? '';
  const raw = await res.text();
  if (!contentType.includes('application/json') && /^\s*</.test(raw)) {
    throw new Error(fallbackMessage);
  }
  try {
    return JSON.parse(raw) as T;
  } catch {
    throw new Error(fallbackMessage);
  }
}

export class LnuAdapter implements UniversityAdapter {
  public readonly meta: UniversityMeta = {
    id: 'lnu',
    name: 'Львівський національний університет імені Івана Франка',
    shortName: 'ЛНУ ім. Івана Франка',
    city: 'Львів',
    supportStatus: 'live',
    capabilities: {
      hasFaculties: true,
      hasPrograms: true,
      hasCourses: true,
      hasGroups: true,
      hasSubgroups: true,
    },
    sourceNote: 'Джерело: ПС-Розклад (dekanat.lnu.edu.ua)',
  };

  private readonly endpointUrl: string;
  private readonly apiBaseUrlOverride?: string | null;
  private cachedGroups: { items: Group[]; fetchedAt: number } | null = null;
  private cachedFaculties: { items: Faculty[]; fetchedAt: number } | null = null;

  public constructor(
    endpointUrl: string = LNU_TIMETABLE_URL,
    apiBaseUrlOverride?: string | null
  ) {
    this.endpointUrl = endpointUrl;
    this.apiBaseUrlOverride = apiBaseUrlOverride;
  }

  private get proxyBaseUrl(): string | null {
    if (this.apiBaseUrlOverride !== undefined) {
      return this.apiBaseUrlOverride;
    }
    if (typeof window !== 'undefined') {
      return getApiBaseUrl();
    }
    return null;
  }

  private get isBrowserWithoutProxy(): boolean {
    return typeof window !== 'undefined' && !this.proxyBaseUrl;
  }

  public async getFaculties(options?: {
    ttlMs?: number;
    forceRefresh?: boolean;
  }): Promise<Faculty[]> {
    const ttlMs = options?.ttlMs ?? DEFAULT_MEMORY_CACHE_TTL_MS;
    if (
      !options?.forceRefresh &&
      this.cachedFaculties &&
      Date.now() - this.cachedFaculties.fetchedAt < ttlMs
    ) {
      return this.cachedFaculties.items;
    }

    const proxy = this.proxyBaseUrl;
    if (proxy) {
      try {
        const res = await fetch(`${proxy}/api/universities/lnu/faculties`);
        if (res.ok) {
          const data = (await res.json()) as { faculties?: Faculty[] };
          if (Array.isArray(data.faculties) && data.faculties.length > 0) {
            this.cachedFaculties = { items: data.faculties, fetchedAt: Date.now() };
            return data.faculties;
          }
        }
      } catch {
        // Fall back to verified faculty list
      }
      return LNU_DEFAULT_FACULTIES;
    }

    if (this.isBrowserWithoutProxy) {
      return LNU_DEFAULT_FACULTIES;
    }

    try {
      const res = await fetch(this.endpointUrl);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const html = decodeCp1251(await res.arrayBuffer());
      const parsed = parseLnuFacultiesHtml(html);
      if (parsed.length > 0) {
        this.cachedFaculties = { items: parsed, fetchedAt: Date.now() };
        return parsed;
      }
    } catch {
      // Fall back to verified faculty list when upstream is unreachable
    }
    return LNU_DEFAULT_FACULTIES;
  }

  public async getPrograms(facultyId: string): Promise<Program[]> {
    return getVerifiedLnuPrograms(facultyId);
  }

  public async getCourses(): Promise<Course[]> {
    return LNU_COURSES;
  }

  public async getGroups(
    filter?: {
      facultyId?: string;
      programId?: string;
      course?: number;
      includeAll?: boolean;
    },
    options?: {
      ttlMs?: number;
      forceRefresh?: boolean;
    }
  ): Promise<Group[]> {
    const proxy = this.proxyBaseUrl;
    if (proxy) {
      const qs = new URLSearchParams();
      if (filter?.includeAll) {
        qs.set('includeAll', '1');
      } else {
        if (filter?.facultyId) qs.set('facultyId', filter.facultyId);
        if (filter?.programId) qs.set('programId', filter.programId);
      }
      if (filter?.course) qs.set('course', String(filter.course));
      const querySuffix = qs.toString() ? `?${qs.toString()}` : '';
      const res = await fetch(`${proxy}/api/universities/lnu/groups${querySuffix}`);
      if (!res.ok) {
        throw new Error(`Сервер API повернув помилку HTTP ${res.status}`);
      }
      const data = await parseApiJson<{ groups?: Group[] }>(
        res,
        'Сервер довідника груп тимчасово недоступний. Спробуйте оновити список пізніше.'
      );
      const groups = Array.isArray(data.groups) ? data.groups : [];
      if (filter?.includeAll || (!filter?.facultyId && !filter?.programId)) {
        return groups;
      }
      return groups.filter((g) => {
        if (filter?.facultyId && g.facultyId !== filter.facultyId) return false;
        if (filter?.programId && g.programId !== filter.programId) return false;
        if (filter?.course && g.course !== filter.course) return false;
        return true;
      });
    }

    if (this.isBrowserWithoutProxy) {
      return [];
    }

    const ttlMs = options?.ttlMs ?? DEFAULT_MEMORY_CACHE_TTL_MS;
    const isMemoryCacheFresh =
      !options?.forceRefresh &&
      this.cachedGroups !== null &&
      Date.now() - this.cachedGroups.fetchedAt < ttlMs;

    if (!isMemoryCacheFresh) {
      const res = await fetch(`${this.endpointUrl}?n=701&lev=142`);
      if (!res.ok) {
        throw new Error(`Сервер ЛНУ повернув помилку HTTP ${res.status}`);
      }
      const text = decodeCp1251(await res.arrayBuffer());
      const parsed = parseLnuGroupsJson(text).map((g) => {
        const verified = resolveVerifiedLnuGroupMetadata(g.name);
        return verified
          ? {
              ...g,
              facultyId: verified.facultyId,
              facultyVerified: true,
              programId: verified.programId,
              programName: verified.programName,
            }
          : g;
      });
      this.cachedGroups = {
        items: parsed,
        fetchedAt: Date.now(),
      };
    }

    const groups = this.cachedGroups!.items;
    return groups.filter((g) => {
      if (!filter?.includeAll) {
        if (filter?.facultyId && g.facultyId !== filter.facultyId) {
          return false;
        }
        if (filter?.programId && g.programId !== filter.programId) {
          return false;
        }
      }
      if (filter?.course && g.course !== filter.course) {
        return false;
      }
      return true;
    });
  }

  public async getSubgroups(): Promise<Subgroup[]> {
    return LNU_SUBGROUPS;
  }

  public async fetchSchedule(
    selection: StudentSelection,
    options?: { force?: boolean }
  ): Promise<NormalizedSchedule> {
    const proxy = this.proxyBaseUrl;
    if (proxy) {
      const qs = new URLSearchParams({
        universityId: 'lnu',
        group: selection.groupName,
      });
      if (selection.facultyId) qs.set('facultyId', selection.facultyId);
      if (selection.programId) qs.set('programId', selection.programId);
      if (selection.course) qs.set('course', String(selection.course));
      if (options?.force) qs.set('force', '1');

      const res = await fetch(`${proxy}/api/schedule?${qs.toString()}`);
      if (!res.ok) {
        const errPayload = await parseApiJson<{
          error?: { message?: string };
        }>(res, `Сервер API повернув помилку HTTP ${res.status}`).catch(() => null);
        throw new Error(
          errPayload?.error?.message ?? `Сервер API повернув помилку HTTP ${res.status}`
        );
      }
      const data = await parseApiJson<{ schedule: NormalizedSchedule }>(
        res,
        'Сервер розкладу повернув некоректну відповідь. Спробуйте пізніше або перевірте підключення.'
      );
      return data.schedule;
    }

    if (this.isBrowserWithoutProxy) {
      throw new Error(
        'Не налаштовано VITE_API_BASE_URL (серверний проксі Cloudflare Worker). Прямі запити з браузера до dekanat.lnu.edu.ua не виконуються через CORS.'
      );
    }

    const today = new Date();
    const sdate = formatDdMmYyyy(addDays(today, -3));
    const edate = formatDdMmYyyy(addDays(today, 14));

    const body = encodeCp1251Form({
      n: '700',
      faculty: selection.facultyId ?? '0',
      course: selection.course ? String(selection.course) : '0',
      group: selection.groupName,
      sdate,
      edate,
    });

    const res = await fetch(`${this.endpointUrl}?n=700`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body,
    });

    if (!res.ok) {
      throw new Error(`Сервер ЛНУ повернув помилку HTTP ${res.status}`);
    }

    const html = decodeCp1251(await res.arrayBuffer());
    return parseLnuScheduleHtml(html, selection, {
      sourceUrl: `${this.endpointUrl}?n=700`,
      coveredFrom: formatIsoDate(addDays(today, -3)),
      coveredTo: formatIsoDate(addDays(today, 14)),
    });
  }
}
