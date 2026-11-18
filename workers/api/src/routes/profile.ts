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
}

export async function handleGetProfile(
  auth: AuthContext,
  env: Env,
  corsHeaders: Record<string, string>
): Promise<Response> {
  const row = await env.DB.prepare(
    `SELECT user_id, university_id, faculty_id, faculty_name, course,
            group_id, group_name, subgroup, elective_course, timezone, updated_at
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

  const facultyId =
    typeof body.facultyId === 'string' && body.facultyId.trim()
      ? body.facultyId.trim().slice(0, 32)
      : null;
  const facultyName =
    typeof body.facultyName === 'string' && body.facultyName.trim()
      ? body.facultyName.trim().slice(0, 160)
      : null;

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

  const subgroup = body.subgroup === 2 ? 2 : 1;
  const electiveCourse =
    typeof body.electiveCourse === 'string' && VALID_ELECTIVES.has(body.electiveCourse)
      ? body.electiveCourse
      : 'freelance';

  const timezone =
    typeof body.timezone === 'string' && body.timezone.trim()
      ? body.timezone.trim().slice(0, 64)
      : 'Europe/Kyiv';
  if (!isValidTimeZone(timezone)) {
    return errorResponse('VALIDATION_ERROR', 'Некоректний часовий пояс (IANA)', 400, corsHeaders);
  }

  const now = new Date().toISOString();
  await env.DB.prepare(
    `INSERT INTO student_profiles (
       user_id, university_id, faculty_id, faculty_name, course,
       group_id, group_name, subgroup, elective_course, timezone, updated_at
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
       updated_at = excluded.updated_at`
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
      now
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
        timezone,
        updatedAt: now,
      },
    },
    200,
    corsHeaders
  );
}
