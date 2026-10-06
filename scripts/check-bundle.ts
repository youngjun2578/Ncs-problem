/**
 * 번들 검사: 빌드 결과물(dist)에 서버 전용 내용이 들어가지 않았는지 확인한다.
 *   npm run build && npx tsx scripts/check-bundle.ts     (발견되면 exit 1)
 *
 * 찾는 것
 *  - 소스맵(.map) 파일
 *  - 틀린 패턴 설명 문구(MISTAKES), 영역 설명, 수준 판정 사유 문구
 *  - 템플릿 id·파일 이름, 서버 모듈 경로
 *  - 실제로 생성한 문항의 해설 문장과 문제 문장
 *  - 서버 비밀 값: SUPABASE_SERVICE_ROLE_KEY·REPORT_TOKEN_SECRET의 이름과 실제 값, sb_secret_ 키 모양, role=service_role JWT
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';
import { TEMPLATES } from '../server/registry.js';
import { AREAS } from '../server/areas.js';
import { MISTAKES } from '../server/engine/mistakes.js';
import { judge } from '../server/report/analyze.js';
import { generateQuestions } from '../server/diagnosis.js';
import { ADVANCED_TEMPLATES } from '../server/advanced/registry.js';

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
// 광고 스크립트는 아직 넣지 않는다(사이트 소유권 확인 meta만 허용)
for (const m of ['adsbygoogle', 'googlesyndication']) add('광고 스크립트', m);
for (const [tag, text] of Object.entries(MISTAKES)) {
  add('실수 유형 이름', tag);
  add('실수 패턴 설명', text);
}
for (const a of AREAS) add('영역 설명', a.description);
for (const [rate, avg, target] of [[1, 1, 75], [1, 999, 75], [0.7, 1, 75], [0, 1, 75]] as const) add('수준 판정 사유', judge(rate, avg, target).reason);
for (const t of TEMPLATES) add('템플릿 id', t.id);
for (const t of ADVANCED_TEMPLATES) add('심화 템플릿 id', t.id);
for (const f of walk('server/templates')) add('템플릿 파일 이름', basename(f));
for (const m of ['server/engine', 'server/templates', 'server/advanced', 'server/report', 'registry.ts', 'analyze.ts', 'buildChoices', 'generateSet', 'studyOrder'])
  add('서버 모듈 이름', m);
// 실제 생성한 문항의 해설·문제 문장 (시드 몇 개)
for (const seed of [1, 2, 3, 12345, 987654321]) {
  for (const q of [...generateQuestions(seed), ...generateQuestions(seed, 'advanced')]) {
    q.steps.forEach((s) => add('해설 문장', s));
    add('문제 문장', q.text);
  }
}
// 이름이 '계산 실수'처럼 짧고 흔한 태그는 4자 미만이면 위에서 빠진다

// 서버 전용 비밀 값: 이름, 실제 값(환경 변수·.env.local에 있으면), 값 모양
for (const m of ['SUPABASE_SERVICE_ROLE_KEY', 'REPORT_TOKEN_SECRET', 'server/accounts', 'setAccountServiceForTests']) add('서버 비밀 값 이름·모듈', m);
const localEnv = (() => {
  try {
    return Object.fromEntries(
      readFileSync('.env.local', 'utf8')
        .split('\n')
        .map((l) => l.match(/^\s*([A-Z_]+)\s*=\s*(.*)\s*$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map((m) => [m[1], m[2]]),
    ) as Record<string, string>;
  } catch {
    return {} as Record<string, string>;
  }
})();
for (const k of ['SUPABASE_SERVICE_ROLE_KEY', 'REPORT_TOKEN_SECRET']) {
  for (const v of [process.env[k], localEnv[k]]) if (v && v.length >= 8) needles.set(v, `${k} 값`);
}
for (const t of texts) {
  // Supabase 비밀 키 모양(sb_secret_ 뒤에 긴 값). 라이브러리 안의 접두어 검사 문자열('sb_secret_')은 해당 없음
  if (/sb_secret_[A-Za-z0-9_-]{16,}/.test(t.text)) problems.push(`Supabase 비밀 키 모양의 값 → ${t.file}`);
  // role이 service_role인 JWT(이전 방식 서비스 키)
  for (const jwt of t.text.match(/eyJ[A-Za-z0-9_-]{8,}\.eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g) ?? []) {
    try {
      if (JSON.parse(Buffer.from(jwt.split('.')[1], 'base64url').toString()).role === 'service_role') problems.push(`service_role JWT → ${t.file}`);
    } catch {
      // JWT가 아님
    }
  }
}

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
console.log(`번들 검사 통과: ${DIST} 파일 ${files.length}개, 검사 문구 ${checked}개(서비스 키 이름·값·모양 포함), 소스맵 없음 (허용 예외 ${ALLOWED.length}건: ${ALLOWED.map((a) => `${a.file} "${a.needle}"`).join(', ')})`);
