import type {
  NotionColumnMappings,
  NotionPropertyMeta,
  NotionSchemaDiscovery,
  Project,
} from '../../types';

/**
 * 노션 동적 스키마 어댑터 (로컬 퍼스트: 외부 서버·토큰 없이 동작)
 *
 * 브라우저에서 노션 API를 직접 호출하면 CORS로 차단되므로, 사용자가 가져온
 * 데이터(노션 CSV 내보내기 / 노션 API 응답 JSON / 단순 JSON 배열)를 입력으로 받아
 *  1) 컬럼(스키마)을 자동 감지하고
 *  2) 컬럼명·타입 기반으로 1:1 매핑을 추천하며
 *  3) 매핑 규칙대로 Project로 변환한다.
 */

/** 정규화된 행: 컬럼명 → 값 목록 (단일 값도 길이 1 배열) */
export type NormalizedRow = Record<string, string[]>;

export interface ParsedSource {
  schema: NotionSchemaDiscovery;
  rows: NormalizedRow[];
}

export type SourceParseResult = { ok: true; data: ParsedSource } | { ok: false; error: string };

// ---------------------------------------------------------------
// CSV
// ---------------------------------------------------------------

/** 따옴표/개행/이스케이프("")를 지원하는 RFC4180 방식 CSV 파서 */
export function parseCsv(text: string): string[][] {
  const src = text.replace(/^﻿/, '');
  const out: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (inQuotes) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && src[i + 1] === '\n') i++;
      row.push(cell);
      cell = '';
      out.push(row);
      row = [];
    } else {
      cell += ch;
    }
  }
  if (cell !== '' || row.length > 0) {
    row.push(cell);
    out.push(row);
  }
  return out.filter((r) => r.some((c) => c.trim() !== ''));
}

// ---------------------------------------------------------------
// 값 분리 / 타입 추론
// ---------------------------------------------------------------

