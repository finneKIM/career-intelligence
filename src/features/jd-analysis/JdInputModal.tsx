import { useState } from 'react';
import { 
  X, 
  Sparkles, 
  FileText, 
  Globe, 
  ChevronDown, 
  ChevronUp, 
  AlertCircle,
  ClipboardCheck
} from 'lucide-react';
import { parseJobDescription } from './jdParserService';
import { db } from '../../db';
import type { JobDescription } from '../../types';

interface JdInputModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newJd: JobDescription) => void;
}

const SAMPLE_JD = `[예시클라우드] AI Applied Engineer (오디오/음성 모델링)

[주요 업무]
• 초거대 생성형 AI 모델 기반 음성 합성(TTS) 및 음성 인식(STT) 파이프라인 개발
• PyTorch 기반 딥러닝 모델 개발, ONNX Runtime/TensorRT 추론 최적화
• 대용량 오디오 및 음향 데이터 처리 분산 학습 아키텍처 구축

[자격 요건]
• PyTorch 또는 TensorFlow 기반 딥러닝 모델링 및 서빙 경험 2년 이상
• Docker, Kubernetes 기반의 컨테이너 환경 서비스 배포 경험
• Python 비동기 프레임워크(FastAPI 등) 기반 마이크로서비스 설계 역량

[우대 사항]
• 음성/오디오 신호처리(DSP) 또는 음향 AI 프로젝트 수행 경험자
• 글로벌 학회(ICASSP, Interspeech 등) 논문 게재 또는 기술 블로그 기고 경험
• 대규모 트래픽 환경에서의 모델 경량화(Quantization, Pruning) 실무 경험`;

