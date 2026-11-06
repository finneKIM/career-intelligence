import { describe, it, expect } from 'vitest';
import {
  PiiLeakError,
  redactDeep,
  restoreDeep,
  rulesFromProfile,
  findGenericPii,
  type RedactionRules,
} from '../src/utils/piiRedaction';

const NO_RULES: RedactionRules = { name: '', email: '', phone: '', address: '', terms: [] };
const red = (s: string, rules: RedactionRules = NO_RULES) => redactDeep(s, rules);

describe('일반 패턴 가림 (연락처 미등록이어도 적용)', () => {
  it('이메일을 대소문자와 관계없이 가려야 합니다', () => {
    const r = red('문의: Hana.Kim+job@Example.co.kr 로 연락');
    expect(r.value).toBe('문의: {{이메일A}} 로 연락');
    expect(r.count).toBe(1);
  });

  it.each([
    '010-1234-5678',
    '01012345678',
    '010 1234 5678',
    '010.1234.5678',
    '+82 10-1234-5678',
    '+82-10-1234-5678',
    '０１０-１２３４-５６７８', // 전각 숫자
    '010-12​34-5678', // 제로폭 문자 삽입
    '02-123-4567',
    '031-1234-5678',
  ])('전화번호 표기 "%s" 를 가려야 합니다', (p) => {
    const r = red(`연락처 ${p} 입니다`);
    expect(r.value).toMatch(/\{\{전화A\}\}/);
    expect(r.value).not.toMatch(/\d{3,}/);
  });

  it('주민등록번호 형태를 가려야 합니다', () => {
    expect(red('번호 900101-1234567 확인').value).toBe('번호 {{주민번호A}} 확인');
  });

  it.each([
    '2024-11-06에 지원',
    '매출 1,234,567원 달성',
    '버전 v1.2.3 배포',
    '응답 180ms 로 개선',
    '2019년 학번 20190123 학생',
    '정확도 92.5%, 처리량 12000건',
    '기간 2023-03 ~ 2024-02',
  ])('오탐 방지: "%s" 는 그대로 두어야 합니다', (s) => {
    const r = red(s);
    expect(r.value).toBe(s);
    expect(r.count).toBe(0);
  });

  it('같은 값은 같은 토큰, 다른 값은 다른 토큰을 받아야 합니다', () => {
    const r = red('a@x.com, b@x.com, a@x.com');
    expect(r.value).toBe('{{이메일A}}, {{이메일B}}, {{이메일A}}');
    expect(r.count).toBe(3);
  });

  it('토큰이 26개를 넘어도 글자만으로 구분되고 숫자는 쓰지 않아야 합니다', () => {
    const text = Array.from({ length: 30 }, (_, i) => `u${i}@x.com`).join(' ');
    const r = red(text);
    expect(new Set(r.value.split(' ')).size).toBe(30);
    expect(r.value).not.toMatch(/\{\{[^}]*\d[^}]*\}\}/);
  });
});

describe('사용자 규칙 가림', () => {
  const rules = rulesFromProfile({
    name: '김하나',
    email: 'hana@mail.com',
    phone: '010-9999-8888',
    address: '서울시 강남구 테헤란로 1',
    redactTerms: ['서울대학교', 'C++', 'Hana Kim'],
  });

  it('이름이 여러 곳에 있어도 모두 같은 토큰으로 가려야 합니다', () => {
    const r = red('김하나는 개발자. 김하나 팀장 추천', rules);
    expect(r.value).toBe('{{이름A}}는 개발자. {{이름A}} 팀장 추천');
    expect(r.count).toBe(2);
  });

  it('전화번호는 표기가 달라도 같은 번호로 가려야 합니다', () => {
    const r = red('01099998888 / 010 9999 8888 / +82 10-9999-8888', rules);
    expect(r.value).not.toMatch(/9999/);
  });

  it('가림 단어는 대소문자 무시, 특수문자(C++) 안전 처리', () => {
    const r = red('hana kim 은 서울대학교 출신이고 c++ 을 씁니다', rules);
    expect(r.value).not.toMatch(/hana kim|서울대학교|c\+\+/i);
    expect(r.count).toBe(3);
  });

  it('더 긴 값을 먼저 가려야 합니다 (겹치는 단어)', () => {
    const r = red('서울시 강남구 테헤란로 1 에 거주', rules);
    expect(r.value).toBe('{{주소A}} 에 거주');
  });

  it('토큰 글자와 겹치는 가림 단어가 있어도 이미 만든 토큰을 망가뜨리지 않아야 합니다', () => {
    const r = red('a@x.com 그리고 가림 이름', { ...NO_RULES, terms: ['가림', '이름', 'A'] });
    expect(r.value).toContain('{{이메일A}}');
  });

  it('2글자 미만 이름과 기본 자리표시 이름은 규칙에서 제외해야 합니다', () => {
    expect(red('김 씨', rulesFromProfile({ name: '김' })).count).toBe(0);
    const ph = rulesFromProfile({ name: '구직자 (기본 프로필)' });
    expect(red('구직자 (기본 프로필) 확인', ph).count).toBe(0);
  });
});

