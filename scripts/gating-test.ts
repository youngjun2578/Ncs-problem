/**
 * 기능 스위치·로그인·이용권에 따른 채점 응답 나누기 테스트.
 *   npx tsx scripts/gating-test.ts      (실패하면 exit 1)
 *
 * 모의 Supabase(scripts/mock-supabase.ts)를 띄우고 실제 supabase-js 코드 경로(server/accounts.ts)로 검증한다.
 *  - 스위치 꺼짐: 로그인 헤더를 무시하고 이전과 똑같은 전체 응답(gated 필드 없음)
 *  - 켜짐: 게스트 / 로그인했지만 이용권 없음 → 무료 응답, 이용권 있음 → 전체
 *  - 만료·변조·다른 키·모양이 틀린 토큰 → 401, 인증 서버·DB 장애 → 503
 *  - 무료 응답 본문에 3~12번 해설 문장, 영역별 상세 문구가 없는지 검색
 *  - 요청 본문에 이용권 값을 넣어도 무시
 *  - 계정 삭제
 *  - 카카오 로그인 스위치: 켜진 빌드(이용권 켜짐, 카카오 꺼짐)의 dist에 카카오 버튼·안내 문구가 없는지
 */
import { isDeepStrictEqual } from 'node:util';
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { build } from 'vite';
import { handleAccountDelete, handleReport, handleSession } from '../server/handlers.js';
import { generationSeed, verifyToken } from '../server/token.js';
import { composeReportResponse, generateQuestions, score } from '../server/diagnosis.js';
import { AREAS } from '../server/areas.js';
import { MISTAKES } from '../server/engine/mistakes.js';
import { judge } from '../server/report/analyze.js';
import type { ReportResponse, SessionResponse } from '../shared/api.js';
import { MOCK_SERVICE_KEY, MOCK_USERS, startMockSupabase, userToken } from './mock-supabase.js';

const SECRET = 'gating-test-secret-0123456789-abcdefghij';
process.env.REPORT_TOKEN_SECRET = SECRET;

let passed = 0;
let failed = 0;
const ok = (c: unknown, m: string) => {
  if (c) passed++;
  else {
    failed++;
    console.log('FAIL ' + m);
  }
};

// 빈 포트에 띄워 단독 실행 중인 모의 서버(54329)와 겹치지 않게 한다
const mock = await startMockSupabase(0);
const setMock = (s: Record<string, unknown>) => fetch(`${mock.url}/__mock/state`, { method: 'POST', body: JSON.stringify(s) });

function onEnv() {
  process.env.MONETIZATION_ENABLED = 'true';
  process.env.VITE_SUPABASE_URL = mock.url;
  process.env.SUPABASE_SERVICE_ROLE_KEY = MOCK_SERVICE_KEY;
}
function offEnv() {
  delete process.env.MONETIZATION_ENABLED;
  delete process.env.VITE_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
}

async function newSession() {
  const r = await handleSession(new Request('http://x/api/session', { method: 'POST' }));
  const s = (await r.json()) as SessionResponse;
  const v = verifyToken(SECRET, s.token);
  if (!v.ok) throw new Error('세션 토큰 오류');
  const qs = generateQuestions(generationSeed(SECRET, v.body.s));
  // 섞어서: 영역마다 맞힘·틀림이 섞이고 틀린 패턴 문구가 생기게
  const answers = qs.map((q, i) => (i % 3 === 0 ? (q.answerIndex + 1) % q.choices.length : q.answerIndex));
  const secs = qs.map(() => 0.5);
  return { status: r.status, token: s.token, qs, answers, secs };
}

async function report(sess: Awaited<ReturnType<typeof newSession>>, auth?: string, extra: Record<string, unknown> = {}) {
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (auth !== undefined) headers.authorization = auth;
  const res = await handleReport(
    new Request('http://x/api/report', { method: 'POST', headers, body: JSON.stringify({ token: sess.token, answers: sess.answers, secs: sess.secs, ...extra }) }),
  );
  const text = await res.text();
  return { status: res.status, text, json: JSON.parse(text) as ReportResponse & { error?: string } };
}

