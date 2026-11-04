import type { JobDescription, JobDescriptionSections } from '../../types';

/**
 * 정규식 기반 채용공고(JD) 파서 엔진
 * 구직자가 복사/붙여넣은 줄글 및 불릿 형태의 채용 공고를 분석하여
 * [주요 업무], [자격 요건], [우대 사항]으로 자동 구조화합니다.
 */

// 섹션 헤더 매칭 정규식
const RESPONSIBILITIES_REGEX = /(?:\[|\(|【|<|\b)?(?:주요\s*업무|담당\s*업무|하게\s*될\s*일|주요\s*역할|역할\s*및\s*책임|responsibilities|what\s*you(?:'ll|will)\s*do|key\s*responsibilities|job\s*description)(?:\]|\)|】|>|:|\b)/i;
const QUALIFICATIONS_REGEX = /(?:\[|\(|【|<|\b)?(?:자격\s*요건|지원\s*자격|필수\s*요건|필수\s*역량|지원\s*조건|requirements|qualifications|basic\s*qualifications|must\s*have)(?:\]|\)|】|>|:|\b)/i;
const PREFERRED_REGEX = /(?:\[|\(|【|<|\b)?(?:우대\s*사항|우대\s*조건|우대\s*요건|이런\s*분을\s*우대해요|우대\s*역량|preferred\s*qualifications|preferred|nice\s*to\s*have|plus)(?:\]|\)|】|>|:|\b)/i;

// 불릿 기호 및 앞단 마커 제거 정규식
const BULLET_MARKER_REGEX = /^[\s\t]*[•\-*·▪▫▶✓✔\u2022\u2023\u25E6\u2043\u2219]\s*|^[\s\t]*\d+[\.\)]\s*|^[\s\t]*\[[\sxX]?\]\s*/;

type SectionType = 'responsibilities' | 'qualifications' | 'preferred' | 'none';

interface HeaderMatch {
  index: number;
  length: number;
  type: SectionType;
}

/**
 * 줄글/문단에서 불릿 항목들을 정제하여 배열로 반환
 */
export function cleanSectionItems(rawText: string): string[] {
  if (!rawText.trim()) return [];

  const lines = rawText.split(/\r?\n/);
  const items: string[] = [];
  let currentBuffer = '';

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) {
      if (currentBuffer) {
        items.push(currentBuffer.trim());
        currentBuffer = '';
      }
      continue;
    }

    // 새로운 불릿 기호로 시작하는 줄인지 확인
    const isBulletStart = BULLET_MARKER_REGEX.test(line);
    const cleanedLine = line.replace(BULLET_MARKER_REGEX, '').trim();

    if (isBulletStart) {
      if (currentBuffer) {
        items.push(currentBuffer.trim());
      }
      currentBuffer = cleanedLine;
    } else {
      // 불릿이 아니라면 이전 불릿의 이어지는 줄이거나 독립된 문장
      if (currentBuffer) {
        currentBuffer += ' ' + cleanedLine;
      } else {
        currentBuffer = cleanedLine;
      }
    }
  }

  if (currentBuffer) {
    items.push(currentBuffer.trim());
  }

  return items.filter(item => item.length > 0);
}

/**
 * 텍스트 첫 1~3줄에서 기업명과 직무명을 추론하는 헬퍼
 */
export function inferCompanyAndRole(rawText: string): { company: string; role: string } {
  const lines = rawText
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0)
    .slice(0, 3);

  let company = '';
  let role = '';

  for (const line of lines) {
    // 패턴 1: [회사명] 직무명 또는 (회사명) 직무명
    const bracketMatch = line.match(/^\[(.*?)\]\s*(.*)$/) || line.match(/^\((.*?)\)\s*(.*)$/);
    if (bracketMatch) {
      company = bracketMatch[1].trim();
      role = bracketMatch[2].trim();
      break;
    }

    // 패턴 2: 회사명 - 직무명 또는 회사명 | 직무명
    const separatorMatch = line.match(/^(.*?)\s*[-|/:]\s*(.*)$/);
    if (separatorMatch && separatorMatch[1].length < 30 && separatorMatch[2].length < 50) {
      company = separatorMatch[1].trim();
      role = separatorMatch[2].trim();
      break;
    }
  }

  return { company, role };
}

/**
 * 채용 공고 원문 전체를 파싱하여 구조화된 데이터로 변환
 */
export function parseJobDescription(
  rawText: string,
  options: {
    company?: string;
    role?: string;
    domain?: string;
    sourceUrl?: string;
  } = {}
): JobDescription {
  const normalizedText = rawText.trim();
  const inferred = inferCompanyAndRole(normalizedText);

  const company = options.company?.trim() || inferred.company || '미지정 기업';
  const role = options.role?.trim() || inferred.role || '채용 포지션';
  const domain = options.domain?.trim() || '일반 IT / 테크';
  const sourceUrl = options.sourceUrl?.trim() || '';

  // 각 섹션 헤더의 시작 위치 찾기
  const matches: HeaderMatch[] = [];

  const lines = normalizedText.split(/\r?\n/);
  let currentIndex = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed) {
      if (RESPONSIBILITIES_REGEX.test(trimmed)) {
        matches.push({ index: currentIndex, length: line.length, type: 'responsibilities' });
      } else if (QUALIFICATIONS_REGEX.test(trimmed)) {
        matches.push({ index: currentIndex, length: line.length, type: 'qualifications' });
      } else if (PREFERRED_REGEX.test(trimmed)) {
        matches.push({ index: currentIndex, length: line.length, type: 'preferred' });
      }
    }
    currentIndex += line.length + 1; // 줄바꿈 문자 고려
  }

  // 섹션 분할 결과 저장용 객체
  const sections: JobDescriptionSections = {
    responsibilities: [],
    qualifications: [],
    preferred: [],
  };

  if (matches.length === 0) {
    // 헤더를 하나도 찾지 못한 경우 (Fail-Safe: 전체 내용을 자격요건/업무에 균등 또는 일반 분할)
    const allItems = cleanSectionItems(normalizedText);
    if (allItems.length <= 3) {
      sections.responsibilities = allItems;
    } else {
      const half = Math.ceil(allItems.length / 2);
      sections.responsibilities = allItems.slice(0, half);
      sections.qualifications = allItems.slice(half);
    }
  } else {
    // 헤더 위치 순서대로 정렬
    matches.sort((a, b) => a.index - b.index);

    for (let i = 0; i < matches.length; i++) {
      const current = matches[i];
      const next = matches[i + 1];

      const contentStart = current.index + current.length;
      const contentEnd = next ? next.index : normalizedText.length;
      const sectionText = normalizedText.slice(contentStart, contentEnd);

      const items = cleanSectionItems(sectionText);

      if (current.type === 'responsibilities') {
        sections.responsibilities.push(...items);
      } else if (current.type === 'qualifications') {
        sections.qualifications.push(...items);
      } else if (current.type === 'preferred') {
        sections.preferred.push(...items);
      }
    }
  }

  return {
    id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `jd-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    company,
    role,
    domain,
    rawText: normalizedText,
    sourceUrl: sourceUrl || undefined,
    sections,
    parsedAt: new Date().toISOString(),
  };
}