describe('구조 보존', () => {
  it('객체 키·숫자·null·불리언은 그대로 두고 문자열만 가려야 합니다', () => {
    const input = { rawText: 'x@y.com', n: 3, ok: true, nil: null, list: ['010-1111-2222', 5], deep: { a: { b: 'z@y.com' } } };
    const r = red(input as unknown as string);
    expect(r.value).toEqual({
      rawText: '{{이메일A}}',
      n: 3,
      ok: true,
      nil: null,
      list: ['{{전화A}}', 5],
      deep: { a: { b: '{{이메일B}}' } },
    });
    expect(r.count).toBe(3);
  });

  it('원문에 이미 {{…}} 모양이 있어도 우리 토큰과 혼동되지 않아야 합니다', () => {
    const r = red('템플릿 {{이메일A}} 와 실제 a@x.com');
    expect(r.value).not.toMatch(/\{\{이메일A\}\}.*\{\{이메일A\}\}/);
    const back = restoreDeep(r.value, r.mapping);
    expect(JSON.stringify(back.value)).toContain('a@x.com');
  });
});

describe('복원과 재검사', () => {
  it('응답의 토큰을 원래 값으로 되돌려야 합니다', () => {
    const r = red('연락 a@x.com 또는 010-1234-5678');
    const back = restoreDeep({ s: `답: ${r.value}` }, r.mapping);
    expect(back.value).toEqual({ s: '답: 연락 a@x.com 또는 010-1234-5678' });
    expect(back.unknown).toBe(0);
  });

  it('모르는 토큰은 개수로 알려야 합니다', () => {
    const r = red('a@x.com');
    const back = restoreDeep('이건 {{전화Z}} 와 {{이메일A}}', r.mapping);
    expect(back.unknown).toBe(1);
    expect(back.value).toContain('a@x.com');
  });

  it('값이 남아 있는지 다시 검사해 PiiLeakError를 내고, 오류에 원본 값을 싣지 않아야 합니다', () => {
    expect(findGenericPii('010-1234-5678')).toBe(true);
    expect(findGenericPii('{{전화A}} 와 2024-11-06')).toBe(false);
    const err = new PiiLeakError(1);
    expect(err.message).not.toMatch(/\d{3}-/);
  });

  it('토큰 사이에 끼인 숫자가 합쳐져 오탐이 되지 않아야 합니다', () => {
    expect(findGenericPii('010{{가림A}}1234{{가림B}}5678')).toBe(false);
  });
});

describe('성능', () => {
  it('12,000자 × 규칙 100개를 1초 안에 처리해야 합니다', () => {
    const rules: RedactionRules = { ...NO_RULES, terms: Array.from({ length: 100 }, (_, i) => `단어${i}회사`) };
    const text = '평범한 문장입니다. 단어5회사 와 a@x.com '.repeat(400).slice(0, 12000);
    const t0 = performance.now();
    const r = red(text, rules);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(r.count).toBeGreaterThan(0);
  });
});
