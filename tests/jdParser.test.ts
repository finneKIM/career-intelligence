import { describe, it, expect } from 'vitest';
import { parseJobDescription, cleanSectionItems, inferCompanyAndRole } from '../src/features/jd-analysis/jdParserService';

describe('JD Parser Service Tests', () => {
  const sampleWantedJd = `
[예시클라우드] AI Applied Engineer 채용

[주요 업무]
• 초거대 언어모델(LLM) 및 음성 AI 기반 서비스 모델 서빙 및 최적화
• ONNX Runtime 및 TensorRT를 활용한 추론 지연시간 개선
• 대용량 오디오 데이터 파이프라인 구축 및 분산 학습 지원

[자격 요건]
- PyTorch를 활용한 딥러닝 모델 개발 및 서빙 경험 2년 이상
- Docker 및 Kubernetes 환경에서의 컨테이너 기반 서빙 경험
- REST API (FastAPI 등) 기반 백엔드 서비스 개발 역량

[우대 사항]
1. 음성 합성(TTS) 또는 음성 인식(STT) 모델링 경험자
2. 오픈소스 기여 경험 또는 기술 블로그 운영자
`;

  it('회사명과 직무명을 헤더에서 정확히 추론해야 합니다', () => {
    const { company, role } = inferCompanyAndRole(sampleWantedJd);
    expect(company).toBe('예시클라우드');
    expect(role).toBe('AI Applied Engineer 채용');
  });

  it('불릿 항목들을 기호 없이 깨끗하게 분리해야 합니다', () => {
    const raw = `
    • 첫 번째 업무 내용입니다.
    - 두 번째 업무 내용입니다.
    1. 세 번째 업무 내용입니다.
    `;
    const items = cleanSectionItems(raw);
    expect(items).toHaveLength(3);
    expect(items[0]).toBe('첫 번째 업무 내용입니다.');
    expect(items[1]).toBe('두 번째 업무 내용입니다.');
    expect(items[2]).toBe('세 번째 업무 내용입니다.');
  });

  it('실제 JD를 [주요 업무], [자격 요건], [우대 사항]으로 정확히 분류해야 합니다', () => {
    const parsed = parseJobDescription(sampleWantedJd);

    expect(parsed.company).toBe('예시클라우드');
    expect(parsed.role).toBe('AI Applied Engineer 채용');
    expect(parsed.sections.responsibilities).toHaveLength(3);
    expect(parsed.sections.qualifications).toHaveLength(3);
    expect(parsed.sections.preferred).toHaveLength(2);

    expect(parsed.sections.responsibilities[0]).toContain('초거대 언어모델');
    expect(parsed.sections.qualifications[0]).toContain('PyTorch');
    expect(parsed.sections.preferred[0]).toContain('음성 합성');
  });

  it('헤더가 없는 자유 텍스트도 오류 없이 파싱할 수 있어야 합니다 (Fail-Safe)', () => {
    const unstructuredJd = `
    파이썬 기반 머신러닝 모델을 개발합니다.
    AWS 클라우드 환경에서 서비스를 배포합니다.
    학습 데이터셋 전처리를 수행합니다.
    `;
    const parsed = parseJobDescription(unstructuredJd, {
      company: '테스트스타트업',
      role: 'ML 엔지니어',
    });

    expect(parsed.company).toBe('테스트스타트업');
    expect(parsed.role).toBe('ML 엔지니어');
    expect(parsed.sections.responsibilities.length + parsed.sections.qualifications.length).toBeGreaterThanOrEqual(1);
  });
});
