import type { Problem } from '../engine/types.js';
import type { MistakeTag } from '../engine/mistakes.js';
import { MISTAKES } from '../engine/mistakes.js';
import { AREAS, type AreaMeta } from '../areas.js';

export interface Attempt {
  picked: number;
  sec: number;
}

export type Level = 'stable' | 'improve' | 'focus';
export const LEVEL_LABEL: Record<Level, string> = { stable: '안정', improve: '보완 필요', focus: '집중 필요' };

export interface Pattern {
  tag: MistakeTag;
  text: string;
  count: number;
}

export interface StudyStep {
  subtype: string;
  reason: '틀린 유형' | '이번에 나오지 않은 유형' | '맞힌 유형 다지기';
}

export interface AreaReport {
  meta: AreaMeta;
  total: number;
  correct: number;
  rate: number;
  avgSec: number;
  level: Level;
  levelReason: string;
  weakSubtypes: string[];
  patterns: Pattern[];
  study: StudyStep[];
  /** 세트 안에서 이 영역 문항의 번호(0부터) */
  items: number[];
}

export interface Report {
  areas: AreaReport[];
  /** 학습 우선순위 순 */
  priority: AreaReport[];
  correct: number;
  total: number;
  totalSec: number;
}

/**
 * 수준 판정. 영역당 문항이 적어서 단순하고 설명 가능한 규칙만 쓴다.
 * - 모두 맞힘 → 안정 (단, 평균 시간이 권장의 1.5배를 넘으면 보완 필요)
 * - 60% 이상 → 보완 필요
 * - 그 외 → 집중 필요
 */
export function judge(rate: number, avgSec: number, targetSec: number): { level: Level; reason: string } {
  if (rate >= 0.999) {
    if (avgSec > targetSec * 1.5)
      return { level: 'improve', reason: `모두 맞혔지만 문항당 평균 시간이 권장(${targetSec}초)보다 크게 길어요. 풀이 속도를 다듬을 차례예요.` };
    return { level: 'stable', reason: '이번 문항은 모두 맞혔어요. 다른 숫자로 한두 번 더 확인하면 충분해요.' };
  }
  if (rate >= 0.6) return { level: 'improve', reason: '대부분 맞혔지만 놓친 유형이 있어요. 아래 틀린 패턴을 먼저 확인하세요.' };
  return { level: 'focus', reason: '절반 이상을 놓쳤어요. 기본 개념부터 순서대로 다시 정리하는 것을 권해요.' };
}

const LEVEL_ORDER: Record<Level, number> = { focus: 0, improve: 1, stable: 2 };

/** areaMetas: 심화는 권장 시간·학습 순서가 다른 영역 메타를 넘긴다. 기본값은 이전과 같은 AREAS. */
export function analyze(qs: Problem[], attempts: Attempt[], totalSec: number, areaMetas: AreaMeta[] = AREAS): Report {
  const areas: AreaReport[] = [];
  for (const meta of areaMetas) {
    const items = qs.map((q, i) => (q.area === meta.id ? i : -1)).filter((i) => i >= 0);
    if (!items.length) continue;
    const ok = (i: number) => attempts[i]?.picked === qs[i].answerIndex;
    const correct = items.filter(ok).length;
    const rate = correct / items.length;
    const avgSec = items.reduce((s, i) => s + (attempts[i]?.sec ?? 0), 0) / items.length;
    const { level, reason } = judge(rate, avgSec, meta.targetSec);

    const wrongItems = items.filter((i) => !ok(i));
    const weakSubtypes = [...new Set(wrongItems.map((i) => qs[i].subtype))];

    const counts = new Map<MistakeTag, number>();
    for (const i of wrongItems) {
      const tag = qs[i].choices[attempts[i]?.picked]?.mistakeTag;
      if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
    const patterns = [...counts]
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count, text: MISTAKES[tag] }));

    const asked = new Set(items.map((i) => qs[i].subtype));
    const study: StudyStep[] = [
      ...meta.studyOrder.filter((s) => weakSubtypes.includes(s)).map((subtype) => ({ subtype, reason: '틀린 유형' as const })),
      ...meta.studyOrder.filter((s) => !asked.has(s)).map((subtype) => ({ subtype, reason: '이번에 나오지 않은 유형' as const })),
      ...meta.studyOrder.filter((s) => asked.has(s) && !weakSubtypes.includes(s)).map((subtype) => ({ subtype, reason: '맞힌 유형 다지기' as const })),
    ];

    areas.push({ meta, total: items.length, correct, rate, avgSec, level, levelReason: reason, weakSubtypes, patterns, study, items });
  }
  const priority = areas
    .slice()
    .sort((a, b) => LEVEL_ORDER[a.level] - LEVEL_ORDER[b.level] || a.rate - b.rate || b.avgSec / b.meta.targetSec - a.avgSec / a.meta.targetSec);
  const correct = areas.reduce((s, a) => s + a.correct, 0);
  return { areas, priority, correct, total: qs.length, totalSec };
}
