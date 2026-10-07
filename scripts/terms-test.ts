/**
 * 약관·환불 안내 초안(/terms/) 시험. 실패하면 exit 1.
 *   npx tsx scripts/terms-test.ts
 *
 * 1) check-production의 약관 초안 검사(임시 dist로)
 *    - Production + 결제 켜짐 + 초안 표시가 남은 약관 → 실패(음성 시험: 표시를 일부러 남김)
 *    - 표시를 모두 지운 약관 → 통과, Preview → 통과, 결제 꺼짐(약관 없음) → 통과
 * 2) 지금 dist(있으면)가 스위치와 맞는지
 *    - 약관 페이지를 만드는 빌드(VITE_PAYMENTS_ENABLED·VITE_MONETIZATION_ENABLED 모두 "true"): terms/index.html 있음, noindex,
 *      sitemap에 없음, 꼬리말 링크 있음
 *    - 그 밖의 빌드: terms/ 없음, 꼬리말 링크 없음, sitemap·robots에 terms 없음
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let passed = 0;
let failed = 0;
const ok = (c: unknown, m: string) => {
  if (c) passed++;
  else {
    failed++;
    console.log(`FAIL ${m}`);
  }
};

// 1) check-production
const SOURCE = readFileSync('terms/index.html', 'utf8');
const CLEAN_FOOTER = '<footer><a href="/privacy/">개인정보처리방침</a><a href="/terms/">이용 약관·환불 안내</a></footer>';
const DRAFT_FOOTER = '<footer><a href="/privacy/">개인정보처리방침</a><a href="/terms/">이용 약관·환불 안내(초안)</a></footer>';
/** 초안 표시를 모두 지운 약관(공개 준비가 끝난 모습을 흉내) */
const cleaned = SOURCE.replace(/<div class="draft-banner"[\s\S]*?<\/div>\n/, '')
  .replace(/\(초안\)/g, '')
  .replace(/초안/g, '')
  .replace(/\[입력 필요\]/g, '채운 값')
  .replace(/\[확인 필요[^\]]*\]/g, '확인한 내용')
  .replace(/%VITE_CONTACT_EMAIL%/g, 'help@ncs-terms-test.invalid');

