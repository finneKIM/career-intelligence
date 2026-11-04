import type { Project } from '../../types';

export const TARGET_ROLES = [
  'AI Engineer',
  'AI Applied Engineer',
  'MLOps Engineer',
  'ML Engineer',
] as const;

export const TARGET_DOMAINS = [
  '소리 & 오디오',
  '미디어 & 생성형 AI',
  '로보틱스 & 자율주행',
  '헬스케어 & 바이오',
] as const;

export type TargetRole = typeof TARGET_ROLES[number];
export type TargetDomain = typeof TARGET_DOMAINS[number];

export type ReadinessLevel = 'HIGH' | 'MEDIUM' | 'GROWTH';

export interface MatrixCell {
  role: TargetRole;
  domain: TargetDomain;
  score: number; // 종합 적합도 (0~100)
  roleScore: number; // 직무 기본기 적합도 (0~100)
  domainScore: number; // 도메인 특화 적합도 (0~100)
  readiness: ReadinessLevel;
  matchedRoleSkills: string[];
  missingRoleSkills: string[];
  matchedDomainSkills: string[];
  missingDomainSkills: string[];
  matchedSkills: string[];
  missingSkills: string[];
  description: string;
  actionGuide: string;
  roadmapSteps: string[];
}

// 4대 직무별 표준 핵심 요구 기술 스택
const ROLE_SKILL_REQUIREMENTS: Record<TargetRole, { core: string[]; description: string }> = {
  'AI Engineer': {
    core: ['PyTorch', 'TensorFlow', 'Transformers', 'Python', 'CUDA', 'Algorithm'],
    description: '최신 AI/딥러닝 모델 아키텍처 연구 및 대규모 파라미터 학습 알고리즘 개발 직무',
  },
  'AI Applied Engineer': {
    core: ['PyTorch', 'ONNX', 'TensorRT', 'FastAPI', 'Docker', 'Quantization'],
    description: '학습된 모델을 실제 서비스에 초저지연으로 서빙하고 경량화/양자화하는 실전 엔지니어링 직무',
  },
  'MLOps Engineer': {
    core: ['Docker', 'Kubernetes', 'FastAPI', 'CI/CD', 'MLflow', 'Airflow', 'Cloud/AWS'],
    description: '데이터 수집부터 모델 재학습, 배포, 모니터링 파이프라인 전체를 자동화하고 운영하는 인프라 직무',
  },
  'ML Engineer': {
    core: ['Python', 'SQL', 'Scikit-Learn', 'Pandas', 'XGBoost', 'Feature Engineering'],
    description: '비즈니스 정형/비정형 데이터를 바탕으로 전통 머신러닝 알고리즘 및 예측 파이프라인을 구축하는 직무',
  },
};

// 4대 도메인별 표준 핵심 요구 기술 스택
const DOMAIN_SKILL_REQUIREMENTS: Record<TargetDomain, { core: string[]; description: string }> = {
  '소리 & 오디오': {
    core: ['Audio DSP', 'Librosa', 'STT/TTS', 'Waveform', 'PyTorch'],
    description: '음성 합성(TTS), 음성 인식(STT), 사운드 이벤트 감지 및 음향 신호처리 도메인',
  },
  '미디어 & 생성형 AI': {
    core: ['LLM', 'Diffusion', 'LangChain', 'OpenCV', 'PyTorch'],
    description: '대형 언어 모델(LLM), 이미지/비디오 생성 및 멀티모달 서비스 도메인',
  },
  '로보틱스 & 자율주행': {
    core: ['ROS', 'C++', 'Computer Vision', 'Sensor Fusion', 'SLAM'],
    description: '실시간 하드웨어 제어, 임베디드 엣지 추론, 센서 데이터 융합 및 자율 주행 도메인',
  },
  '헬스케어 & 바이오': {
    core: ['Medical Imaging', 'DICOM', 'Segmentation', 'Bioinformatics', 'Python'],
    description: '의료 영상(CT/MRI) 분할, 환자 생체 신호 분석 및 바이오 헬스 도메인',
  },
};

/**
 * 직무(Role) × 도메인(Domain) 16개 조합 전체의 적합도 및 학습 로드맵 산출 엔진
 */
