/**
 * 심화 리포트용 영역 메타: 이름·설명은 기본과 같고, 권장 시간과 학습 순서만 심화용이다.
 * 권장 시간 숫자는 constants.ts([사용자 결정 10/6: 심화 1문항 90초])에서만 바꾼다.
 */
import { AREAS, type AreaMeta } from '../areas.js';
import { ADVANCED_TEMPLATES } from './registry.js';
import { ADVANCED_TARGET_SEC } from './constants.js';

/** 심화 학습 순서: 영역 안에서 난이도 낮은 유형부터(같으면 등록 순서) */
const studyOrder = (area: AreaMeta['id']) =>
  ADVANCED_TEMPLATES.map((t, i) => ({ t, i }))
    .filter(({ t }) => t.area === area)
    .sort((a, b) => a.t.difficulty - b.t.difficulty || a.i - b.i)
    .map(({ t }) => t.subtype);

export const ADVANCED_AREAS: AreaMeta[] = AREAS.map((a) => ({ ...a, targetSec: ADVANCED_TARGET_SEC[a.id], studyOrder: studyOrder(a.id) }));
