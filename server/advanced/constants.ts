/**
 * 심화 진단 상수. 심화 권장 시간은 이 파일에서만 바꾼다.
 *
 * [사용자 결정 10/6: 심화 1문항 90초] Preview에서 직접 풀어 본 체감 기준으로 정했다. 네 영역 모두 같다.
 * 판정 규칙(judge)은 기본과 같고, 권장 시간만 다르다.
 */
import type { AreaId } from '../engine/types.js';

/** [사용자 결정 10/6: 심화 1문항 90초] 영역별 심화 문항 1개당 권장 풀이 시간(초) */
export const ADVANCED_TARGET_SEC: Record<AreaId, number> = {
  arith: 90,
  stats: 90,
  chartRead: 90,
  chartMake: 90,
};

/** 심화도 기본과 같이 영역별 3문항(4개 영역 × 3 = 12문항) */
export const ADVANCED_PER_AREA = 3;