export function splitMulti(value: string): string[] {
  return value
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

const URL_RE = /^https?:\/\/\S+$/i;
const DATE_RE = /^\d{4}[-./]\d{1,2}([-./]\d{1,2})?(\s*(→|~|-|–|to)\s*\d{4}[-./]\d{1,2}([-./]\d{1,2})?)?$/;

/** 컬럼 값들로부터 노션 속성 타입을 추정 */
export function inferType(values: string[][]): string {
  const flat = values.flat().filter((v) => v.trim() !== '');
  if (flat.length === 0) return 'rich_text';
  if (flat.every((v) => URL_RE.test(v))) return 'url';
  if (flat.every((v) => DATE_RE.test(v.trim()))) return 'date';
  const multi = values.filter((v) => v.length > 1).length;
  if (multi > 0) return 'multi_select';
  const commaItems = flat.filter((v) => v.includes(','));
  if (commaItems.length > 0 && commaItems.every((v) => splitMulti(v).every((x) => x.length <= 25))) {
    return 'multi_select';
  }
  const avgLen = flat.reduce((s, v) => s + v.length, 0) / flat.length;
  const distinct = new Set(flat).size;
  if (avgLen <= 20 && distinct <= Math.max(3, Math.floor(flat.length / 2))) return 'select';
  return 'rich_text';
}

// ---------------------------------------------------------------
// 소스별 파서
// ---------------------------------------------------------------

/** 개행만 구분 (문장형 값용 — 쉼표 보존) */
export function splitLines(value: string): string[] {
  return value
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function parseCsvSource(text: string, title = 'CSV'): SourceParseResult {
  const table = parseCsv(text);
  if (table.length < 1) return { ok: false, error: '비어 있는 CSV입니다.' };
  const headers = table[0].map((h) => h.trim());
  if (headers.some((h) => h === '')) return { ok: false, error: 'CSV 첫 줄(헤더)에 이름 없는 컬럼이 있습니다.' };
  if (new Set(headers).size !== headers.length) return { ok: false, error: 'CSV 헤더에 중복된 컬럼명이 있습니다.' };

  const rows: NormalizedRow[] = table.slice(1).map((cells) => {
    const r: NormalizedRow = {};
    headers.forEach((h, i) => {
      r[h] = splitLines(cells[i] ?? '');
    });
    return r;
  });
  return { ok: true, data: { schema: buildSchema(title, '', headers, rows), rows } };
}

/** 노션 속성 값 객체 → 문자열 목록 */
export function notionValueToStrings(prop: unknown): string[] {
  if (!prop || typeof prop !== 'object') return [];
  const p = prop as Record<string, unknown>;
  const richText = (arr: unknown): string =>
    Array.isArray(arr) ? arr.map((t) => (t as { plain_text?: string }).plain_text ?? '').join('') : '';

  switch (p.type) {
    case 'title':
      return [richText(p.title)].filter(Boolean);
    case 'rich_text': {
      const s = richText(p.rich_text);
      return s ? s.split('\n').map((x) => x.trim()).filter(Boolean) : [];
    }
    case 'select': {
      const n = (p.select as { name?: string } | null)?.name;
      return n ? [n] : [];
    }
    case 'status': {
      const n = (p.status as { name?: string } | null)?.name;
      return n ? [n] : [];
    }
    case 'multi_select':
      return Array.isArray(p.multi_select) ? (p.multi_select as { name: string }[]).map((o) => o.name) : [];
    case 'date': {
      const d = p.date as { start?: string; end?: string } | null;
      if (!d?.start) return [];
      return [d.end ? `${d.start} → ${d.end}` : d.start];
    }
    case 'url':
      return typeof p.url === 'string' && p.url ? [p.url] : [];
    case 'number':
      return typeof p.number === 'number' ? [String(p.number)] : [];
    case 'checkbox':
      return [p.checkbox ? 'true' : 'false'];
    default:
      return [];
  }
}

/**
 * 노션 API 응답 JSON 파서.
 *  - 데이터베이스 조회(`GET /databases/{id}`) 응답: properties 메타만 → 빈 행
 *  - 쿼리(`POST /databases/{id}/query`) 응답: results[].properties → 행 + 스키마 추론
 *  - 위 두 응답을 `{ database, query }` 로 합쳐 붙여넣은 경우도 허용
 */
function parseNotionApiJson(obj: Record<string, unknown>): SourceParseResult | null {
  const database = (obj.database ?? (obj.object === 'database' ? obj : null)) as Record<string, unknown> | null;
  const query = (obj.query ?? (obj.object === 'list' ? obj : null)) as Record<string, unknown> | null;

  const results = Array.isArray(query?.results) ? (query!.results as Record<string, unknown>[]) : [];
  const dbProps = database?.properties as Record<string, { id?: string; type?: string }> | undefined;

  const firstProps = (results[0]?.properties ?? undefined) as Record<string, { id?: string; type?: string }> | undefined;
  const propMap = dbProps ?? firstProps;
  if (!propMap) return null;

  const properties: NotionPropertyMeta[] = Object.entries(propMap).map(([name, meta]) => ({
    id: meta.id ?? name,
    name,
    type: meta.type ?? 'rich_text',
  }));

  const rows: NormalizedRow[] = results.map((page) => {
    const r: NormalizedRow = {};
    const props = (page.properties ?? {}) as Record<string, unknown>;
    for (const p of properties) r[p.name] = notionValueToStrings(props[p.name]);
    return r;
  });

  const titleArr = database?.title;
  const databaseTitle = Array.isArray(titleArr)
    ? titleArr.map((t) => (t as { plain_text?: string }).plain_text ?? '').join('') || 'Notion Database'
    : 'Notion Database';

  return {
    ok: true,
    data: {
      schema: { databaseId: String(database?.id ?? ''), databaseTitle, properties },
      rows,
    },
  };
}

/** 단순 JSON 배열(`[{컬럼: 값}, ...]`) 파서 */
function parsePlainJsonArray(arr: unknown[]): SourceParseResult {
  if (arr.length === 0) return { ok: false, error: '비어 있는 JSON 배열입니다.' };
  const headers: string[] = [];
  for (const item of arr) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) {
      return { ok: false, error: 'JSON 배열의 각 항목은 객체여야 합니다.' };
    }
    for (const k of Object.keys(item)) if (!headers.includes(k)) headers.push(k);
  }
  const rows: NormalizedRow[] = (arr as Record<string, unknown>[]).map((item) => {
    const r: NormalizedRow = {};
    for (const h of headers) {
      const v = item[h];
      if (Array.isArray(v)) r[h] = v.map((x) => String(x).trim()).filter(Boolean);
      else if (v === null || v === undefined) r[h] = [];
      else r[h] = splitLines(String(v));
    }
    return r;
  });
  return { ok: true, data: { schema: buildSchema('JSON', '', headers, rows), rows } };
}