export function calculateRoleDomainMatrix(
  userSkills: string[],
  projects: Project[]
): MatrixCell[] {
  // 구직자 보유 전체 기술 (프로필 + 프로젝트 기술 스택 통합)
  const normalizedUserSkills = Array.from(
    new Set([
      ...userSkills.map(s => s.toLowerCase()),
      ...projects.flatMap(p => p.techStack.map(s => s.toLowerCase())),
    ])
  );

  const matrix: MatrixCell[] = [];

  for (const role of TARGET_ROLES) {
    const roleReq = ROLE_SKILL_REQUIREMENTS[role];

    for (const domain of TARGET_DOMAINS) {
      const domainReq = DOMAIN_SKILL_REQUIREMENTS[domain];

      // 1) 직무 역량 매칭 계산
      const matchedRoleSkills: string[] = [];
      const missingRoleSkills: string[] = [];
      for (const skill of roleReq.core) {
        const sLower = skill.toLowerCase();
        if (normalizedUserSkills.some(u => u.includes(sLower) || sLower.includes(u))) {
          matchedRoleSkills.push(skill);
        } else {
          missingRoleSkills.push(skill);
        }
      }
      const roleScore = Math.round((matchedRoleSkills.length / roleReq.core.length) * 100);

      // 2) 도메인 역량 매칭 계산
      const matchedDomainSkills: string[] = [];
      const missingDomainSkills: string[] = [];
      for (const skill of domainReq.core) {
        const sLower = skill.toLowerCase();
        if (normalizedUserSkills.some(u => u.includes(sLower) || sLower.includes(u))) {
          matchedDomainSkills.push(skill);
        } else {
          missingDomainSkills.push(skill);
        }
      }
      const domainScore = Math.round((matchedDomainSkills.length / domainReq.core.length) * 100);

      // 종합 점수: 직무 기본기(60%) + 도메인 특화(40%)
      const score = Math.round(roleScore * 0.6 + domainScore * 0.4);

      // 통합 매칭 및 결여 목록
      const matchedSkills = Array.from(new Set([...matchedRoleSkills, ...matchedDomainSkills]));
      const missingSkills = Array.from(new Set([...missingRoleSkills, ...missingDomainSkills]));

      // 준비도 등급 산정
      let readiness: ReadinessLevel = 'GROWTH';
      if (score >= 60 || (roleScore >= 60 && domainScore >= 40)) {
        readiness = 'HIGH';
      } else if (score >= 30) {
        readiness = 'MEDIUM';
      }

      // 맞춤형 액션 가이드 및 로드맵 단계 구성
      let actionGuide = '';
      const roadmapSteps: string[] = [];

      if (readiness === 'HIGH') {
        actionGuide = `직무 역량(${roleScore}%)과 도메인 역량(${domainScore}%) 모두 부합도가 높아 즉시 도전 및 전환이 유력한 핵심 추천 커리어입니다.`;
        roadmapSteps.push(`보유한 ${matchedRoleSkills.slice(0, 2).join(', ')} 실무 성과를 이력서 메인에 배치`);
        if (missingDomainSkills.length > 0) {
          roadmapSteps.push(`[${domain}] 특화 도구(${missingDomainSkills.slice(0, 2).join(', ')})를 활용한 토이 프로젝트로 최종 점검`);
        }
        roadmapSteps.push(`[${domain}] 타겟 채용 공고에 즉시 포트폴리오 제출`);
      } else if (readiness === 'MEDIUM') {
        actionGuide = `기본 직무 역량(${roleScore}%)은 충족되나, ${domain} 도메인 특화 기술(${missingDomainSkills.slice(0, 2).join(', ')})의 집중 보완이 필요한 성장 유망 커리어입니다.`;
        roadmapSteps.push(`기존 ${matchedSkills[0] || '보유 기술'}을 활용하여 [${domain}] 공개 데이터셋 파이프라인 구현`);
        roadmapSteps.push(`[${missingDomainSkills.slice(0, 2).join(', ')}] 기술을 학습하여 실전 프로젝트 1건 추가`);
        roadmapSteps.push(`도메인 성과 불릿을 포트폴리오에 반영한 뒤 적극 지원`);
      } else {
        actionGuide = `현재 보유 기술과의 접점이 적어, 기초 도구 학습부터 단계별로 준비해야 하는 중장기 도전 영역입니다.`;
        roadmapSteps.push(`[${role}] 기초 필수 기술(${missingRoleSkills.slice(0, 2).join(', ')}) 튜토리얼 완주`);
        roadmapSteps.push(`[${domain}] 기초 도메인 데이터 핸들링 실습`);
        roadmapSteps.push(`오픈소스 프로젝트 클론 코딩을 통한 기초 자산 형성`);
      }

      matrix.push({
        role,
        domain,
        score,
        roleScore,
        domainScore,
        readiness,
        matchedRoleSkills,
        missingRoleSkills,
        matchedDomainSkills,
        missingDomainSkills,
        matchedSkills,
        missingSkills,
        description: `${roleReq.description} · ${domainReq.description}`,
        actionGuide,
        roadmapSteps,
      });
    }
  }

  return matrix;
}