function fakeDist(files: Record<string, string>) {
  const d = mkdtempSync(join(tmpdir(), 'terms-test-'));
  for (const [f, t] of Object.entries(files)) {
    mkdirSync(join(d, f, '..'), { recursive: true });
    writeFileSync(join(d, f), t);
  }
  return d;
}
const run = (dist: string, env: Record<string, string>) => {
  const r = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/check-production.ts'], {
    env: { PATH: process.env.PATH, DIST: dist, ...env },
    encoding: 'utf8',
  });
  return { status: r.status, out: `${r.stdout}${r.stderr}` };
};
const PROD_PAY = { VERCEL_ENV: 'production', VITE_PAYMENTS_ENABLED: 'true' };
const cases: [string, Record<string, string>, Record<string, string>, number, string?][] = [
  ['Production + 결제 켜짐 + 초안 그대로(저장소의 terms/index.html)', { 'index.html': DRAFT_FOOTER, 'terms/index.html': SOURCE }, PROD_PAY, 1, '약관 초안 검사 실패'],
  ['Production + 결제 켜짐 + "[입력 필요]"만 남김', { 'index.html': CLEAN_FOOTER, 'terms/index.html': cleaned.replace('채운 값', '[입력 필요]') }, PROD_PAY, 1, '"[입력 필요]"'],
  ['Production + 결제 켜짐 + "초안" 문구만 남김', { 'index.html': CLEAN_FOOTER, 'terms/index.html': cleaned.replace('<h1 class="title">', '<h1 class="title">초안 ') }, PROD_PAY, 1, '"초안"'],
  ['Production + 결제 켜짐 + "[확인 필요"만 남김', { 'index.html': CLEAN_FOOTER, 'terms/index.html': cleaned.replace('확인한 내용', '[확인 필요: 테스트]') }, PROD_PAY, 1, '"[확인 필요"'],
  ['Production + 결제 켜짐 + 약관은 깨끗하지만 꼬리말에 "(초안)" 링크', { 'index.html': DRAFT_FOOTER, 'terms/index.html': cleaned }, PROD_PAY, 1, '꼬리말'],
  ['Production + 결제 켜짐 + 표시를 모두 지움', { 'index.html': CLEAN_FOOTER, 'terms/index.html': cleaned }, PROD_PAY, 0],
  ['Production + 결제 꺼짐 + 약관 없음', { 'index.html': '<footer><a href="/privacy/">개인정보처리방침</a></footer>' }, { VERCEL_ENV: 'production' }, 0],
  ['Production + 결제 스위치 없음인데 약관 페이지가 있음(초안)', { 'index.html': CLEAN_FOOTER, 'terms/index.html': SOURCE }, { VERCEL_ENV: 'production' }, 1, '약관 초안 검사 실패'],
  ['Preview + 결제 켜짐 + 초안 그대로', { 'index.html': DRAFT_FOOTER, 'terms/index.html': SOURCE }, { VERCEL_ENV: 'preview', VITE_PAYMENTS_ENABLED: 'true' }, 0],
];
ok(!/초안|\[입력 필요\]|\[확인 필요/.test(cleaned), '시험용 "깨끗한 약관"에 초안 표시가 남지 않음');
for (const [name, files, env, want, needle] of cases) {
  const d = fakeDist(files);
  const r = run(d, env);
  ok(r.status === want && (!needle || r.out.includes(needle)), `check-production: ${name} → exit ${want} (${r.status})`);
  rmSync(d, { recursive: true, force: true });
}

// 2) 지금 dist
const DIST = process.env.DIST ?? 'dist';
if (!existsSync(join(DIST, 'index.html'))) console.log(`dist 검사: 건너뜀(${DIST}/index.html 없음)`);
else {
  const on = process.env.VITE_PAYMENTS_ENABLED === 'true' && process.env.VITE_MONETIZATION_ENABLED === 'true';
  const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
  const html = walk(DIST).filter((f) => f.endsWith('.html') && !f.endsWith(join('terms', 'index.html')));
  const withLink = html.filter((f) => readFileSync(f, 'utf8').includes('href="/terms/"'));
  const sitemap = readFileSync(join(DIST, 'sitemap.xml'), 'utf8');
  const robots = readFileSync(join(DIST, 'robots.txt'), 'utf8');
  const tag = on ? '약관 켜진 빌드' : '약관 꺼진 빌드';
  ok(!sitemap.includes('/terms/') && !robots.includes('terms'), `${tag}: sitemap·robots에 terms 없음`);
  if (on) {
    const t = readFileSync(join(DIST, 'terms', 'index.html'), 'utf8');
    ok(/<meta name="robots" content="noindex">/.test(t), `${tag}: terms/index.html은 noindex`);
    ok(t.includes('초안 · 법률 검토 전') && t.indexOf('초안 · 법률 검토 전') < t.indexOf('<h1'), `${tag}: 맨 위에 "초안 · 법률 검토 전" 표시`);
    ok(!/<link rel="canonical"/.test(t), `${tag}: canonical 없음`);
    ok(!/PAYMENTS_ENABLED|MONETIZATION_ENABLED|docs\//.test(t), `${tag}: 설정 이름·내부 문서 경로가 페이지에 없음`);
    ok(withLink.length === html.length, `${tag}: 모든 페이지 꼬리말에 약관 링크 (${withLink.length}/${html.length})`);
  } else {
    ok(!existsSync(join(DIST, 'terms')), `${tag}: dist에 terms/ 없음`);
    ok(withLink.length === 0, `${tag}: 꼬리말 약관 링크 없음 (${withLink.length})`);
    ok(walk(DIST).every((f) => !readFileSync(f).includes('draft-banner')), `${tag}: 약관 초안 스타일·문구가 결과물에 없음`);
  }
}

console.log(`\n약관 초안 시험: 통과 ${passed}, 실패 ${failed}`);
if (failed) process.exit(1);
