/**
 * 번들 검사: 빌드 결과물(dist)에 서버 전용 내용이 들어가지 않았는지 확인한다.
 *   npm run build && npx tsx scripts/check-bundle.ts     (발견되면 exit 1)
 *
 * 찾는 것
 *  - 소스맵(.map) 파일
 *  - 틀린 패턴 설명 문구(MISTAKES), 영역 설명, 수준 판정 사유 문구
 *  - 템플릿 id·파일 이름, 서버 모듈 경로
 *  - 실제로 생성한 문항의 해설 문장과 문제 문장
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { TEMPLATES } from '../server/registry.js';
import { AREAS } from '../server/areas.js';
import { MISTAKES } from '../server/engine/mistakes.js';
import { judge } from '../server/report/analyze.js';
import { generateQuestions } from '../server/diagnosis.js';

const DIST = process.env.DIST ?? 'dist';

/**
 * 이미 공개된 정적 문구라서 허용하는 것 (서버로 옮기기 전부터 HTML에 손으로 쓴 문장이며 엔진 출력이 아니다)
 *  - 메인 페이지 예시 문항 설명의 실수 유형 이름
 *  - 문제 생성 방식 안내 페이지의 근접값 보기 설명
 */
const ALLOWED: { file: string; needle: string }[] = [
  { file: 'index.html', needle: '산술평균 착각' },
  { file: 'method/index.html', needle: '계산 실수' },
];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = walk(DIST);
const problems: string[] = [];

for (const f of files) if (f.endsWith('.map')) problems.push(`소스맵 파일: ${f}`);
const texts = files
  .filter((f) => /\.(js|mjs|css|html|txt|xml|json|svg)$/.test(f))
  .map((f) => ({ file: f, rel: f.slice(DIST.length + 1), text: readFileSync(f, 'utf8') }));
for (const t of texts) if (/sourceMappingURL/.test(t.text)) problems.push(`소스맵 참조: ${t.file}`);

const needles = new Map<string, string>();
const add = (kind: string, s: string) => {
  if (s && s.length >= 4) needles.set(s, kind);
};
for (const [tag, text] of Object.entries(MISTAKES)) {
  add('실수 유형 이름', tag);
  add('실수 패턴 설명', text);
}
for (const a of AREAS) add('영역 설명', a.description);
for (const [rate, avg, target] of [[1, 1, 75], [1, 999, 75], [0.7, 1, 75], [0, 1, 75]] as const) add('수준 판정 사유', judge(rate, avg, target).reason);
for (const t of TEMPLATES) add('템플릿 id', t.id);
for (const f of walk('server/templates')) add('템플릿 파일 이름', basename(f));
for (const m of ['server/engine', 'server/templates', 'server/report', 'registry.ts', 'analyze.ts', 'buildChoices', 'generateSet', 'studyOrder'])
  add('서버 모듈 이름', m);
// 실제 생성한 문항의 해설·문제 문장 (시드 몇 개)
for (const seed of [1, 2, 3, 12345, 987654321]) {
  for (const q of generateQuestions(seed)) {
    q.steps.forEach((s) => add('해설 문장', s));
    add('문제 문장', q.text);
  }
}
// 이름이 '계산 실수'처럼 짧고 흔한 태그는 4자 미만이면 위에서 빠진다

let checked = 0;
for (const [needle, kind] of needles) {
  checked++;
  for (const t of texts) {
    if (!t.text.includes(needle)) continue;
    if (ALLOWED.some((a) => a.file === t.rel && a.needle === needle)) continue;
    problems.push(`${kind} "${needle.slice(0, 40)}" → ${t.file}`);
  }
}

if (problems.length) {
  console.error(`서버 전용 내용 발견 ${problems.length}건:`);
  problems.slice(0, 80).forEach((p) => console.error('- ' + p));
  process.exit(1);
}
console.log(`번들 검사 통과: dist 파일 ${files.length}개, 검사 문구 ${checked}개, 소스맵 없음 (허용 예외 ${ALLOWED.length}건: ${ALLOWED.map((a) => `${a.file} "${a.needle}"`).join(', ')})`);
