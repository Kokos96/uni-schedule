import { getApiBaseUrl } from '../../../services/apiClient';
import { addDays, formatIsoDate } from '../../../utils/date';
import type {
  Course,
  Faculty,
  Group,
  NormalizedSchedule,
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

const LNU_DEFAULT_FACULTIES: Faculty[] = [
  { id: '1005', name: "Факультет електроніки та комп'ютерних технологій" },
  { id: '1013', name: 'Факультет прикладної математики та інформатики' },
  { id: '1011', name: 'Механіко-математичний факультет' },
  { id: '1015', name: 'Фізичний факультет' },
  { id: '1004', name: 'Економічний факультет' },
  { id: '1019', name: 'Юридичний факультет' },
  { id: '1007', name: 'Факультет іноземних мов' },
  { id: '1010', name: 'Факультет міжнародних відносин' },
  { id: '1006', name: 'Факультет журналістики' },
  { id: '1016', name: 'Філологічний факультет' },
  { id: '1008', name: 'Історичний факультет' },
  { id: '1017', name: 'Філософський факультет' },
  { id: '1001', name: 'Біологічний факультет' },
  { id: '1018', name: 'Хімічний факультет' },
  { id: '1002', name: 'Географічний факультет' },
  { id: '1003', name: 'Геологічний факультет' },
  { id: '1012', name: 'Факультет педагогічної освіти' },
  { id: '1009', name: 'Факультет культури і мистецтв' },
  { id: '1014', name: 'Факультет управління фінансами та бізнесу' },
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

export class LnuAdapter implements UniversityAdapter {
  public readonly meta: UniversityMeta = {
    id: 'lnu',
    name: 'Львівський національний університет імені Івана Франка',
    shortName: 'ЛНУ ім. Івана Франка',
    city: 'Львів',
    supportStatus: 'live',
    capabilities: {
      hasFaculties: true,
      hasPrograms: false,
      hasCourses: true,
      hasGroups: true,
      hasSubgroups: true,
    },
    sourceNote: 'Джерело: ПС-Розклад (dekanat.lnu.edu.ua)',
  };

  private readonly endpointUrl: string;
  private readonly apiBaseUrlOverride?: string | null;
  private cachedGroups: Group[] | null = null;
  private cachedFaculties: Faculty[] | null = null;

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

  public async getFaculties(): Promise<Faculty[]> {
    if (this.cachedFaculties) return this.cachedFaculties;

    const proxy = this.proxyBaseUrl;
    if (proxy) {
      try {
        const res = await fetch(`${proxy}/api/universities/lnu/faculties`);
        if (res.ok) {
          const data = (await res.json()) as { faculties?: Faculty[] };
          if (Array.isArray(data.faculties) && data.faculties.length > 0) {
            this.cachedFaculties = data.faculties;
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
        this.cachedFaculties = parsed;
        return parsed;
      }
    } catch {
      // Fall back to verified faculty list when upstream is unreachable
    }
    return LNU_DEFAULT_FACULTIES;
  }

  public async getCourses(): Promise<Course[]> {
    return LNU_COURSES;
  }

  public async getGroups(filter?: {
    facultyId?: string;
    course?: number;
  }): Promise<Group[]> {
    const proxy = this.proxyBaseUrl;
    if (proxy) {
      const qs = new URLSearchParams();
      if (filter?.course) qs.set('course', String(filter.course));
      const querySuffix = qs.toString() ? `?${qs.toString()}` : '';
      const res = await fetch(`${proxy}/api/universities/lnu/groups${querySuffix}`);
      if (!res.ok) {
        throw new Error(`Сервер API повернув помилку HTTP ${res.status}`);
      }
      const data = (await res.json()) as { groups?: Group[] };
      return Array.isArray(data.groups) ? data.groups : [];
    }

    if (this.isBrowserWithoutProxy) {
      return [];
    }

    if (!this.cachedGroups) {
      const res = await fetch(`${this.endpointUrl}?n=701&lev=142`);
      if (!res.ok) {
        throw new Error(`Сервер ЛНУ повернув помилку HTTP ${res.status}`);
      }
      const text = decodeCp1251(await res.arrayBuffer());
      this.cachedGroups = parseLnuGroupsJson(text);
    }

    if (!filter?.course) return this.cachedGroups;
    return this.cachedGroups.filter(
      (g) => g.course === undefined || g.course === filter.course
    );
  }

  public async getSubgroups(): Promise<Subgroup[]> {
    return LNU_SUBGROUPS;
  }

  public async fetchSchedule(
    selection: StudentSelection
  ): Promise<NormalizedSchedule> {
    const proxy = this.proxyBaseUrl;
    if (proxy) {
      const qs = new URLSearchParams({
        universityId: 'lnu',
        group: selection.groupName,
      });
      if (selection.facultyId) qs.set('facultyId', selection.facultyId);
      if (selection.course) qs.set('course', String(selection.course));

      const res = await fetch(`${proxy}/api/schedule?${qs.toString()}`);
      if (!res.ok) {
        throw new Error(`Сервер API повернув помилку HTTP ${res.status}`);
      }
      const data = (await res.json()) as { schedule: NormalizedSchedule };
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
    });
  }
}