export function parseJsonSource(text: string): SourceParseResult {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, error: '올바른 JSON이 아닙니다.' };
  }
  if (Array.isArray(raw)) return parsePlainJsonArray(raw);
  if (raw && typeof raw === 'object') {
    const api = parseNotionApiJson(raw as Record<string, unknown>);
    if (api) return api;
  }
  return { ok: false, error: '노션 API 응답 또는 객체 배열 형식이 아닙니다.' };
}

/** 입력 텍스트의 형식(JSON/CSV)을 자동 판별하여 파싱 */
export function parseSource(text: string): SourceParseResult {
  const t = text.trim();
  if (!t) return { ok: false, error: '입력된 내용이 없습니다.' };
  return t.startsWith('{') || t.startsWith('[') ? parseJsonSource(t) : parseCsvSource(t);
}

function buildSchema(title: string, databaseId: string, headers: string[], rows: NormalizedRow[]): NotionSchemaDiscovery {
  return {
    databaseId,
    databaseTitle: title,
    properties: headers.map((h, i) => ({
      id: `col-${i}`,
      name: h,
      type: i === 0 && rows.every((r) => r[h]?.length === 1) ? 'title' : inferType(rows.map((r) => r[h] ?? [])),
    })),
  };
}

// ---------------------------------------------------------------
// 매핑 추천
// ---------------------------------------------------------------

type MappingKey = keyof NotionColumnMappings;

const KEYWORDS: Record<MappingKey, string[]> = {
  title: ['프로젝트명', '프로젝트', '제목', '이름', 'title', 'name', 'project'],
  techStack: ['기술', '스택', '사용기술', 'tech', 'stack', 'skill', 'tools'],
  period: ['기간', '진행기간', '날짜', 'period', 'date', 'duration'],
  outcomes: ['성과', '결과', '기여', '내용', 'outcome', 'result', 'impact', 'achievement'],
  role: ['역할', '담당', '포지션', 'role', 'position'],
  links: ['링크', '주소', 'url', 'link', 'github', 'demo'],
};

const PREFERRED_TYPES: Record<MappingKey, string[]> = {
  title: ['title'],
  techStack: ['multi_select', 'select'],
  period: ['date'],
  outcomes: ['rich_text'],
  role: ['select', 'rich_text'],
  links: ['url'],
};

/** 컬럼명 키워드(가중 2) + 타입 일치(가중 1)로 가장 그럴듯한 컬럼을 하나씩 배정. 한 컬럼은 한 필드에만 사용. */
export function suggestMappings(properties: NotionPropertyMeta[]): NotionColumnMappings {
  const order: MappingKey[] = ['title', 'period', 'links', 'techStack', 'role', 'outcomes'];
  const used = new Set<string>();
  const result: Partial<Record<MappingKey, string>> = {};

  for (const key of order) {
    let best: { name: string; score: number } | null = null;
    for (const p of properties) {
      if (used.has(p.name)) continue;
      const lname = p.name.toLowerCase();
      let score = 0;
      if (KEYWORDS[key].some((k) => lname.includes(k.toLowerCase()))) score += 2;
      if (PREFERRED_TYPES[key].includes(p.type)) score += 1;
      // 키워드 일치 없이 타입만 맞는 경우: title/period/links처럼 타입이 결정적인 필드에서만 인정
      if (score === 1 && !['title', 'period', 'links'].includes(key)) score = 0;
      if (score > 0 && (!best || score > best.score)) best = { name: p.name, score };
    }
    if (best) {
      result[key] = best.name;
      used.add(best.name);
    }
  }

  return {
    title: result.title ?? '',
    techStack: result.techStack ?? '',
    period: result.period ?? '',
    outcomes: result.outcomes ?? '',
    role: result.role,
    links: result.links,
  };
}

