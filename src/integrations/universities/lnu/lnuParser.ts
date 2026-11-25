import type {
  Faculty,
  Group,
  NormalizedSchedule,
  ScheduleLesson,
  StudentSelection,
} from '../types';
import {
  buildStableLessonId,
  extractDayOfWeekFromIso,
  parseRoomCodeAndBuilding,
  stableSlug,
} from '../normalizers/scheduleNormalizer';
import { elementText, hasClass, parseHtmlStructure, walkElements, type HtmlElement } from './htmlStructure';

const LATIN_TO_CYRILLIC_MAP: Record<string, string> = {
  a: 'а', b: 'в', c: 'с', e: 'е', h: 'н', i: 'і', k: 'к', m: 'м',
  o: 'о', p: 'р', t: 'т', x: 'х', y: 'у',
};

export function normalizeGroupHomoglyphs(input: string): string {
  return input
    .trim()
    .toLocaleLowerCase('uk-UA')
    .replace(/[abcehikmoptxy]/g, (ch) => LATIN_TO_CYRILLIC_MAP[ch] ?? ch)
    .replace(/\s+/g, '');
}

const MANDATORY_COMBINED_SUBJECT_RE =
  /^(?:(?:перша|друга|третя)\s+іноземна\s+мова|іноземна\s+мова|фізичн[ае]\s+виховання)(?:\s|$|[.,(])/i;

function isValidTimePair(start: string, end: string): boolean {
  const parse = (s: string) => {
    const [h, m] = s.split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m) || h < 0 || h > 23 || m < 0 || m > 59) return -1;
    return h * 60 + m;
  };
  const s = parse(start);
  const e = parse(end);
  return s >= 0 && e > s;
}

function isValidEmptyLnuPage(html: string): boolean {
  return (
    /name=["']?faculty["']?/i.test(html) ||
    /setVedP/i.test(html) ||
    /за\s+обраний\s+період\s+занять\s+не\s+знайдено/i.test(html)
  );
}

const NAMED_ENTITIES: Record<string, string> = {
  nbsp: ' ',
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
};

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&(?:(nbsp|amp|lt|gt|quot|apos)|#(?:x([\da-f]+)|(\d+)));/gi, (match, named, hex, dec) => {
      if (named) {
        return NAMED_ENTITIES[named.toLowerCase()] ?? match;
      }
      const code = Number.parseInt(hex ?? dec, hex ? 16 : 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) {
        return '\ufffd';
      }
      return code === 160 ? ' ' : String.fromCodePoint(code);
    })
    .replace(/\u00a0/g, ' ');
}

