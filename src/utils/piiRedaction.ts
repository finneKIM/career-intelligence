/**
 * AI로 보내기 전에 개인정보(연락처·이메일·전화·주민등록번호 형태)를 가리는 순수 함수 모음.
 * - DB·네트워크에 의존하지 않는다(시험 용이).
 * - 가린 자리는 `{{이메일A}}` 같은 토큰(종류 + 알파벳, 숫자 없음)으로 바꾸고, 응답에서 원래 값으로 복원한다.
 *   숫자를 쓰지 않는 이유: 서버의 "새 숫자 도입 검사"(introducesNewNumbers)에 영향을 주지 않기 위해서다.
 * - 한계: 이름의 다른 표기, 학교·회사명 같은 간접 정보는 사용자가 "가림 단어"로 등록해야 가려진다.
 */

export interface RedactionRules {
  name: string;
  email: string;
  phone: string;
  address: string;
  /** 사용자 지정 가림 단어 (학교·이전 회사·영문 이름 표기 등) */
  terms: string[];
}

export interface RedactionResult<T> {
  value: T;
  /** 가린 개수 */
  count: number;
  /** 토큰 → 원래 값 (복원용. 이 객체는 화면 밖으로 내보내지 않는다) */
  mapping: Map<string, string>;
}

/** 재검사에서 가려지지 않은 값이 발견되면 전송을 중단하기 위한 오류. 메시지에 원본 값을 싣지 않는다. */
export class PiiLeakError extends Error {
  constructor(public readonly spots: number) {
    super(`개인정보 가림 검사를 통과하지 못해 전송을 중단했습니다 (${spots}곳). 입력에서 해당 부분을 직접 지우고 다시 시도해 주세요.`);
    this.name = 'PiiLeakError';
  }
}

const PLACEHOLDER_NAME_HINT = '기본 프로필';

// ---------------------------------------------------------------
// 일반 패턴 (연락처를 등록하지 않아도 항상 적용). 모두 선형 시간 패턴이다.
// ---------------------------------------------------------------
const SEP = '[\\s.\\-]?';
const GENERIC: { kind: string; source: string }[] = [
  { kind: '이메일', source: '[A-Za-z0-9._%+\\-]+@[A-Za-z0-9\\-]+(?:\\.[A-Za-z0-9\\-]+)+' },
  { kind: '주민번호', source: '(?<!\\d)\\d{6}-[1-4]\\d{6}(?!\\d)' },
  { kind: '전화', source: `(?<!\\d)(?:\\+82${SEP}0?1[016789]|01[016789])${SEP}\\d{3,4}${SEP}\\d{4}(?!\\d)` },
  { kind: '전화', source: `(?<!\\d)0(?:2|[3-6][1-5])${SEP}\\d{3,4}${SEP}\\d{4}(?!\\d)` },
];

const TOKEN_RE = /\{\{([가-힣]+[A-Z]+)\}\}/g;
/** 원문에 이미 있는 토큰 모양(`{{이메일A}}`)이 우리 토큰과 섞이지 않도록 여는 괄호를 띄운다 */
const FOREIGN_TOKEN_RE = /\{\{(?=[가-힣]+[A-Z]+\}\})/g;

