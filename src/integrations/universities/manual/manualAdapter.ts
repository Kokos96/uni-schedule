import type {
  Course,
  Faculty,
  Group,
  NormalizedSchedule,
  StudentSelection,
  UniversityAdapter,
  UniversityMeta,
} from '../types';

/**
 * Honest fallback adapter for universities whose schedule API/source is not yet integrated.
 * Never fabricates automatic schedules; informs the user and preserves manual/local flow.
 */
export class ManualUniversityAdapter implements UniversityAdapter {
  public readonly meta: UniversityMeta = {
    id: 'other',
    name: 'Інший університет (ручний / локальний режим)',
    shortName: 'Інший ВНЗ',
    city: 'Україна',
    supportStatus: 'manual_only',
    capabilities: {
      hasFaculties: false,
      hasPrograms: false,
      hasCourses: false,
      hasGroups: false,
      hasSubgroups: true,
    },
    sourceNote:
      'Автоматичне джерело розкладу для цього університету ще не підключено.',
  };

  public async getFaculties(): Promise<Faculty[]> {
    return [];
  }

  public async getCourses(): Promise<Course[]> {
    return [];
  }

  public async getGroups(): Promise<Group[]> {
    return [];
  }

  public async fetchSchedule(
    _selection: StudentSelection
  ): Promise<NormalizedSchedule> {
    throw new Error(
      'Автоматичне отримання розкладу для обраного університету недоступне. Використовуйте локальний розклад або резервну копію JSON.'
    );
  }
}