function stripTags(html: string): string {
  return decodeHtmlEntities(html.replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extracts `<option value="...">Name</option>` from LNU `<select name="faculty">`.
 */
export function parseLnuFacultiesHtml(html: string): Faculty[] {
  const selectMatch = html.match(
    /<select[^>]*\bname=["']?faculty["']?[^>]*>([\s\S]*?)<\/select>/i
  );
  if (!selectMatch?.[1]) return [];

  const faculties: Faculty[] = [];
  const optionRe = /<option[^>]*\bvalue=["']?(\d+)["']?[^>]*>([\s\S]*?)<\/option>/gi;
  let m: RegExpExecArray | null;
  while ((m = optionRe.exec(selectMatch[1])) !== null) {
    const id = m[1]?.trim();
    const name = stripTags(m[2] ?? '');
    if (id && id !== '0' && name) {
      faculties.push({ id, name });
    }
  }
  return faculties;
}

/**
 * Infers course number (1..6) from standard LNU group naming (e.g. `ФЕП-33с` -> 3).
 */
export function inferCourseFromGroupName(groupName: string): number | undefined {
  const match = groupName.match(/-(\d)/);
  if (!match?.[1]) return undefined;
  const num = Number(match[1]);
  return num >= 1 && num <= 6 ? num : undefined;
}

/**
 * Parses JSON returned by `timetable.cgi?n=701&lev=142`.
 */
export function parseLnuGroupsJson(rawJson: string): Group[] {
  const parsed = JSON.parse(rawJson) as { suggestions?: unknown };
  if (!Array.isArray(parsed.suggestions)) {
    throw new Error('Некоректний формат списку груп ЛНУ (відсутнє поле suggestions)');
  }

  const seen = new Set<string>();
  const groups: Group[] = [];
  for (const item of parsed.suggestions) {
    if (typeof item !== 'string') continue;
    const name = item.trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    groups.push({
      id: name,
      name,
      course: inferCourseFromGroupName(name),
    });
  }
  return groups;
}

function spansIn(node: HtmlElement): HtmlElement[] {
  const spans: HtmlElement[] = [];
  walkElements(node, (element) => { if (element.tag === 'span') spans.push(element); });
  return spans;
}

function spanText(spans: HtmlElement[], className: string): string {
  return spans.filter((span) => hasClass(span, className))
    .map((span) => decodeHtmlEntities(elementText(span)).replace(/\s+/g, ' ').trim())
    .filter(Boolean).join(', ');
}

function parseSubgroupFromGroupLabel(label: string, subject = ''): {
  subgroup?: 1 | 2;
  isElective?: boolean;
} {
  const lower = label.toLowerCase();
  let subgroup: 1 | 2 | undefined;
  if (/підгр\.\s*1\b/.test(lower)) subgroup = 1;
  else if (/підгр\.\s*2\b/.test(lower)) subgroup = 2;

  const explicitElective =
    lower.includes('дввс') ||
    lower.includes('вибірков') ||
    /\bвиб\./.test(lower);
  const combinedElective =
    lower.includes('збірна') && !MANDATORY_COMBINED_SUBJECT_RE.test(subject.trim());
  const isElective = explicitElective || combinedElective ? true : undefined;

  return { subgroup, isElective };
}

function parseDdMmYyyyToIso(rawDate: string): string | null {
  const match = rawDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  const iso = `${yyyy}-${mm}-${dd}`;
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso ? null : iso;
}

/**
 * Parses LNU `timetable.cgi?n=700` schedule HTML into `NormalizedSchedule`.
 * Pure TS implementation (no DOM/BeautifulSoup required).
 * Technical reference for LNU DOM classes: frankov-dev/CrutchShed.
 */
export function parseLnuScheduleHtml(
  html: string,
  selection: Pick<StudentSelection, 'groupId' | 'groupName' | 'facultyId'>,
  options?: { fetchedAt?: string; sourceUrl?: string; coveredFrom?: string; coveredTo?: string }
): NormalizedSchedule {
  const warnings: string[] = [];
  const lessons: ScheduleLesson[] = [];
  const fetchedAt = options?.fetchedAt ?? new Date().toISOString();

  if (!html || !html.includes('<')) {
    throw new Error('Сервер ЛНУ повернув порожню або не-HTML відповідь');
  }

  const document = parseHtmlStructure(html);
  let currentIsoDate: string | null = null;
  let foundAnyDateHeader = false;
  let malformedRows = 0;
  const seen = new Set<string>();

  const visitScheduleNodes = (node: HtmlElement): void => {
    for (const element of node.children) {
      if (typeof element === 'string') continue;
      if (element.tag === 'thead') continue;

      if (element.tag === 'h4') {
        const headerText = decodeHtmlEntities(elementText(element)).trim();
        const isRangeTitle =
          /^розклад\s+(?:групи|викладача|занять)/i.test(headerText) ||
          /\bз\s+\d{2}\.\d{2}\.\d{4}\s+по\s+\d{2}\.\d{2}\.\d{4}\b/i.test(headerText);
        if (isRangeTitle) {
          const groupMatch = headerText.match(/розклад\s+групи\s+([^\s,]+)/i);
          if (groupMatch?.[1] && selection.groupName) {
            const returnedNorm = normalizeGroupHomoglyphs(groupMatch[1]);
            const expectedNorm = normalizeGroupHomoglyphs(selection.groupName);
            if (returnedNorm && expectedNorm && returnedNorm !== expectedNorm) {
              throw new Error(
                `Сервер ЛНУ повернув розклад для іншої групи (${groupMatch[1]}) замість ${selection.groupName}`
              );
            }
          }
        } else {
          const dateMatch = headerText.match(/(\d{2}\.\d{2}\.\d{4})/);
          if (dateMatch?.[1]) {
            const iso = parseDdMmYyyyToIso(dateMatch[1]);
            if (iso) {
              currentIsoDate = iso;
              foundAnyDateHeader = true;
            }
          }
        }
        continue;
      }

      if (element.tag === 'tr' && currentIsoDate) {
        const cells = element.children.filter((child): child is HtmlElement =>
          typeof child !== 'string' && (child.tag === 'td' || child.tag === 'th'));
        if (cells.length < 3 || cells.every((cell) => cell.tag === 'th')) continue;

        const pairNumRaw = decodeHtmlEntities(elementText(cells[0]!));
        const pairNumber = Number.parseInt(pairNumRaw, 10);
        if (!Number.isFinite(pairNumber) || pairNumber < 1 || pairNumber > 12) {
          malformedRows += 1;
          continue;
        }

        const timeMatches = decodeHtmlEntities(elementText(cells[1]!)).match(/\d{2}:\d{2}/g);
        if (!timeMatches || timeMatches.length < 2) { malformedRows += 1; continue; }
        const startTime = timeMatches[0]!;
        const endTime = timeMatches[1]!;
        if (!isValidTimePair(startTime, endTime)) { malformedRows += 1; continue; }

        const detailSpans = cells.slice(2).flatMap(spansIn);
        if (detailSpans.length === 0) continue;
        const blocks: HtmlElement[][] = [];
        for (const span of detailSpans) {
          if (hasClass(span, 'p_name')) blocks.push([]);
          if (blocks.length > 0) blocks[blocks.length - 1]!.push(span);
        }
        if (blocks.length === 0) {
          const wishText = spanText(detailSpans, 'wish_gr_2');
          if (wishText) blocks.push(detailSpans);
        }
        for (const block of blocks) {
          const subject = spanText(block, 'p_name') || spanText(block, 'wish_gr_2');
          if (!subject) { malformedRows += 1; continue; }

          const isWishOnly = !spanText(block, 'p_name');
          const lessonType = spanText(block, 'p_type_name') || (isWishOnly ? 'П' : 'Л');
          const teacher = spanText(block, 't_name') || undefined;
          const groupLabel = spanText(block, 'gr2_name');
          const rawRoom = spanText(block, 'room_name');
          const roomInfo = rawRoom ? parseRoomCodeAndBuilding(rawRoom) : undefined;
          const { subgroup, isElective } = parseSubgroupFromGroupLabel(groupLabel, subject);
          const electiveKey = isElective ? `el_${stableSlug(subject)}` : undefined;
          const dayOfWeek = extractDayOfWeekFromIso(currentIsoDate);
          const blockText = block.map((s) => decodeHtmlEntities(elementText(s))).join(' ').toLowerCase();
          const isCancelled =
            block.some((s) => hasClass(s, 'cancelled') || hasClass(s, 'canceled')) ||
            /\b(?:відмінено|скасовано)\b/i.test(blockText);

          const dedupeKey = [currentIsoDate, pairNumber, subject, lessonType, subgroup, groupLabel, teacher, rawRoom].join('|');
          if (seen.has(dedupeKey)) continue;
          seen.add(dedupeKey);

          lessons.push({
            id: buildStableLessonId({
              universityId: 'lnu',
              groupId: selection.groupId,
              dayOfWeek,
              pairNumber,
              subject,
              subgroup,
            }),
            date: currentIsoDate,
            dayOfWeek,
            number: pairNumber,
            startTime,
            endTime,
            subject,
            lessonType,
            teacher,
            room: roomInfo?.code,
            building: roomInfo?.building,
            group: selection.groupName,
            ...(groupLabel ? { groupLabel } : {}),
            subgroup,
            isElective,
            ...(electiveKey ? { electiveKey } : {}),
            status: isCancelled ? 'cancelled' : 'active',
            universityId: 'lnu',
            updatedAt: fetchedAt,
          });
        }
        continue;
      }

      visitScheduleNodes(element);
    }
  };

  visitScheduleNodes(document);

  if (!foundAnyDateHeader) {
    if (isValidEmptyLnuPage(html)) {
      warnings.push('За обраний період занять за розкладом не знайдено.');
    } else {
      throw new Error('У відповіді ЛНУ не знайдено дат розкладу; структура сторінки невідома');
    }
  }
  if (malformedRows > 0) warnings.push(`Пропущено некоректних рядків розкладу: ${malformedRows}`);

  // Disambiguate parallel sessions deterministically from lesson content so IDs stay stable across weeks.
  const countsByDateId = new Map<string, number>();
  for (const lesson of lessons) {
    const dateKey = `${lesson.date}:${lesson.id}`;
    countsByDateId.set(dateKey, (countsByDateId.get(dateKey) ?? 0) + 1);
  }

  const usedDateIds = new Set<string>();
  let ambiguousIds = 0;
  for (const lesson of lessons) {
    const baseDateKey = `${lesson.date}:${lesson.id}`;
    if ((countsByDateId.get(baseDateKey) ?? 0) <= 1) {
      usedDateIds.add(baseDateKey);
      continue;
    }
    const discriminator = [lesson.lessonType, lesson.groupLabel ?? '', lesson.electiveKey ?? '', lesson.teacher ?? '', lesson.room ?? ''].join('|');
    const suffix = stableSlug(discriminator);
    let candidate = `${lesson.id}_${suffix}`;
    let sequence = 2;
    while (usedDateIds.has(`${lesson.date}:${candidate}`)) {
      candidate = `${lesson.id}_${suffix}_${sequence++}`;
    }
    lesson.id = candidate;
    usedDateIds.add(`${lesson.date}:${candidate}`);
    ambiguousIds += 1;
  }
  if (ambiguousIds > 0) warnings.push(`Розрізнено паралельних занять зі спільним старим ID: ${ambiguousIds}`);

  return {
    universityId: 'lnu',
    universityName: 'ЛНУ ім. Івана Франка',
    ...(selection.facultyId ? { facultyId: selection.facultyId } : {}),
    groupId: selection.groupId,
    groupName: selection.groupName,
    fetchedAt,
    sourceType: 'dated',
    ...(options?.coveredFrom ? { coveredFrom: options.coveredFrom } : {}),
    ...(options?.coveredTo ? { coveredTo: options.coveredTo } : {}),
    sourceUrl: options?.sourceUrl,
    lessons,
    warnings,
  };
}
