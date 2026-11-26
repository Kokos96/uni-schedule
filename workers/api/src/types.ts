export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  TOKEN_PEPPER?: string;
  REQUIRE_TOKEN_PEPPER?: string;
  SCHEDULE_CACHE_TTL_SECONDS?: string;
  GROUPS_CACHE_TTL_SECONDS?: string;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
  RELEASE_ADMIN_TOKEN?: string;
}

export interface AuthContext {
  userId: string;
  deviceId: string;
}

export interface ErrorResponseBody {
  error: {
    code: string;
    message: string;
  };
}
