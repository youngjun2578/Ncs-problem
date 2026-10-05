import type { Rng } from './rng.js';
import type { MistakeTag } from './mistakes.js';
import type { ChartSpec, Figure } from '../../shared/charts/types.js';

export type AreaId = 'arith' | 'stats' | 'chartRead' | 'chartMake';
export type Difficulty = 1 | 2 | 3;

export interface Wrong<V> {
  value: V;
  mistakeTag: MistakeTag;
}

/** 템플릿 하나가 한 번 생성하는 문제의 원재료 */
export interface Generated<V = number> {
  text: string;
  answer: V;
  /** 흔한 실수에서 나온 오답. 유효하지 않거나 중복이면 엔진이 거른다. */
  wrongs: Wrong<V>[];
  steps: string[];
  /** 보기 표시 문자열. 중복 판정 기준이기도 하다. */
  format: (v: V) => string;
  /** 문제와 함께 보여줄 표·그래프 */
  figure?: Figure;
  /** 보기를 그래프로 보여줄 때 */
  chart?: (v: V) => ChartSpec;
  /** 오답이 부족할 때 쓸 근접값(k = 1, -1, 2, -2, …). 숫자형 문제만. */
  near?: (k: number) => V | null;
}

export interface Template<V = any> {
  id: string;
  area: AreaId;
  subtype: string;
  difficulty: Difficulty;
  generate(rng: Rng): Generated<V>;
}

export interface Choice {
  label: string;
  /** 정답이면 null */
  mistakeTag: MistakeTag | null;
  chart?: ChartSpec;
}

/** 세트에 들어가는 완성된 문항 */
export interface Problem {
  templateId: string;
  area: AreaId;
  subtype: string;
  difficulty: Difficulty;
  text: string;
  figure?: Figure;
  choices: Choice[];
  answerIndex: number;
  steps: string[];
  /** 근접값으로 채운 보기 수 (validate 통계용) */
  fillers: number;
}
