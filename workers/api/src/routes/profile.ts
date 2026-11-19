import { errorResponse, jsonResponse, parseJsonBody } from '../security';
import type { AuthContext, Env } from '../types';

const VALID_ELECTIVES = new Set(['freelance', 'management', 'space', 'both']);

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
            department, selected_electives, selected_track
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
        ...(row.selected_track !== null && row.selected_track !== undefined
          ? { selectedTrack: row.selected_track }
          : {}),
        timezone: row.timezone,
        updatedAt: row.updated_at,
      },
    },
    200,
    corsHeaders
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
  const universityId =
    typeof body.universityId === 'string' ? body.universityId.trim() : '';
  const groupId = typeof body.groupId === 'string' ? body.groupId.trim() : '';
  const groupName = typeof body.groupName === 'string' ? body.groupName.trim() : '';

  if (!universityId || universityId.length > 32) {
    return errorResponse('VALIDATION_ERROR', 'Некоректний universityId', 400, corsHeaders);
  }
  if (!groupId || groupId.length > 64 || !groupName || groupName.length > 64) {
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

  const now = new Date().toISOString();
  const selectedElectivesJson = JSON.stringify(selectedElectives);
  await env.DB.prepare(
    `INSERT INTO student_profiles (
       user_id, university_id, faculty_id, faculty_name, course,
       group_id, group_name, subgroup, elective_course, timezone, updated_at,
       department, selected_electives, selected_track
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       selected_track = excluded.selected_track`
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
      selectedTrack
    )
    .run();

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
        ...(selectedTrack !== null ? { selectedTrack } : {}),
        timezone,
        updatedAt: now,
      },
    },
    200,
    corsHeaders
  );
}
