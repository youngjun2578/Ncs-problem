/**
 * 진단 세트 생성과 채점·리포트. HTTP와 무관한 순수 로직이라 골든 스냅샷 비교에서도 그대로 쓴다.
 */
import { TEMPLATES } from './registry.js';
import { AREAS, AREA_BY_ID } from './areas.js';
import { generateSet } from './engine/set.js';
import type { Problem } from './engine/types.js';
import { analyze, LEVEL_LABEL, type Report } from './report/analyze.js';
import type { Explanation, PublicChoice, PublicQuestion, ReportResponse } from '../shared/api.js';

export const PER_AREA = 3;
const AREA_IDS = AREAS.filter((a) => TEMPLATES.some((t) => t.area === a.id)).map((a) => a.id);
export const QUESTION_COUNT = AREA_IDS.length * PER_AREA;

export function generateQuestions(genSeed: number): Problem[] {
  return generateSet(TEMPLATES, genSeed, { areas: AREA_IDS, perArea: PER_AREA });
}

/** 보기에서 정답 여부·실수 유형을 빼고 표시용 값만 남긴다 */
function publicChoices(p: Problem): PublicChoice[] {
  return p.choices.map((c) => (c.chart ? { label: c.label, chart: c.chart } : { label: c.label }));
}

/** 풀이 화면용 문항. 필요한 필드만 골라 담는다(정답·해설·템플릿 정보는 넣지 않는다). */
export function toPublicQuestion(p: Problem): PublicQuestion {
  const q: PublicQuestion = { area: p.area, areaName: AREA_BY_ID[p.area].name, text: p.text, choices: publicChoices(p) };
  if (p.figure) q.figure = p.figure;
  return q;
}

/** 채점과 분석 결과 전체 (서버 안에서만 쓴다) */
export interface FullResult {
  qs: Problem[];
  answers: number[];
  report: Report;
}

export function score(qs: Problem[], answers: number[], secs: number[]): FullResult {
  const attempts = answers.map((picked, i) => ({ picked, sec: secs[i] }));
  // 총 풀이 시간 = 문항별 시간 합의 반올림 (이전 브라우저 계산과 같은 기준)
  const totalSec = Math.round(secs.reduce((a, b) => a + b, 0));
  return { qs, answers, report: analyze(qs, attempts, totalSec) };
}

const pct = (r: number) => Math.round(r * 100);

function explanation(q: Problem, picked: number): Explanation {
  const isCorrect = picked === q.answerIndex;
  const e: Explanation = {
    areaName: AREA_BY_ID[q.area].name,
    subtype: q.subtype,
    text: q.text,
    choices: publicChoices(q),
    picked,
    answerIndex: q.answerIndex,
    isCorrect,
    pickedMistakeTag: isCorrect ? null : (q.choices[picked]?.mistakeTag ?? null),
    steps: q.steps,
  };
  if (q.figure) e.figure = q.figure;
  return e;
}

/**
 * 응답을 만드는 유일한 지점.
 * 다음 단계(무료/유료 구분)에서는 여기서 areaDetails·explanations 등 구역을 잘라 낸다.
 * 지금은 아무것도 자르지 않고 전부 돌려준다.
 */
export function composeReportResponse(full: FullResult): ReportResponse {
  const { qs, answers, report: r } = full;
  return {
    meta: { total: r.total, correct: r.correct, totalSec: r.totalSec, perArea: r.areas[0]?.total ?? 0 },
    summary: r.areas.map((a) => ({
      areaId: a.meta.id,
      name: a.meta.name,
      correct: a.correct,
      total: a.total,
      ratePct: pct(a.rate),
      avgSec: a.avgSec,
      level: a.level,
      levelLabel: LEVEL_LABEL[a.level],
    })),
    areaDetails: r.areas.map((a) => ({
      areaId: a.meta.id,
      description: a.meta.description,
      correct: a.correct,
      total: a.total,
      ratePct: pct(a.rate),
      avgSec: a.avgSec,
      targetSec: a.meta.targetSec,
      weakSubtypes: a.weakSubtypes,
      levelReason: a.levelReason,
      patterns: a.patterns.map((p) => ({ tag: p.tag, count: p.count, text: p.text })),
    })),
    explanations: qs.map((q, i) => explanation(q, answers[i])),
  };
}
