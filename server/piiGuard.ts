/**
 * 서버 안전망: 브라우저가 가리지 못한 이메일·전화·주민등록번호 형태가 요청에 남아 있으면 Gemini로 보내지 않고 거부한다.
 * - 이름·주소 등 사용자 지정 값은 서버가 알 수 없어 잡지 못한다(한계). 그 부분은 브라우저의 가림이 담당한다.
 * - 패턴은 `src/utils/piiRedaction.ts`의 일반 패턴과 같아야 한다(tests/server.test.ts가 같은 예시로 확인).
 * - 거부 응답과 로그에는 원문을 싣지 않는다.
 */
const SEP = '[\\s.\\-]?';
const PATTERNS = [
  '[A-Za-z0-9._%+\\-]+@[A-Za-z0-9\\-]+(?:\\.[A-Za-z0-9\\-]+)+',
  '(?<!\\d)\\d{6}-[1-4]\\d{6}(?!\\d)',
  `(?<!\\d)(?:\\+82${SEP}0?1[016789]|01[016789])${SEP}\\d{3,4}${SEP}\\d{4}(?!\\d)`,
  `(?<!\\d)0(?:2|[3-6][1-5])${SEP}\\d{3,4}${SEP}\\d{4}(?!\\d)`,
].map((p) => new RegExp(p, 'u'));

const TOKEN_RE = /\{\{[가-힣]+[A-Z]+\}\}/g;

function hasPii(s: string): boolean {
  const t = s
    .normalize('NFKC')
    .replace(/[​-‍⁠﻿]/g, '')
    .replace(TOKEN_RE, ' ');
  return PATTERNS.some((re) => re.test(t));
}

/** payload 안의 모든 문자열을 검사해 개인정보 형태가 남은 문자열 수를 돌려준다 */
export function countPiiLeaks(value: unknown): number {
  if (typeof value === 'string') return hasPii(value) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + countPiiLeaks(v), 0);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>((n, v) => n + countPiiLeaks(v), 0);
  }
  return 0;
}
