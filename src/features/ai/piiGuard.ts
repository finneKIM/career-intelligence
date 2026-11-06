import { db } from '../../db';
import { rulesFromProfile, type RedactionRules } from '../../utils/piiRedaction';

/** 사용자 프로필(이름·이메일·전화·주소·가림 단어)에서 AI 전송 전 가림 규칙을 읽는다. 읽지 못하면 전송하지 않는다(안전 우선). */
export async function loadRedactionRules(): Promise<RedactionRules> {
  try {
    return rulesFromProfile(await db.profiles.get('current-user'));
  } catch {
    throw new Error('프로필의 가림 규칙을 읽지 못해 AI 전송을 중단했습니다. 앱을 새로고침한 뒤 다시 시도해 주세요.');
  }
}

/** 이름·이메일·전화·주소·가림 단어 중 하나라도 등록되어 있는지 (안내 배너 표시용) */
export const hasUserRules = (r: RedactionRules): boolean =>
  !!(r.name || r.email || r.phone || r.address || r.terms.some((t) => t.trim()));