/** 필수 매핑(title/techStack/period/outcomes) 누락 및 중복 매핑 검증 */
export function validateMappings(m: NotionColumnMappings, properties: NotionPropertyMeta[]): string[] {
  const errors: string[] = [];
  const names = new Set(properties.map((p) => p.name));
  const required: [MappingKey, string][] = [
    ['title', '프로젝트명'],
    ['techStack', '기술 스택'],
    ['period', '기간'],
    ['outcomes', '수행 성과'],
  ];
  for (const [k, label] of required) if (!m[k]) errors.push(`${label} 컬럼을 선택해 주세요.`);

  const chosen = (Object.keys(m) as MappingKey[]).map((k) => m[k]).filter((v): v is string => !!v);
  for (const c of chosen) if (!names.has(c)) errors.push(`'${c}' 컬럼이 데이터에 존재하지 않습니다.`);
  if (new Set(chosen).size !== chosen.length) errors.push('하나의 컬럼이 두 개 이상의 항목에 중복 매핑되었습니다.');
  return errors;
}

// ---------------------------------------------------------------
// 행 → Project 변환
// ---------------------------------------------------------------

/** '2024-03', '2024.3', '2024-03-15' → 'YYYY-MM' */
export function normalizeMonth(s: string): string {
  const m = s.trim().match(/^(\d{4})[-./](\d{1,2})/);
  return m ? `${m[1]}-${m[2].padStart(2, '0')}` : '';
}

export function parsePeriod(values: string[]): Project['period'] {
  const joined = values.join(' ').trim();
  const parts = joined.split(/\s*(?:→|~|–|\bto\b|(?<=\d)\s-\s(?=\d))\s*/);
  const startDate = normalizeMonth(parts[0] ?? '');
  const endDate = parts[1] ? normalizeMonth(parts[1]) : '';
  const ongoing = /현재|진행\s*중|present|ongoing/i.test(joined);
  if (endDate) return { startDate, endDate, isOngoing: false };
  if (ongoing) return { startDate, isOngoing: true };
  // 종료일이 없는 단일 날짜는 단기 프로젝트로 간주 (시작 = 종료)
  return startDate ? { startDate, endDate: startDate, isOngoing: false } : { startDate: '', isOngoing: false };
}

export interface ImportResult {
  projects: Project[];
  skipped: { rowIndex: number; reason: string }[];
}

/**
 * 매핑 규칙대로 행을 Project로 변환.
 * 동일 제목이 `existingTitles`에 있으면 중복으로 건너뛴다(재가져오기 안전).
 */
export function mapRowsToProjects(
  rows: NormalizedRow[],
  mappings: NotionColumnMappings,
  existingTitles: Iterable<string> = [],
  now: Date = new Date(),
  idFactory: () => string = () => crypto.randomUUID(),
): ImportResult {
  const seen = new Set<string>([...existingTitles].map((t) => t.trim().toLowerCase()));
  const projects: Project[] = [];
  const skipped: ImportResult['skipped'] = [];
  const iso = now.toISOString();

  rows.forEach((row, rowIndex) => {
    const title = (row[mappings.title] ?? []).join(' ').trim();
    if (!title) {
      skipped.push({ rowIndex, reason: '프로젝트명이 비어 있음' });
      return;
    }
    const key = title.toLowerCase();
    if (seen.has(key)) {
      skipped.push({ rowIndex, reason: `이미 존재하는 프로젝트: ${title}` });
      return;
    }
    seen.add(key);

    const urls = mappings.links ? row[mappings.links] ?? [] : [];
    projects.push({
      id: idFactory(),
      title,
      period: parsePeriod(row[mappings.period] ?? []),
      role: mappings.role ? (row[mappings.role] ?? []).join(', ') : '',
      techStack: [...new Set((row[mappings.techStack] ?? []).flatMap(splitMulti))],
      description: '',
      outcomes: (row[mappings.outcomes] ?? []).filter(Boolean),
      links: urls.filter((u) => URL_RE.test(u)).map((url) => ({ title: 'Notion 링크', url })),
      createdAt: iso,
      updatedAt: iso,
    });
  });

  return { projects, skipped };
}