/** 무료 응답 본문에 있으면 안 되는 문구: 3~12번 해설 문장, 영역 설명, 수준 판정 사유, 틀린 패턴 설명 */
function lockedNeedles(sess: Awaited<ReturnType<typeof newSession>>) {
  const full = composeReportResponse(score(sess.qs, sess.answers, sess.secs));
  const needles: string[] = [];
  sess.qs.slice(2).forEach((q) => needles.push(...q.steps));
  AREAS.forEach((a) => needles.push(a.description));
  [[1, 1, 75], [1, 999, 75], [0.7, 1, 75], [0, 1, 75]].forEach(([r, s, t]) => needles.push(judge(r, s, t).reason));
  Object.values(MISTAKES).forEach((t) => needles.push(t));
  full.areaDetails.forEach((d) => needles.push(...d.patterns.map((p) => p.text), d.levelReason, d.description));
  return { full, needles: [...new Set(needles)].filter((n) => n.length >= 6) };
}

function checkFree(tag: string, r: Awaited<ReturnType<typeof report>>, sess: Awaited<ReturnType<typeof newSession>>) {
  const { full, needles } = lockedNeedles(sess);
  ok(r.status === 200, `${tag}: 200 (${r.status} ${r.json.error ?? ''})`);
  ok(r.json.gated === true, `${tag}: gated=true`);
  ok(isDeepStrictEqual(r.json.summary, full.summary) && isDeepStrictEqual(r.json.meta, full.meta), `${tag}: 요약·머리말은 전체와 같음`);
  ok(r.json.areaDetails.length === 0, `${tag}: 영역별 상세 없음`);
  ok(r.json.explanations.length === 2 && isDeepStrictEqual(r.json.explanations, full.explanations.slice(0, 2)), `${tag}: 해설은 1·2번만, 내용은 전체와 같음`);
  const leaked = needles.filter((n) => r.text.includes(n));
  ok(leaked.length === 0, `${tag}: 본문에 잠긴 문구 없음 (검사 ${needles.length}개, 발견 ${leaked.length}: ${leaked.slice(0, 2).join(' | ')})`);
  // 검사가 실제로 잡는지: 전체 응답에는 잠긴 문구가 들어 있어야 한다
  const fullText = JSON.stringify(full);
  ok(needles.filter((n) => fullText.includes(n)).length > 10, `${tag}: (대조) 전체 응답에는 잠긴 문구가 들어 있음`);
}

