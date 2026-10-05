import type { Rng } from './rng.js';
import type { Choice, Generated } from './types.js';
import { hasAtMostDecimals } from './format.js';
import { isFrac, isProb } from './frac.js';

const CHOICE_COUNT = 5;

/** 보기로 쓸 수 있는 값인가: 유한, 양수, 소수 둘째 자리 이내 */
export function isValidValue(v: unknown): boolean {
  if (typeof v === 'number') return Number.isFinite(v) && v > 0 && hasAtMostDecimals(v, 2);
  if (typeof v === 'string') return v.trim().length > 0;
  if (isFrac(v)) return isProb(v);
  return v !== null && v !== undefined;
}

/** 화면에 보일 문자열에 비정상 값이 섞였는가 */
export function hasBadToken(s: string): boolean {
  return /NaN|Infinity|undefined|null|\[object/.test(s) || /(^|[^\d\w])-\d/.test(s);
}

export class ChoiceError extends Error {}

/**
 * 정답 1개 + 오답 4개를 만든다.
 * 오답은 템플릿이 준 "흔한 실수" 값 가운데 유효하고 서로 다른 것에서 고르고,
 * 모자랄 때만 근접값(계산 실수)으로 채운다.
 */
export function buildChoices<V>(rng: Rng, g: Generated<V>): { choices: Choice[]; answerIndex: number; fillers: number } {
  if (!isValidValue(g.answer)) throw new ChoiceError(`정답 값이 비정상: ${String(g.answer)}`);
  const answerLabel = g.format(g.answer);
  const seen = new Set([answerLabel]);
  const pool: Choice[] = [];

  // 같은 값이 여러 실수에서 나오면 템플릿이 먼저 적은(더 구체적인) 태그를 남긴다
  for (const w of g.wrongs) {
    if (!isValidValue(w.value)) continue;
    const label = g.format(w.value);
    if (seen.has(label) || hasBadToken(label)) continue;
    seen.add(label);
    pool.push({ label, mistakeTag: w.mistakeTag, chart: g.chart?.(w.value) });
  }
  const picked = rng.shuffle(pool).slice(0, CHOICE_COUNT - 1);

  let fillers = 0;
  if (g.near) {
    for (let k = 1; picked.length < CHOICE_COUNT - 1 && k <= 30; k++) {
      for (const s of rng.shuffle([1, -1])) {
        if (picked.length >= CHOICE_COUNT - 1) break;
        const v = g.near(s * k);
        if (v === null || !isValidValue(v)) continue;
        const label = g.format(v);
        if (seen.has(label) || hasBadToken(label)) continue;
        seen.add(label);
        picked.push({ label, mistakeTag: '계산 실수', chart: g.chart?.(v) });
        fillers++;
      }
    }
  }
  if (picked.length < CHOICE_COUNT - 1) throw new ChoiceError(`보기가 ${picked.length + 1}개뿐`);

  const all = rng.shuffle([{ label: answerLabel, mistakeTag: null, chart: g.chart?.(g.answer) } as Choice, ...picked]);
  return { choices: all, answerIndex: all.findIndex((c) => c.mistakeTag === null), fillers };
}

/** 숫자 문제용 근접값 생성기 */
export function nearBy(answer: number, step: number) {
  return (k: number) => {
    const v = Math.round((answer + k * step) * 100) / 100;
    return v > 0 ? v : null;
  };
}
