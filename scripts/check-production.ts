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
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DIST = process.env.DIST ?? 'dist';
if (process.env.VERCEL_ENV !== 'production') {
  console.log(`Production 자리 표시 검사: 건너뜀 (VERCEL_ENV=${process.env.VERCEL_ENV ?? '없음'})`);
  process.exit(0);
}

const NEEDLES = ['example.com', '[입력', '[운영자 이름]', '%VITE_'];
const walk = (d: string): string[] => readdirSync(d).flatMap((f) => (statSync(join(d, f)).isDirectory() ? walk(join(d, f)) : [join(d, f)]));
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