try {
  // ---- 스위치 꺼짐: 이전과 같음
  offEnv();
  {
    const s = await newSession();
    ok(s.status === 200, '꺼짐: 세션 200');
    for (const auth of [undefined, `Bearer ${userToken('google')}`, 'Bearer garbage', 'Basic xyz']) {
      const r = await report(s, auth);
      const expected = composeReportResponse(score(s.qs, s.answers, s.secs));
      ok(r.status === 200 && isDeepStrictEqual(r.json, JSON.parse(JSON.stringify(expected))), `꺼짐: 로그인 헤더(${auth?.slice(0, 12) ?? '없음'}) 무시, 전체 응답 동일`);
      ok(!('gated' in r.json) && JSON.stringify(Object.keys(r.json)) === JSON.stringify(['meta', 'summary', 'areaDetails', 'explanations']), '꺼짐: gated 필드 없음, 키 순서 이전과 같음');
    }
    // 계정 삭제 API도 꺼져 있으면 없는 경로처럼 404, 설정 값·내부 오류 문구 없음
    for (const [method, auth] of [['POST', `Bearer ${userToken('google')}`], ['POST', undefined], ['GET', undefined]] as const) {
      const d = await handleAccountDelete(new Request('http://x/api/account-delete', { method, headers: auth ? { authorization: auth } : {} }));
      const text = await d.text();
      ok(d.status === 404 && JSON.parse(text).error === 'not_found', `꺼짐: 삭제 ${method}(토큰 ${auth ? '있음' : '없음'}) → 404 not_found (${d.status})`);
      ok(!/SUPABASE|VITE_|환경 변수|설정 오류/.test(text), `꺼짐: 삭제 응답에 설정 이름·내부 오류 문구 없음`);
    }
    ok(mock.state.calls.length === 0, `꺼짐: Supabase 호출 없음 (${mock.state.calls.length})`);
  }

  // ---- 켜짐
  onEnv();
  await setMock({ reset: true });
  {
    const s = await newSession();
    ok(s.status === 200, '켜짐: 세션은 로그인 없이 200');
    checkFree('켜짐 게스트', await report(s), s);
    checkFree('켜짐 게스트(본문에 gated:false·entitled:true 넣어도 무시)', await report(s, undefined, { gated: false, entitled: true, scope: 'full' }), s);
    checkFree('켜짐 로그인·이용권 없음(구글)', await report(s, `Bearer ${userToken('google')}`), s);
    await setMock({ entitled: { [MOCK_USERS.kakao.id]: false } });
    checkFree('켜짐 로그인·이용권 회수됨(카카오, 이메일 없음)', await report(s, `Bearer ${userToken('kakao')}`), s);

    await setMock({ entitled: { [MOCK_USERS.google.id]: true } });
    const r = await report(s, `Bearer ${userToken('google')}`);
    const full = composeReportResponse(score(s.qs, s.answers, s.secs));
    ok(r.status === 200 && r.json.gated === false, '켜짐 이용권 있음: gated=false');
    const { gated: _g, ...rest } = r.json;
    ok(isDeepStrictEqual(rest, JSON.parse(JSON.stringify(full))), '켜짐 이용권 있음: 전체 응답(상세 4, 해설 12)');

    // 토큰 문제 → 401
    const cases: [string, string][] = [
      ['만료된 토큰', `Bearer ${userToken('google', { expIn: -10 })}`],
      ['다른 키로 서명', `Bearer ${userToken('google', { secret: 'another-secret-xxxxxxxxxxxxxxxxxxxx' })}`],
      ['변조(서명 일부 바꿈)', `Bearer ${userToken('google').slice(0, -3)}abc`],
      ['변조(본문 바꿈)', (() => { const [h, , sg] = userToken('google').split('.'); return `Bearer ${h}.${Buffer.from(JSON.stringify({ sub: MOCK_USERS.google.id, role: 'service_role', exp: 9999999999 })).toString('base64url')}.${sg}`; })()],
      ['Bearer 뒤 빈 값', 'Bearer '],
      ['Basic 방식', 'Basic abc'],
      ['이상한 문자', 'Bearer abc def'],
    ];
    for (const [name, auth] of cases) {
      const rr = await report(s, auth);
      ok(rr.status === 401 && rr.json.error === 'auth_invalid', `켜짐 ${name} → 401 auth_invalid (${rr.status} ${rr.json.error})`);
      ok(!rr.text.includes('explanations'), `켜짐 ${name}: 결과 내용 없음`);
    }

    // 일시 장애 → 503 (무료로도 유료로도 처리하지 않음)
    await setMock({ auth: '500' });
    let rr = await report(s, `Bearer ${userToken('google')}`);
    ok(rr.status === 503 && rr.json.error === 'service_unavailable' && !rr.text.includes('explanations'), `켜짐 인증 서버 500 → 503 (${rr.status})`);
    await setMock({ auth: 'ok', db: '500' });
    rr = await report(s, `Bearer ${userToken('google')}`);
    ok(rr.status === 503 && rr.json.error === 'service_unavailable', `켜짐 이용권 DB 500 → 503 (${rr.status})`);
    await setMock({ db: 'ok' });
    process.env.VITE_SUPABASE_URL = 'http://127.0.0.1:9'; // 연결 거부
    rr = await report(s, `Bearer ${userToken('google')}`);
    ok(rr.status === 503 && rr.json.error === 'service_unavailable', `켜짐 인증 서버 연결 불가 → 503 (${rr.status})`);
    rr = await report(s);
    ok(rr.status === 200 && rr.json.gated === true, '켜짐 인증 서버 연결 불가여도 게스트는 무료 응답(Supabase 호출 안 함)');
    delete process.env.VITE_SUPABASE_URL;
    rr = await report(s, `Bearer ${userToken('google')}`);
    ok(rr.status === 500 && rr.json.error === 'server_misconfigured', `켜짐 Supabase 설정 없음 + 토큰 → 500 server_misconfigured (${rr.status})`);
    process.env.VITE_SUPABASE_URL = mock.url;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    rr = await report(s, `Bearer ${userToken('google')}`);
    ok(rr.status === 500 && rr.json.error === 'server_misconfigured', `켜짐 서비스 키 없음 + 토큰 → 500 (${rr.status})`);
    onEnv();
  }

  // ---- 계정 삭제
  {
    await setMock({ reset: true, entitled: { [MOCK_USERS.google.id]: true } });
    const del = (auth?: string) =>
      handleAccountDelete(new Request('http://x/api/account-delete', { method: 'POST', headers: auth ? { authorization: auth } : {} }));
    let r = await del();
    ok(r.status === 401, `삭제: 토큰 없음 → 401 (${r.status})`);
    r = await del(`Bearer ${userToken('google', { expIn: -5 })}`);
    ok(r.status === 401, `삭제: 만료 토큰 → 401 (${r.status})`);
    await setMock({ auth: '500' });
    r = await del(`Bearer ${userToken('google')}`);
    ok(r.status === 503, `삭제: 인증 서버 장애 → 503 (${r.status})`);
    await setMock({ auth: 'ok' });
    const token = userToken('google');
    r = await del(`Bearer ${token}`);
    const st = await (await setMock({})).json();
    ok(r.status === 200 && st.deleted.includes(MOCK_USERS.google.id) && st.entitled[MOCK_USERS.google.id] === undefined, `삭제: 200, 이용권 행·계정 삭제 (${r.status})`);
    const s = await newSession();
    const rr = await report(s, `Bearer ${token}`);
    ok(rr.status === 401, `삭제 후 같은 토큰으로 채점 → 401 (${rr.status})`);
    const g = await handleAccountDelete(new Request('http://x/api/account-delete', { method: 'GET' }));
    ok(g.status === 405, '삭제: GET → 405');
  }

  // ---- 카카오 로그인 스위치: 이용권 기능을 켠 빌드를 카카오 꺼짐/켜짐으로 만들어 dist를 검사한다
  {
    const walk = (dir: string): string[] => readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)]));
    const buildWith = async (kakao: boolean) => {
      const out = mkdtempSync(join(tmpdir(), 'ncs-kakao-'));
      const keys = ['VITE_MONETIZATION_ENABLED', 'VITE_KAKAO_LOGIN_ENABLED', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'] as const;
      const saved = Object.fromEntries(keys.map((k) => [k, process.env[k]]));
      process.env.VITE_MONETIZATION_ENABLED = 'true';
      // 공개 설정 값이 없으면 번들러가 로그인 코드를 통째로 지우므로, 실제 배포처럼 값(가짜)을 넣고 빌드한다
      process.env.VITE_SUPABASE_URL = 'https://example-project.supabase.co';
      process.env.VITE_SUPABASE_ANON_KEY = 'sb_publishable_test_only';
      if (kakao) process.env.VITE_KAKAO_LOGIN_ENABLED = 'true';
      else delete process.env.VITE_KAKAO_LOGIN_ENABLED;
      try {
        await build({ logLevel: 'silent', build: { outDir: out, emptyOutDir: true } });
        return { out, texts: walk(out).filter((f) => /\.(html|js|css)$/.test(f)).map((f) => ({ f: f.slice(out.length), t: readFileSync(f, 'utf8') })) };
      } finally {
        for (const k of keys)
          if (saved[k] === undefined) delete process.env[k];
          else process.env[k] = saved[k];
      }
    };
    // 이미 로그인한 계정의 방식 표시(kakao: '카카오')만 허용한다
    const LABEL = /kakao\s*:\s*["'`]카카오["'`]/g;
    const MARKERS = ['카카오로', '구글 또는 카카오', '구글·카카오', 'data-provider="kakao"'];
    const off = await buildWith(false);
    const leftovers = off.texts.flatMap(({ f, t }) => (t.replace(LABEL, '').includes('카카오') ? [f] : []));
    ok(leftovers.length === 0, `카카오 꺼짐 빌드: 방식 표시 외 카카오 문구 없음 (${leftovers.join(', ')})`);
    ok(off.texts.every(({ t }) => MARKERS.every((m) => !t.includes(m))), '카카오 꺼짐 빌드: 카카오 버튼·안내 문구 없음');
    ok(off.texts.some(({ f, t }) => f.endsWith('privacy/index.html') && t.includes('구글 계정으로 로그인해야')), '카카오 꺼짐 빌드: 개인정보처리방침은 "구글"만');
    const on = await buildWith(true);
    const all = on.texts.map(({ t }) => t).join('\n');
    ok(['카카오로', '구글 또는 카카오', '구글·카카오'].every((m) => all.includes(m)), '(대조) 카카오 켜짐 빌드에는 카카오 버튼·안내 문구가 있음');
    ok(off.texts.some(({ t }) => t.includes('Google로 계속하기')), '(대조) 카카오 꺼짐 빌드에도 Google 로그인 버튼은 있음');
    for (const b of [off, on]) rmSync(b.out, { recursive: true, force: true });
  }
} finally {
  await mock.close();
}

console.log(`\n이용권 응답 나누기 테스트: 통과 ${passed}, 실패 ${failed}`);
if (failed) process.exit(1);