export function JdInputModal({ isOpen, onClose, onSuccess }: JdInputModalProps) {
  const [sourceUrl, setSourceUrl] = useState('');
  const [rawText, setRawText] = useState('');
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [domain, setDomain] = useState('소리 & 오디오');
  const [showRawTextarea, setShowRawTextarea] = useState(true);
  const [urlFetchWarning, setUrlFetchWarning] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  // 샘플 공고 불러오기
  const handleLoadSample = () => {
    setCompany('예시클라우드');
    setRole('AI Applied Engineer (오디오/음성 모델링)');
    setDomain('소리 & 오디오');
    setSourceUrl('https://recruit.example.com/sample-ai-job');
    setRawText(SAMPLE_JD);
    setShowRawTextarea(true);
    setUrlFetchWarning(null);
  };

  // URL 공고 가져오기 시뮬레이션 및 Fail-Safe 안내
  const handleFetchFromUrl = () => {
    if (!sourceUrl.trim()) {
      alert('가져올 공고 링크(URL)를 입력해주세요.');
      return;
    }

    setUrlFetchWarning(
      '외부 채용 사이트의 보안 정책(CORS 및 봇 차단)으로 인해 브라우저 직접 스크래핑이 제한될 수 있습니다. 안전한 분석을 위해 공고 텍스트를 복사하여 아래 텍스트창에 직접 붙여넣는 방식을 권장합니다.'
    );
    setShowRawTextarea(true);
  };

  // 폼 제출 및 파싱 저장
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!rawText.trim()) {
      alert('채용 공고 텍스트 내용을 입력하거나 [샘플 공고 불러오기]를 눌러주세요.');
      return;
    }

    try {
      setIsSubmitting(true);

      // 정규식 파서로 공고 자동 구조화
      const parsedJd = parseJobDescription(rawText, {
        company: company.trim(),
        role: role.trim(),
        domain: domain.trim(),
        sourceUrl: sourceUrl.trim(),
      });

      // IndexedDB에 안전하게 영구 저장
      await db.jobDescriptions.add(parsedJd);

      onSuccess(parsedJd);
      onClose();
    } catch (err) {
      console.error('공고 파싱 및 저장 실패:', err);
      alert('공고를 저장하는 도중 오류가 발생했습니다.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
      <div 
        className="bg-white rounded-2xl max-w-2xl w-full p-6 sm:p-8 shadow-2xl border border-slate-200 relative animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 모달 헤더 */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-100 shrink-0">
          <div className="flex items-center space-x-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">새 채용공고(JD) 파싱 & 등록</h2>
              <p className="text-xs text-slate-500">
                공고 내용을 [주요 업무], [자격 요건], [우대 사항]으로 자동 구조화합니다.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 모달 바디 (스크롤 가능) */}
        <form onSubmit={handleSubmit} className="overflow-y-auto flex-1 py-4 space-y-5 pr-1">
          {/* 샘플 데이터 원클릭 시딩 안내 배너 */}
          <div className="flex items-center justify-between p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl text-xs">
            <div className="flex items-center space-x-2 text-indigo-900">
              <ClipboardCheck className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>실제 채용 공고 양식으로 테스트해보시겠어요?</span>
            </div>
            <button
              type="button"
              onClick={handleLoadSample}
              className="px-3 py-1 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-colors shrink-0 cursor-pointer text-[11px]"
            >
              샘플 공고 불러오기
            </button>
          </div>

          {/* 1. 채용공고 URL 입력 영역 */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-slate-700">
              공고 링크 (URL) <span className="text-slate-400 font-normal">(선택)</span>
            </label>
            <div className="flex space-x-2">
              <div className="relative flex-1">
                <Globe className="w-4 h-4 text-slate-400 absolute left-3 top-3" />
                <input
                  type="url"
                  value={sourceUrl}
                  onChange={(e) => setSourceUrl(e.target.value)}
                  placeholder="https://www.wanted.co.kr/wd/..."
                  className="w-full pl-9 pr-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
                />
              </div>
              <button
                type="button"
                onClick={handleFetchFromUrl}
                className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl transition-colors shrink-0 cursor-pointer"
              >
                가져오기
              </button>
            </div>
            {urlFetchWarning && (
              <div className="flex items-start space-x-2 p-2.5 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-800">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <span>{urlFetchWarning}</span>
              </div>
            )}
          </div>

          {/* 2. Fail-Safe 텍스트 직접 복사/붙여넣기 토글 */}
          <div className="border border-slate-200 rounded-xl overflow-hidden">
            <button
              type="button"
              onClick={() => setShowRawTextarea(!showRawTextarea)}
              className="w-full px-4 py-2.5 bg-slate-50 flex items-center justify-between text-xs font-bold text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              <div className="flex items-center space-x-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                <span>공고 원문 텍스트 복사/붙여넣기 (Fail-Safe 필수)</span>
                <span className="text-rose-500">*</span>
              </div>
              {showRawTextarea ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showRawTextarea && (
              <div className="p-3 bg-white space-y-2 border-t border-slate-100">
                <textarea
                  rows={8}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={`채용 공고의 [주요 업무], [자격 요건], [우대 사항] 전체를 그대로 복사하여 붙여넣으세요.\n\n예시:\n[주요 업무]\n• AI 모델 학습 및 서빙 파이프라인 개발\n\n[자격 요건]\n• Python 및 PyTorch 실무 경험\n\n[우대 사항]\n• 관련 논문 게재 경험`}
                  className="w-full p-3 text-xs font-mono border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 leading-relaxed"
                  required
                />
                <p className="text-[11px] text-slate-500">
                  💡 파서가 텍스트 안의 헤더([주요 업무], [자격 요건] 등)와 불릿 기호(•, -, 1.)를 감지하여 항목별로 자동 정제합니다.
                </p>
              </div>
            )}
          </div>

          {/* 3. 기업명 & 채용 직무 & 도메인 보정 */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                기업명 <span className="text-slate-400 font-normal">(자동추론)</span>
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="예: 예시클라우드"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">
                채용 직무 <span className="text-slate-400 font-normal">(자동추론)</span>
              </label>
              <input
                type="text"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="예: AI Applied Engineer"
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-bold text-slate-700">산업 도메인</label>
              <select
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-slate-200 rounded-xl focus:outline-hidden focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 bg-white"
              >
                <option value="소리 & 오디오">소리 & 오디오</option>
                <option value="미디어 & 생성형 AI">미디어 & 생성형 AI</option>
                <option value="로보틱스 & 자율주행">로보틱스 & 자율주행</option>
                <option value="헬스케어 & 바이오">헬스케어 & 바이오</option>
                <option value="일반 IT / 핀테크">일반 IT / 핀테크</option>
              </select>
            </div>
          </div>

          {/* 모달 푸터 버튼 */}
          <div className="pt-4 border-t border-slate-100 flex items-center justify-end space-x-3 shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              취소
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center space-x-1.5 cursor-pointer disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              <span>{isSubmitting ? '파싱 분석 중...' : '⚡ 지능형 파싱 & 등록하기'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
