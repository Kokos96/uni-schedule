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
  private cachedGroups: Group[] | null = null;
  private cachedFaculties: Faculty[] | null = null;

  public constructor(endpointUrl: string = LNU_TIMETABLE_URL) {
    this.endpointUrl = endpointUrl;
  }

  private get isDirectBrowserToLnu(): boolean {
    return (
      typeof window !== 'undefined' &&
      this.endpointUrl.startsWith('https://dekanat.lnu.edu.ua')
    );
  }

  public async getFaculties(): Promise<Faculty[]> {
    if (this.cachedFaculties) return this.cachedFaculties;
    if (this.isDirectBrowserToLnu) {
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
    if (!this.cachedGroups) {
      if (this.isDirectBrowserToLnu) {
        return [];
      }
      let res: Response;
      try {
        res = await fetch(`${this.endpointUrl}?n=701&lev=142`);
      } catch {
        throw new Error(
          'Не вдалося завантажити список груп ЛНУ (можливе обмеження CORS у браузері до запуску серверного проксі на Етапі 3).'
        );
      }
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

    let res: Response;
    try {
      res = await fetch(`${this.endpointUrl}?n=700`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body,
      });
    } catch {
      throw new Error(
        'Не вдалося підключитися до dekanat.lnu.edu.ua напряму з браузера (CORS або відсутній інтернет). Серверний адаптер буде підключено на Етапі 3.'
      );
    }

    if (!res.ok) {
      throw new Error(`Сервер ЛНУ повернув помилку HTTP ${res.status}`);
    }

    const html = decodeCp1251(await res.arrayBuffer());
    return parseLnuScheduleHtml(html, selection, {
      sourceUrl: `${this.endpointUrl}?n=700`,
    });
  }
}
