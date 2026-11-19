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

function decodeHtmlEntities(text: string): string {
  return text
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
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

function extractSpanText(blockHtml: string, className: string): string {
  const re = new RegExp(
    `<span[^>]*class=["'][^"']*\\b${className}\\b[^"']*["'][^>]*>([\\s\\S]*?)<\\/span>`,
    'i'
  );
  const match = blockHtml.match(re);
  return match?.[1] ? stripTags(match[1]) : '';
}

function parseSubgroupFromGroupLabel(label: string): {
  subgroup?: 1 | 2;
  isElective?: boolean;
} {
  const lower = label.toLowerCase();
  let subgroup: 1 | 2 | undefined;
  if (/підгр\.\s*1\b/.test(lower)) subgroup = 1;
  else if (/підгр\.\s*2\b/.test(lower)) subgroup = 2;

  const isElective =
    lower.includes('збірна') ||
    lower.includes('дввс') ||
    lower.includes('вибірков')
      ? true
      : undefined;

  return { subgroup, isElective };
}

function parseTrackNumberFromSubject(subject: string): number | undefined {
  const match = subject.match(/^(\d+)\.\s+\S/);
  if (!match?.[1]) return undefined;
  const num = Number.parseInt(match[1], 10);
  return Number.isFinite(num) && num >= 1 && num <= 20 ? num : undefined;
}

function parseDdMmYyyyToIso(rawDate: string): string | null {
  const match = rawDate.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  if (!match) return null;
  const [, dd, mm, yyyy] = match;
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Parses LNU `timetable.cgi?n=700` schedule HTML into `NormalizedSchedule`.
 * Pure TS implementation (no DOM/BeautifulSoup required).
 * Technical reference for LNU DOM classes: frankov-dev/CrutchShed.
 */
export function parseLnuScheduleHtml(
  html: string,
  selection: Pick<StudentSelection, 'groupId' | 'groupName' | 'facultyId'>,
  options?: { fetchedAt?: string; sourceUrl?: string }
): NormalizedSchedule {
  const warnings: string[] = [];
  const lessons: ScheduleLesson[] = [];
  const fetchedAt = options?.fetchedAt ?? new Date().toISOString();

  if (!html || !html.includes('<')) {
    throw new Error('Сервер ЛНУ повернув порожню або не-HTML відповідь');
  }

  // Match either <h4>DD.MM.YYYY...</h4> or <tr>...</tr> in document order
  const tokenRe = /<h4\b[^>]*>([\s\S]*?)<\/h4>|<tr\b[^>]*>([\s\S]*?)<\/tr>/gi;
  let currentIsoDate: string | null = null;
  let foundAnyDateHeader = false;
  let token: RegExpExecArray | null;

  while ((token = tokenRe.exec(html)) !== null) {
    if (token[1] !== undefined) {
      const headerText = stripTags(token[1]);
      const dateMatch = headerText.match(/(\d{2}\.\d{2}\.\d{4})/);
      if (dateMatch?.[1]) {
        const iso = parseDdMmYyyyToIso(dateMatch[1]);
        if (iso) {
          currentIsoDate = iso;
          foundAnyDateHeader = true;
        }
      }
      continue;
    }

    if (token[2] !== undefined && currentIsoDate) {
      const rowHtml = token[2];
      const tdMatches = Array.from(
        rowHtml.matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)
      );
      if (tdMatches.length !== 3) continue;

      const pairNumRaw = stripTags(tdMatches[0]?.[1] ?? '');
      const pairNumber = Number.parseInt(pairNumRaw, 10);
      if (!Number.isFinite(pairNumber) || pairNumber < 1 || pairNumber > 12) {
        continue;
      }

      const timeCellHtml = tdMatches[1]?.[1] ?? '';
      const timeMatches = stripTags(timeCellHtml).match(/\d{2}:\d{2}/g);
      if (!timeMatches || timeMatches.length < 2) continue;
      const startTime = timeMatches[0]!;
      const endTime = timeMatches[1]!;

      const detailsHtml = tdMatches[2]?.[1] ?? '';
      if (!detailsHtml.includes('p_name')) continue;

      // Split cell by `.p_name` occurrence so missing optional spans in one entry
      // never misalign fields of subsequent entries in the same time slot.
      const pNameStarts = Array.from(
        detailsHtml.matchAll(/<span[^>]*class=["'][^"']*\bp_name\b[^"']*["'][^>]*>/gi)
      ).map((m) => m.index ?? 0);

      for (let i = 0; i < pNameStarts.length; i += 1) {
        const startIdx = pNameStarts[i]!;
        const endIdx =
          i + 1 < pNameStarts.length ? pNameStarts[i + 1]! : detailsHtml.length;
        const blockHtml = detailsHtml.slice(startIdx, endIdx);

        const subject = extractSpanText(blockHtml, 'p_name');
        if (!subject) continue;

        const lessonType = extractSpanText(blockHtml, 'p_type_name') || 'Л';
        const teacher = extractSpanText(blockHtml, 't_name') || undefined;
        const groupLabel = extractSpanText(blockHtml, 'gr2_name');
        const rawRoom = extractSpanText(blockHtml, 'room_name');
        const roomInfo = rawRoom ? parseRoomCodeAndBuilding(rawRoom) : undefined;
        const { subgroup, isElective } = parseSubgroupFromGroupLabel(groupLabel);
        const trackNumber = parseTrackNumberFromSubject(subject);
        const electiveKey = isElective ? `el_${stableSlug(subject)}` : undefined;
        const dayOfWeek = extractDayOfWeekFromIso(currentIsoDate);

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
          ...(trackNumber !== undefined ? { trackNumber } : {}),
          status: 'active',
          universityId: 'lnu',
          updatedAt: fetchedAt,
        });
      }
    }
  }

  if (!foundAnyDateHeader) {
    warnings.push(
      'У відповіді ЛНУ не знайдено дат розкладу. Можливо, група не має занять на обраний період або змінилася структура сторінки.'
    );
  }

  return {
    universityId: 'lnu',
    universityName: 'ЛНУ ім. Івана Франка',
    ...(selection.facultyId ? { facultyId: selection.facultyId } : {}),
    groupId: selection.groupId,
    groupName: selection.groupName,
    fetchedAt,
    sourceUrl: options?.sourceUrl,
    lessons,
    warnings,
  };
}
