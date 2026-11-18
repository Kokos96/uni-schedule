export interface Env {
  DB: D1Database;
  ALLOWED_ORIGINS?: string;
  TOKEN_PEPPER?: string;
  SCHEDULE_CACHE_TTL_SECONDS?: string;
  GROUPS_CACHE_TTL_SECONDS?: string;
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
