/**
 * Production 배포 전용 검사: 자리 표시 값이 결과물에 남아 있으면 빌드를 멈춘다.
 *   npx tsx scripts/check-production.ts      (DIST 기본값 dist)
 *
 * VERCEL_ENV가 "production"일 때만 검사한다. 로컬과 Preview 빌드는 그냥 통과한다
 * (저장소의 .env에는 example.com·[운영자 이름] 같은 자리 표시만 있으므로).
 *
 * 찾는 문자열
 *  - example.com    : VITE_SITE_URL·VITE_CONTACT_EMAIL 자리 표시
 *  - [입력          : 초안 문서의 "[입력 필요]" 류
 *  - [운영자 이름]  : VITE_OPERATOR_NAME 자리 표시
 *  - %VITE_         : 값이 없어 바뀌지 않은 환경 변수 자리
 *
 * 결제: Production에 가짜 결제사(PAYMENT_PROVIDER=fake)가 설정되어 있으면 빌드를 멈춘다(서버도 따로 거부한다).
 *
 * 약관 초안: 결제 스위치(VITE_PAYMENTS_ENABLED=true)가 켜진 Production 빌드에서 /terms/에 초안 표시
 * ("초안", "[입력 필요]", "[확인 필요")가 남아 있거나, 다른 페이지 꼬리말에 "(초안)" 링크가 남아 있으면 빌드를 멈춘다.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.env.DIST ?? 'dist';
if (process.env.VERCEL_ENV !== 'production') {
  console.log(`Production 자리 표시 검사: 건너뜀 (VERCEL_ENV=${process.env.VERCEL_ENV ?? '없음'})`);
  process.exit(0);
}

if (process.env.PAYMENT_PROVIDER === 'fake') {
  console.error('Production 검사 실패: 가짜 결제사(PAYMENT_PROVIDER=fake)는 Production에 둘 수 없습니다. Vercel 환경 변수에서 Production 값을 지우세요.');
  process.exit(1);
}

const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));

// 약관 초안: 결제가 켜진 빌드(또는 약관 페이지가 만들어진 빌드)
const TERMS = join(DIST, 'terms', 'index.html');
if (process.env.VITE_PAYMENTS_ENABLED === 'true' || existsSync(TERMS)) {
  const termsProblems: string[] = [];
  if (existsSync(TERMS)) {
    const t = readFileSync(TERMS, 'utf8');
    for (const n of ['초안', '[입력 필요]', '[확인 필요']) if (t.includes(n)) termsProblems.push(`terms/index.html: "${n}"`);
  }
  for (const f of walk(DIST).filter((f) => f.endsWith('.html')))
    if (readFileSync(f, 'utf8').includes('환불 안내(초안)')) termsProblems.push(`${f.slice(DIST.length + 1)}: 꼬리말 "(초안)" 링크`);
  if (termsProblems.length) {
    console.error(`Production 약관 초안 검사 실패 ${termsProblems.length}건 (약관·환불 안내가 아직 초안입니다. docs/terms-draft-notes.md의 채울 항목과 확인 항목을 끝낸 뒤 초안 표시를 지우세요):`);
    termsProblems.slice(0, 40).forEach((p) => console.error(' - ' + p));
    process.exit(1);
  }
}

const NEEDLES = ['example.com', '[입력', '[운영자 이름]', '%VITE_'];
const problems: string[] = [];
for (const f of walk(DIST).filter((f) => /\.(html|xml|txt|js|css|json)$/.test(f))) {
  const t = readFileSync(f, 'utf8');
  for (const n of NEEDLES) if (t.includes(n)) problems.push(`${f.slice(DIST.length + 1)}: "${n}"`);
}
if (problems.length) {
  console.error(`Production 자리 표시 검사 실패 ${problems.length}건 (Vercel 환경 변수 VITE_SITE_URL·VITE_CONTACT_EMAIL·VITE_OPERATOR_NAME을 확인하세요):`);
  problems.slice(0, 40).forEach((p) => console.error(' - ' + p));
  process.exit(1);
}
console.log('Production 자리 표시 검사 통과');
