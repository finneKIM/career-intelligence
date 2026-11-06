import { betterAuth } from 'better-auth';
import type { Db } from '../db/types.js';

export const AUTH_BASE_PATH = '/api/account/auth';
export const SESSION_DAYS = 7;

/**
 * 로그인 서비스(Better Auth, 직접 설치) 설정. 7-1 스파이크 결과에 따라:
 * - 이메일 인증 없음(도메인이 없어 메일 발송 불가), 비밀번호 칸에는 브라우저가 파생한 "로그인용 값"(43자)만 온다.
 * - 시도 제한은 서버리스 인스턴스별 메모리가 아니라 DB에 저장한다.
 */
export function createAuth(db: Db, opts: { secret: string; baseURL: string }) {
  return betterAuth({
    database: db as never,
    secret: opts.secret,
    baseURL: opts.baseURL,
    basePath: AUTH_BASE_PATH,
    trustedOrigins: [opts.baseURL],
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
      minPasswordLength: 8,
      maxPasswordLength: 128,
      autoSignIn: true,
    },
    session: { expiresIn: SESSION_DAYS * 24 * 60 * 60 },
    rateLimit: {
      enabled: true,
      storage: 'database',
      window: 60,
      max: 100,
      customRules: {
        '/sign-in/email': { window: 60, max: 5 },
        '/sign-up/email': { window: 600, max: 5 },
      },
    },
    user: { deleteUser: { enabled: true } },
    advanced: { ipAddress: { ipAddressHeaders: ['x-forwarded-for'] } },
  });
}

export type Auth = ReturnType<typeof createAuth>;