/** 전각→반각(NFKC), 제로폭 문자 제거, 원문 속 토큰 모양 무력화 */
function normalize(s: string): string {
  return s.normalize('NFKC').replace(/[​-‍⁠﻿]/g, '').replace(FOREIGN_TOKEN_RE, '{ {');
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const digitsOf = (s: string) => s.normalize('NFKC').replace(/\D/g, '');

interface Matcher {
  kind: string;
  source: string;
  /** 정렬용(긴 값 우선) */
  weight: number;
}

function userMatchers(rules: RedactionRules): Matcher[] {
  const out: Matcher[] = [];
  const addText = (kind: string, raw: string, min: number) => {
    const t = raw.normalize('NFKC').replace(/[​-‍⁠﻿]/g, '').trim();
    if (t.length < min) return;
    out.push({ kind, source: escapeRe(t).replace(/\s+/g, '\\s+'), weight: t.length });
  };
  addText('이름', rules.name, 2);
  addText('이메일', rules.email, 3);
  addText('주소', rules.address, 2);
  for (const term of rules.terms) addText('가림', term, 1);

  const d = digitsOf(rules.phone);
  if (d.length >= 7) {
    const body = d.split('').join(SEP);
    const intl = d.startsWith('0') ? `|\\+82${SEP}0?${d.slice(1).split('').join(SEP)}` : '';
    out.push({ kind: '전화', source: `(?<!\\d)(?:${body}${intl})(?!\\d)`, weight: 100 });
  }
  return out;
}

interface Compiled {
  all: RegExp;
  classifiers: { kind: string; full: RegExp }[];
}

function compile(rules: RedactionRules): Compiled {
  const user = userMatchers(rules).sort((a, b) => b.weight - a.weight);
  // 일반 패턴을 앞에 둔다: 같은 위치에서는 이메일·전화 전체가 먼저 잡히도록
  const ordered = [...GENERIC.map((g) => ({ ...g, weight: 0 })), ...user];
  return {
    all: new RegExp(ordered.map((m) => `(?:${m.source})`).join('|'), 'giu'),
    classifiers: ordered.map((m) => ({ kind: m.kind, full: new RegExp(`^(?:${m.source})$`, 'iu') })),
  };
}

const letters = (n: number): string => {
  let s = '';
  let i = n;
  do {
    s = String.fromCharCode(65 + (i % 26)) + s;
    i = Math.floor(i / 26) - 1;
  } while (i >= 0);
  return s;
};

function stripTokens(s: string): string {
  return s.replace(TOKEN_RE, ' ');
}

/** 일반 패턴(이메일·전화·주민번호 형태)이 남아 있는지 */
export function findGenericPii(text: string): boolean {
  const t = stripTokens(normalize(text));
  return GENERIC.some((g) => new RegExp(g.source, 'iu').test(t));
}

/** 프로필 필드에서 규칙 생성. 이름이 2글자 미만이거나 기본 자리표시 문구면 이름 규칙에서 제외 */
export function rulesFromProfile(p: {
  name?: string;
  email?: string;
  phone?: string;
  address?: string;
  redactTerms?: string[];
} | null | undefined): RedactionRules {
  const name = (p?.name ?? '').trim();
  return {
    name: name.length < 2 || name.includes(PLACEHOLDER_NAME_HINT) ? '' : name,
    email: p?.email ?? '',
    phone: p?.phone ?? '',
    address: p?.address ?? '',
    terms: (p?.redactTerms ?? []).filter((t) => typeof t === 'string'),
  };
}

function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, mapStrings(v, fn)]));
  }
  return value;
}

function someString(value: unknown, test: (s: string) => boolean): number {
  if (typeof value === 'string') return test(value) ? 1 : 0;
  if (Array.isArray(value)) return value.reduce<number>((n, v) => n + someString(v, test), 0);
  if (value && typeof value === 'object') {
    return Object.values(value as Record<string, unknown>).reduce<number>((n, v) => n + someString(v, test), 0);
  }
  return 0;
}

/**
 * 값 안의 모든 문자열에서 개인정보를 토큰으로 바꾼다(키·숫자·불리언·null은 그대로).
 * 가린 뒤 다시 검사해 남은 값이 있으면 PiiLeakError.
 */
export function redactDeep<T>(value: T, rules: RedactionRules): RedactionResult<T> {
  const compiled = compile(rules);
  const mapping = new Map<string, string>();
  const keyToToken = new Map<string, string>();
  const perKind = new Map<string, number>();
  let count = 0;

  const classify = (m: string): string =>
    compiled.classifiers.find((c) => c.full.test(m))?.kind ?? '가림';

  const redactString = (raw: string): string =>
    normalize(raw).replace(compiled.all, (m) => {
      const kind = classify(m);
      const norm = kind === '전화' ? digitsOf(m).replace(/^82/, '0') : m.toLowerCase().replace(/\s+/g, ' ');
      const key = `${kind}:${norm}`;
      let token = keyToToken.get(key);
      if (!token) {
        const n = perKind.get(kind) ?? 0;
        perKind.set(kind, n + 1);
        token = `{{${kind}${letters(n)}}}`;
        keyToToken.set(key, token);
        mapping.set(token, m);
      }
      count++;
      return token;
    });

  const out = mapStrings(value, redactString) as T;

  // 재검사: 토큰을 제거한 뒤에도 규칙에 걸리는 값이 있으면 중단
  const residual = someString(out, (s) => new RegExp(compiled.all.source, 'iu').test(stripTokens(s)));
  if (residual > 0) throw new PiiLeakError(residual);

  return { value: out, count, mapping };
}

/** 응답의 토큰을 원래 값으로 복원한다. 모르는 토큰의 개수를 함께 돌려준다. */
export function restoreDeep<T>(value: T, mapping: Map<string, string>): { value: T; unknown: number } {
  let unknown = 0;
  const out = mapStrings(value, (s) =>
    s.replace(TOKEN_RE, (tok) => {
      const original = mapping.get(tok);
      if (original === undefined) {
        unknown++;
        return tok;
      }
      return original;
    }),
  ) as T;
  return { value: out, unknown };
}
