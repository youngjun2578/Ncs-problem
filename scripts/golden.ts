/**
 * 골든 스냅샷 생성: 코드를 서버로 옮기기 전의 출력을 기준값으로 저장한다.
 *   npx tsx scripts/golden.ts            → tests/golden/golden.jsonl.gz 생성
 *
 * 시드마다 12문항(문구·보기·도표·정답·해설)과,
 * 답 패턴 3가지(전부 정답 / 전부 오답 / 섞음) × 시드별로 다른 풀이 시간에 대한 리포트 전체를 저장한다.
 * 한 줄에 시드 하나(JSON Lines).
 *
 * 주의: 이 파일은 서버 이전 전 코드로 한 번 만든 기준값이다. 다시 실행하면 기준이 현재 코드로 바뀌므로,
 * 엔진·템플릿·리포트 규칙을 의도적으로 바꾼 경우에만 다시 만든다. 비교는 scripts/golden-compare.ts.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { TEMPLATES } from '../server/registry.js';
import { AREAS, AREA_BY_ID } from '../server/areas.js';
import { generateSet } from '../server/engine/set.js';
import { analyze, type Attempt } from '../server/report/analyze.js';
import type { Problem } from '../server/engine/types.js';

export const GOLDEN_FILE = 'tests/golden/golden.jsonl.gz';
export const SEED_COUNT = 40;
export const PER_AREA = 3;
/** 재현 가능한 고정 시드: 작은 수와 32비트 전 범위를 고루 섞는다 */
export const goldenSeeds = () => Array.from({ length: SEED_COUNT }, (_, i) => (i < 10 ? i + 1 : Math.imul(i + 1, 2654435761) >>> 0));

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/** 답 패턴과 풀이 시간. 시드 순번 s에 따라 시간이 달라지게 한다. */
export function inputsFor(qs: Problem[], s: number) {
  const target = (q: Problem) => AREA_BY_ID[q.area].targetSec;
  const correct = {
    pattern: 'allCorrect',
    picked: qs.map((q) => q.answerIndex),
    // 짝수 시드는 빠르게, 홀수 시드는 권장 시간 1.5배를 넘겨 '모두 맞혔지만 느림' 규칙을 탄다
    secs: qs.map((q, i) => round3(s % 2 === 0 ? 12 + ((i * 7 + s) % 40) + 0.25 : target(q) * 1.5 + 5 + ((i + s) % 30) + 0.5)),
  };
  const wrong = {
    pattern: 'allWrong',
    picked: qs.map((q, i) => (q.answerIndex + 1 + ((i + s) % 4)) % q.choices.length),
    secs: qs.map((_, i) => round3(3 + i * 1.5 + (s % 5) * 0.75)),
  };
  const mixed = {
    pattern: 'mixed',
    // 영역마다 맞힌 개수가 0~3개로 고르게 섞이도록 시드·문항 번호로 정한다
    picked: qs.map((q, i) => (((i * 5 + s * 3) % 7) < 3 ? (q.answerIndex + 2 + (s % 3)) % q.choices.length : q.answerIndex)),
    secs: qs.map((_, i) => round3(((i * 37 + s * 13) % 200) + 0.5 + (i % 3) * 0.125)),
  };
  return [correct, wrong, mixed];
}

function snapshotReport(qs: Problem[], picked: number[], secs: number[]) {
  const attempts: Attempt[] = picked.map((p, i) => ({ picked: p, sec: secs[i] }));
  // 기존 클라이언트와 같은 방식: 총 시간 = 문항별 시간 합의 반올림
  const totalSec = Math.round(secs.reduce((a, b) => a + b, 0));
  const r = analyze(qs, attempts, totalSec);
  return {
    totalSec,
    correct: r.correct,
    total: r.total,
    priority: r.priority.map((a) => a.meta.id),
    areas: r.areas.map((a) => ({ ...a, meta: { ...a.meta } })),
  };
}

if (process.argv[1]?.endsWith('golden.ts')) {
  const areas = AREAS.filter((a) => TEMPLATES.some((t) => t.area === a.id)).map((a) => a.id);
  const lines: string[] = [];
  goldenSeeds().forEach((seed, s) => {
    const qs = generateSet(TEMPLATES, seed, { areas, perArea: PER_AREA });
    const runs = inputsFor(qs, s).map((inp) => ({ ...inp, report: snapshotReport(qs, inp.picked, inp.secs) }));
    lines.push(JSON.stringify({ seed, questions: qs, runs }));
  });
  mkdirSync('tests/golden', { recursive: true });
  // 원본 JSON Lines는 약 1.1MB라서 gzip으로 저장한다(약 140KB). 읽을 때는 gunzipSync.
  writeFileSync(GOLDEN_FILE, gzipSync(lines.join('\n') + '\n', { level: 9 }));
  console.log(`골든 스냅샷 저장: ${GOLDEN_FILE} (시드 ${lines.length}개 × 패턴 3개)`);
}
