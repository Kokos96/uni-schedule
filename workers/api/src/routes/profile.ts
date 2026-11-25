import { validateLnuAcademicSelection } from '../../../../src/data/lnuAcademicCatalog';
import { errorResponse, jsonResponse, parseJsonBody } from '../security';
import type { AuthContext, Env } from '../types';

const VALID_ELECTIVES = new Set(['freelance', 'management', 'space', 'both']);
type SourceMode = 'unconfigured' | 'builtin' | 'live' | 'manual';
const VALID_SOURCE_MODES = new Set<SourceMode>(['unconfigured', 'builtin', 'live', 'manual']);

function isValidTimeZone(tz: string): boolean {
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

interface ProfileRow {
  user_id: string;
  university_id: string;
  faculty_id: string | null;
  faculty_name: string | null;
  course: number | null;
  group_id: string;
  group_name: string;
  subgroup: number;
  elective_course: string;
  timezone: string;
  updated_at: string;
  department?: string | null;
  selected_electives?: string | null;
  selected_track?: number | null;
  source_mode: SourceMode;
  revision: number;
}

function parseSelectedElectivesJson(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
    }
  } catch {
    // Ignore malformed legacy value
  }
  return [];
}

export async function handleGetProfile(
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT user_id, university_id, faculty_id, faculty_name, course,
            group_id, group_name, subgroup, elective_course, timezone, updated_at,
            department, selected_electives, selected_track, source_mode, revision
     FROM student_profiles
     WHERE user_id = ?`
  )
    .bind(auth.userId)
    .first<ProfileRow>();

  if (!row) {
    return errorResponse('NOT_FOUND', 'Профіль користувача не знайдено', 404, corsHeaders);
  }

  return jsonResponse(
    {
      profile: {
        userId: row.user_id,
        universityId: row.university_id,
        facultyId: row.faculty_id ?? undefined,
        facultyName: row.faculty_name ?? undefined,
        course: row.course ?? undefined,
        groupId: row.group_id,
        groupName: row.group_name,
        subgroup: row.subgroup === 2 ? 2 : 1,
        electiveCourse: row.elective_course,
        ...(row.department ? { department: row.department } : {}),
        selectedElectives: parseSelectedElectivesJson(row.selected_electives),
        sourceMode: row.source_mode,
        revision: row.revision,
        ...(row.selected_track !== null && row.selected_track !== undefined
          ? { selectedTrack: row.selected_track }
          : {}),
        timezone: row.timezone,
        updatedAt: row.updated_at,
      },
    },
    200,
    corsHeaders,
    { 'Cache-Control': 'no-store' }
  );
}

export async function handleUpdateProfile(
  request: Request,
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const parsed = await parseJsonBody<Record<string, unknown>>(request);
  if (!parsed.ok) {
    return errorResponse('BAD_REQUEST', parsed.message, 400, corsHeaders);
  }

  const body = parsed.data;
  const sourceMode = body.sourceMode === undefined
    ? 'live' // Compatibility for pre-hotfix clients that only send a live group.
    : typeof body.sourceMode === 'string' && VALID_SOURCE_MODES.has(body.sourceMode as SourceMode)
      ? body.sourceMode as SourceMode
      : null;
  if (!sourceMode) {
    return errorResponse('VALIDATION_ERROR', 'Некоректний режим розкладу', 400, corsHeaders);
  }
  const isGroupSource = sourceMode === 'live' || sourceMode === 'manual';
  const universityId = isGroupSource
    ? (typeof body.universityId === 'string' ? body.universityId.trim() : '')
    : 'lnu';
  const groupId = isGroupSource
    ? (typeof body.groupId === 'string' ? body.groupId.trim() : '')
    : `__${sourceMode}__`;
  const groupName = isGroupSource
    ? (typeof body.groupName === 'string' ? body.groupName.trim() : '')
    : sourceMode === 'builtin' ? 'Вбудований ФЕП-33с' : '';

  if (!universityId || universityId.length > 32) {
    return errorResponse('VALIDATION_ERROR', 'Некоректний universityId', 400, corsHeaders);
  }
  if (!groupId || groupId.length > 64 || (isGroupSource && !groupName) || groupName.length > 64) {
    return errorResponse('VALIDATION_ERROR', 'Некоректна назва групи', 400, corsHeaders);
  }

  const uniExists = await env.DB.prepare(
    `SELECT id FROM universities WHERE id = ? LIMIT 1`
  )
    .bind(universityId)
    .first<{ id: string }>();

  if (!uniExists) {
    return errorResponse('VALIDATION_ERROR', 'Невідомий університет', 400, corsHeaders);
  }

  let facultyId: string | null = null;
  if (body.facultyId !== undefined && body.facultyId !== null) {
    if (typeof body.facultyId !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'Некоректний facultyId', 400, corsHeaders);
    }
    const trimmed = body.facultyId.trim();
    if (!trimmed || trimmed.length > 32) {
      return errorResponse('VALIDATION_ERROR', 'Некоректний facultyId', 400, corsHeaders);
    }
    facultyId = trimmed;
  }

  let facultyName: string | null = null;
  if (body.facultyName !== undefined && body.facultyName !== null) {
    if (typeof body.facultyName !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'Некоректна назва факультету', 400, corsHeaders);
    }
    const trimmed = body.facultyName.trim();
    if (!trimmed || trimmed.length > 160) {
      return errorResponse('VALIDATION_ERROR', 'Некоректна назва факультету', 400, corsHeaders);
    }
    facultyName = trimmed;
  }

  if (sourceMode === 'live' && universityId === 'lnu' && facultyId) {
    const academicCheck = validateLnuAcademicSelection({
      groupName: groupName || groupId,
      facultyId,
    });
    if (!academicCheck.ok) {
      return errorResponse('ACADEMIC_MISMATCH', academicCheck.reason, 400, corsHeaders);
    }
  }

  let course: number | null = null;
  if (body.course !== undefined && body.course !== null) {
    if (
      typeof body.course !== 'number' ||
      !Number.isInteger(body.course) ||
      body.course < 1 ||
      body.course > 6
    ) {
      return errorResponse('VALIDATION_ERROR', 'Курс має бути від 1 до 6', 400, corsHeaders);
    }
    course = body.course;
  }

  let subgroup: 1 | 2 = 1;
  if (body.subgroup !== undefined) {
    if (body.subgroup !== 1 && body.subgroup !== 2) {
      return errorResponse('VALIDATION_ERROR', 'Підгрупа має бути 1 або 2', 400, corsHeaders);
    }
    subgroup = body.subgroup;
  }

  let electiveCourse = 'freelance';
  if (body.electiveCourse !== undefined) {
    if (
      typeof body.electiveCourse !== 'string' ||
      !VALID_ELECTIVES.has(body.electiveCourse)
    ) {
      return errorResponse(
        'VALIDATION_ERROR',
        'Некоректна вибіркова дисципліна',
        400,
        corsHeaders
      );
    }
    electiveCourse = body.electiveCourse;
  }

  let timezone = 'Europe/Kyiv';
  if (body.timezone !== undefined) {
    if (typeof body.timezone !== 'string') {
      return errorResponse('VALIDATION_ERROR', 'Некоректний часовий пояс (IANA)', 400, corsHeaders);
    }
    const trimmedTz = body.timezone.trim();
    if (!trimmedTz || trimmedTz.length > 64 || !isValidTimeZone(trimmedTz)) {
      return errorResponse('VALIDATION_ERROR', 'Некоректний часовий пояс (IANA)', 400, corsHeaders);
    }
    timezone = trimmedTz;
  }

  let department: string | null = null;
  if (body.department !== undefined && body.department !== null) {
    if (typeof body.department !== 'string' || body.department.trim().length > 32) {
      return errorResponse('VALIDATION_ERROR', 'Некоректна кафедра', 400, corsHeaders);
    }
    department = body.department.trim() || null;
  }

  let selectedElectives: string[] = [];
  if (body.selectedElectives !== undefined && body.selectedElectives !== null) {
    if (!Array.isArray(body.selectedElectives) || body.selectedElectives.length > 50) {
      return errorResponse('VALIDATION_ERROR', 'Некоректний список ДВВС', 400, corsHeaders);
    }
    for (const item of body.selectedElectives) {
      if (typeof item !== 'string' || !item.trim() || item.length > 64) {
        return errorResponse('VALIDATION_ERROR', 'Некоректний ідентифікатор ДВВС', 400, corsHeaders);
      }
      selectedElectives.push(item.trim());
    }
    selectedElectives = Array.from(new Set(selectedElectives));
  }

  let selectedTrack: number | null = null;
  if (body.selectedTrack !== undefined && body.selectedTrack !== null) {
    if (
      typeof body.selectedTrack !== 'number' ||
      !Number.isInteger(body.selectedTrack) ||
      body.selectedTrack < 1 ||
      body.selectedTrack > 20
    ) {
      return errorResponse('VALIDATION_ERROR', 'Некоректний номер потоку/профілю', 400, corsHeaders);
    }
    selectedTrack = body.selectedTrack;
  }

  const suppliedRevision = body.expectedRevision;
  const legacyClient = suppliedRevision === undefined && body.sourceMode === undefined;
  if (!legacyClient && (typeof suppliedRevision !== 'number' || !Number.isInteger(suppliedRevision) || suppliedRevision < 0)) {
    return errorResponse('REVISION_REQUIRED', 'Потрібна актуальна версія профілю', 409, corsHeaders);
  }
  const current = await env.DB.prepare(
    `SELECT revision, source_mode FROM student_profiles WHERE user_id = ?`
  ).bind(auth.userId).first<{ revision: number; source_mode: SourceMode }>();
  // Old installed PWAs can still acknowledge and update a live profile. They cannot
  // silently replace a newer client's explicit builtin/manual/unconfigured choice.
  if (legacyClient && current && current.source_mode !== 'live') {
    return jsonResponse({
      error: { code: 'PROFILE_CONFLICT', message: 'Оновіть застосунок для зміни режиму розкладу' },
      revision: current.revision,
    }, 409, corsHeaders);
  }
  const expectedRevision = legacyClient ? (current?.revision ?? 0) : suppliedRevision as number;
  if ((current?.revision ?? 0) !== expectedRevision) {
    return jsonResponse({
      error: { code: 'PROFILE_CONFLICT', message: 'Профіль змінено на іншому пристрої' },
      revision: current?.revision ?? 0,
    }, 409, corsHeaders);
  }

  const now = new Date().toISOString();
  const selectedElectivesJson = JSON.stringify(selectedElectives);
  const updateResult = await env.DB.prepare(
    `INSERT INTO student_profiles (
       user_id, university_id, faculty_id, faculty_name, course,
       group_id, group_name, subgroup, elective_course, timezone, updated_at,
       department, selected_electives, selected_track, source_mode, revision
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
     ON CONFLICT(user_id) DO UPDATE SET
       university_id = excluded.university_id,
       faculty_id = excluded.faculty_id,
       faculty_name = excluded.faculty_name,
       course = excluded.course,
       group_id = excluded.group_id,
       group_name = excluded.group_name,
       subgroup = excluded.subgroup,
       elective_course = excluded.elective_course,
       timezone = excluded.timezone,
       updated_at = excluded.updated_at,
       department = excluded.department,
       selected_electives = excluded.selected_electives,
       selected_track = excluded.selected_track,
       source_mode = excluded.source_mode,
       revision = student_profiles.revision + 1
     WHERE student_profiles.revision = ?`
  )
    .bind(
      auth.userId,
      universityId,
      facultyId,
      facultyName,
      course,
      groupId,
      groupName,
      subgroup,
      electiveCourse,
      timezone,
      now,
      department,
      selectedElectivesJson,
      selectedTrack,
      sourceMode,
      expectedRevision
    )
    .run();

  if (!updateResult.meta.changes) {
    const latest = await env.DB.prepare(`SELECT revision FROM student_profiles WHERE user_id = ?`)
      .bind(auth.userId).first<{ revision: number }>();
    return jsonResponse({
      error: { code: 'PROFILE_CONFLICT', message: 'Профіль змінено під час синхронізації' },
      revision: latest?.revision ?? 0,
    }, 409, corsHeaders);
  }
  return jsonResponse(
    {
      profile: {
        userId: auth.userId,
        universityId,
        facultyId: facultyId ?? undefined,
        facultyName: facultyName ?? undefined,
        course: course ?? undefined,
        groupId,
        groupName,
        subgroup,
        electiveCourse,
        ...(department ? { department } : {}),
        selectedElectives,
        sourceMode,
        revision: expectedRevision + 1,
        ...(selectedTrack !== null ? { selectedTrack } : {}),
        timezone,
        updatedAt: now,
      },
    },
    200,
    corsHeaders,
    { 'Cache-Control': 'no-store' }
  );
}
