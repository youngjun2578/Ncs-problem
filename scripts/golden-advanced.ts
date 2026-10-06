/**
 * 심화 골든 스냅샷. 기본 골든(tests/golden/golden.jsonl.gz)과 따로 둔다.
 *   npx tsx scripts/golden-advanced.ts           비교(다르면 exit 1)
 *   npx tsx scripts/golden-advanced.ts --write   기준 파일 생성(심화 템플릿·규칙을 의도적으로 바꾼 경우에만)
 *
 * 시드마다 심화 12문항 전체(문장·보기·도표·정답·해설)와,
 * 답 패턴 3가지(전부 정답 / 전부 오답 / 섞음)의 채점 응답 전체(meta.level 포함)와 내부 분석 결과를 저장한다.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import { isDeepStrictEqual } from 'node:util';
import { composeReportResponse, generateQuestions, score } from '../server/diagnosis.js';
import { goldenSeeds, inputsFor } from './golden.js';

const FILE = 'tests/golden/advanced.jsonl.gz';
const plain = <T>(x: T): T => JSON.parse(JSON.stringify(x));

function snapshot(seed: number, s: number) {
  const qs = generateQuestions(seed, 'advanced');
  const runs = inputsFor(qs, s).map((inp) => {
    const full = score(qs, inp.picked, inp.secs, 'advanced');
    return { ...inp, report: { priority: full.report.priority.map((a) => a.meta.id), areas: full.report.areas }, response: composeReportResponse(full) };
  });
  return plain({ seed, questions: qs, runs });
}

const seeds = goldenSeeds();
if (process.argv.includes('--write')) {
  const lines = seeds.map((seed, s) => JSON.stringify(snapshot(seed, s)));
  mkdirSync('tests/golden', { recursive: true });
  writeFileSync(FILE, gzipSync(lines.join('\n') + '\n', { level: 9 }));
  console.log(`심화 골든 저장: ${FILE} (시드 ${lines.length}개 × 패턴 3개)`);
} else {
  const lines = gunzipSync(readFileSync(FILE)).toString('utf8').trim().split('\n');
  const diffs: string[] = [];
  lines.forEach((line, s) => {
    const want = JSON.parse(line);
    const got = snapshot(want.seed, s);
    if (!isDeepStrictEqual(got.questions, want.questions)) diffs.push(`seed=${want.seed} 문항`);
    got.runs.forEach((r, i) => {
      if (!isDeepStrictEqual(r, want.runs[i])) diffs.push(`seed=${want.seed} ${r.pattern} 채점`);
    });
  });
  if (diffs.length) {
    console.error(`심화 골든과 다른 항목 ${diffs.length}개:`);
    diffs.slice(0, 30).forEach((d) => console.error(' - ' + d));
    process.exit(1);
  }
  console.log(`심화 골든 일치: 시드 ${lines.length}개, 입력 ${lines.length * 3}개 (문항·채점 응답·내부 분석, meta.level 포함)`);
}
