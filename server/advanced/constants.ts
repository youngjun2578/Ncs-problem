/**
 * 심화 진단 상수. 심화 권장 시간은 이 파일에서만 바꾼다.
 *
 * [가정] 아래 권장 시간은 실제 풀이 시간을 재 본 값이 아니다. 공개 전에 직접 풀어 보며 조정한다.
 * 판정 규칙(judge)은 기본과 같고, 권장 시간만 다르다.
 */
import type { AreaId } from '../engine/types.js';

/** [가정] 영역별 심화 문항 1개당 권장 풀이 시간(초) */
export const ADVANCED_TARGET_SEC: Record<AreaId, number> = {
  arith: 120,
  stats: 120,
  chartRead: 150,
  chartMake: 150,
};

/** 심화도 기본과 같이 영역별 3문항(4개 영역 × 3 = 12문항) */
export const ADVANCED_PER_AREA = 3;
