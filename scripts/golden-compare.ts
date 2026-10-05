/**
 * 골든 스냅샷 비교: 서버 코드의 출력이 이전 전 기준값(tests/golden/golden.jsonl.gz)과 같은지 본다.
 *   npx tsx scripts/golden-compare.ts      (다르면 목록을 출력하고 exit 1)
 *
 * 비교 대상
 *  - 세션 응답(문항): 문구, 보기(표시 문자열·그래프), 도표, 영역
 *  - 리포트 응답: meta, summary, areaDetails, explanations 의 모든 필드
 *  - 서버 내부 분석 결과 전체(analyze): 응답에 싣지 않는 학습 순서·우선순위까지
 */
import { readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { composeReportResponse, generateQuestions, score, toPublicQuestion } from '../server/diagnosis.js';
import { AREA_BY_ID } from '../server/areas.js';

const FILE = 'tests/golden/golden.jsonl.gz';
const LEVEL_LABEL: Record<string, string> = { stable: '안정', improve: '보완 필요', focus: '집중 필요' };

const diffs: string[] = [];
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));
function same(where: string, got: unknown, want: unknown) {
  if (!isDeepStrictEqual(plain(got), plain(want))) {
    diffs.push(`${where}\n    기대: ${JSON.stringify(want)?.slice(0, 300)}\n    결과: ${JSON.stringify(got)?.slice(0, 300)}`);
  }
}

const lines = gunzipSync(readFileSync(FILE)).toString('utf8').trim().split('\n');
let runs = 0;
for (const line of lines) {
  const snap = JSON.parse(line);
  const tag = `seed=${snap.seed}`;
  const qs = generateQuestions(snap.seed);
  same(`${tag} 문항 전체(서버 내부)`, qs, snap.questions);

  // 세션 응답: 화면용 필드만, 정답·해설 없이
  qs.forEach((q, i) => {
    const want = snap.questions[i];
    const pub = toPublicQuestion(q);
    const expected: Record<string, unknown> = {
      area: want.area,
      areaName: AREA_BY_ID[want.area as keyof typeof AREA_BY_ID].name,
      text: want.text,
      choices: want.choices.map((c: { label: string; chart?: unknown }) => (c.chart ? { label: c.label, chart: c.chart } : { label: c.label })),
    };
    if (want.figure) expected.figure = want.figure;
    same(`${tag} 세션 문항 ${i + 1}`, pub, expected);
  });

  for (const run of snap.runs) {
    runs++;
    const where = `${tag} ${run.pattern}`;
    const full = score(qs, run.picked, run.secs);
    // 서버 내부 분석 결과 전체 (응답에 싣지 않는 study·priority 포함)
    same(`${where} 분석 totalSec`, full.report.totalSec, run.report.totalSec);
    same(`${where} 분석 correct/total`, [full.report.correct, full.report.total], [run.report.correct, run.report.total]);
    same(`${where} 분석 priority`, full.report.priority.map((a) => a.meta.id), run.report.priority);
    same(`${where} 분석 areas`, full.report.areas, run.report.areas);

    const res = composeReportResponse(full);
    const areas = run.report.areas;
    same(`${where} meta`, res.meta, { total: run.report.total, correct: run.report.correct, totalSec: run.report.totalSec, perArea: areas[0].total });
    same(
      `${where} summary`,
      res.summary,
      areas.map((a: any) => ({
        areaId: a.meta.id,
        name: a.meta.name,
        correct: a.correct,
        total: a.total,
        ratePct: Math.round(a.rate * 100),
        avgSec: a.avgSec,
        level: a.level,
        levelLabel: LEVEL_LABEL[a.level],
      })),
    );
    same(
      `${where} areaDetails`,
      res.areaDetails,
      areas.map((a: any) => ({
        areaId: a.meta.id,
        description: a.meta.description,
        correct: a.correct,
        total: a.total,
        ratePct: Math.round(a.rate * 100),
        avgSec: a.avgSec,
        targetSec: a.meta.targetSec,
        weakSubtypes: a.weakSubtypes,
        levelReason: a.levelReason,
        patterns: a.patterns,
      })),
    );
    same(
      `${where} explanations`,
      res.explanations,
      snap.questions.map((q: any, i: number) => {
        const picked = run.picked[i];
        const ok = picked === q.answerIndex;
        const e: Record<string, unknown> = {
          areaName: AREA_BY_ID[q.area as keyof typeof AREA_BY_ID].name,
          subtype: q.subtype,
          text: q.text,
          choices: q.choices.map((c: any) => (c.chart ? { label: c.label, chart: c.chart } : { label: c.label })),
          picked,
          answerIndex: q.answerIndex,
          isCorrect: ok,
          pickedMistakeTag: ok ? null : (q.choices[picked]?.mistakeTag ?? null),
          steps: q.steps,
        };
        if (q.figure) e.figure = q.figure;
        return e;
      }),
    );
  }
}

if (diffs.length) {
  console.error(`골든 스냅샷과 다른 항목 ${diffs.length}개:`);
  diffs.slice(0, 50).forEach((d) => console.error('- ' + d));
  process.exit(1);
}
console.log(`골든 스냅샷 일치: 시드 ${lines.length}개, 입력 ${runs}개 (문항·세션 응답·리포트 세 구역·내부 분석 전체)`);
