import type { DepartmentType, ElectiveType } from '../types';

export interface DepartmentOption {
  id: DepartmentType;
  label: string;
  sub: string;
}

export interface ElectiveOption {
  id: ElectiveType;
  label: string;
  hint: string;
}

export const DEPARTMENT_OPTIONS: readonly DepartmentOption[] = [
  { id: 'sp', label: 'СП', sub: 'Системне проектування (NoSQL бази)' },
  { id: 'oit', label: 'ОІТ', sub: 'Оптоелектроніка та ІТ (NoSQL бази)' },
  { id: 'rks', label: 'РКС', sub: 'Радіоелектронні та комп. системи (Мова C)' },
  { id: 'rkt', label: 'РКТ', sub: 'Радіофізика та комп. технології (Мова C)' },
];

export const DEPARTMENT_NAMES: Record<DepartmentType, string> = {
  sp: 'СП · Системне проектування',
  oit: 'ОІТ · Оптоелектроніка та ІТ',
  rks: 'РКС · Радіоелектронні системи',
  rkt: 'РКТ · Радіофізика та комп. тех.',
};

export const ELECTIVE_OPTIONS: readonly ElectiveOption[] = [
  { id: 'freelance', label: 'Freelance: робота онлайн', hint: 'Понеділок · вибіркова' },
  { id: 'management', label: 'Інноваційний менеджмент', hint: 'Понеділок · вибіркова' },
  { id: 'space', label: 'Людина і космос', hint: 'Понеділок · вибіркова' },
  { id: 'both', label: 'Показувати всі', hint: 'Відображати всі вибіркові пари' },
];

export const ELECTIVE_NAMES: Record<ElectiveType, string> = {
  freelance: 'Freelance: робота онлайн',
  management: 'Інноваційний менеджмент',
  space: 'Людина і космос',
  both: 'Усі вибіркові',
};
