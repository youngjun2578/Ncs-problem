# NCS 수리능력 진단

Vite + TypeScript 정적 사이트와 Vercel 함수(`api/`)로 이루어져 있습니다. DB는 없습니다.
문제 생성·채점·리포트 계산은 서버 함수에서 하고, 브라우저에는 문제 문구·보기·도표만 내려갑니다(정답·해설은 채점 후 응답으로만).
4개 영역(기초연산·기초통계·도표분석·도표작성)에서 3문항씩 12문항을 풀고, 영역별 리포트를 받습니다.
모든 문제는 직접 만든 템플릿으로 매번 새로 생성하며, 외부 기출·문제집 문장을 쓰지 않습니다.

## 명령

```bash
npm install
npm run dev        # 개발 서버 (/api/*도 같은 핸들러로 함께 동작, .env.local의 REPORT_TOKEN_SECRET 필요)
npm run validate   # 문제 생성기 검증 (실패 시 exit 1)
npm run build      # validate → 타입 검사 → vite build (검증 실패 시 빌드 중단)
npm run preview    # 빌드 결과 미리보기 (/api/*도 동작)
npm run test:golden    # 서버 출력 = 골든 스냅샷(서버 이전 전 출력)인지 비교
npm run test:api       # 서버 입력 검증·토큰·응답 내용 테스트
npm run test:gating    # 기능 스위치·로그인·이용권에 따른 응답 나누기 테스트 (모의 Supabase)
npm run check:bundle   # dist에 서버 전용 문구·서비스 키·소스맵이 없는지 검사 (build 뒤에 실행)
npx tsx scripts/sample.ts chartRead 2   # 템플릿 id 접두어별 예시 문제 출력
```

`validate` 옵션: `PER_TEMPLATE`(기본 3000), `SETS`(기본 5000), `SEED_OFFSET`(다른 시드 범위 탐색), `VERBOSE`.

## 배포 전 설정 (`.env`)

| 변수 | 용도 |
| --- | --- |
| `VITE_SITE_URL` | canonical·OG·sitemap 절대 주소 (현재 `https://example.com` 자리표시자) |
| `VITE_CONTACT_EMAIL` | 꼬리말·안내 페이지 문의 이메일 (현재 `contact@example.com` 자리표시자) |
| `VITE_LAST_UPDATED` | 꼬리말·안내 페이지의 최종 업데이트 날짜, sitemap `lastmod` |

서버 전용 비밀 값은 `.env`에 넣지 않습니다(`.env`는 커밋됨). 목록은 `.env.example`에 있습니다.

| 변수 | 어디에 | 용도 |
| --- | --- | --- |
| `REPORT_TOKEN_SECRET` | 로컬: `.env.local`(커밋 제외) / 배포: Vercel 프로젝트 환경 변수 | 세션 토큰 HMAC 서명 키, 32자 이상. 없으면 `/api/*`가 500 `server_misconfigured`로 실패 |

## 로그인·이용권 (기능 스위치)

`MONETIZATION_ENABLED`(서버)와 `VITE_MONETIZATION_ENABLED`(빌드)가 모두 `"true"`가 아니면 이전과 똑같이 동작합니다.
꺼진 빌드에는 로그인 코드와 `@supabase/supabase-js`가 들어가지 않고 HTML도 같습니다.

| 구분 | 무료(게스트·이용권 없음) | 이용권 |
| --- | --- | --- |
| 진단 | 1회 (브라우저 저장소 표시로 제한) | 반복 |
| 결과 | 영역별 요약 + 1·2번 해설 | 전체(영역별 상세, 12문항 해설) |

- 로그인: 구글·카카오(Supabase OAuth, PKCE). "이용권 구매"를 누를 때만 요구합니다. 결제는 아직 없고 로그인 뒤 "결제 준비 중"을 보여 줍니다.
- 서버: `Authorization: Bearer <Supabase 액세스 토큰>`을 Supabase 인증 서버로 검증하고 `entitlements`를 서비스 키로 조회합니다. 토큰 문제 401, 일시 장애 503. 무료 응답은 `server/diagnosis.ts`의 `composeReportResponse`에서 잘라 잠긴 내용이 응답 본문에 들어가지 않습니다. 응답의 `gated`는 스위치가 켜졌을 때만 들어갑니다.
- DB: `supabase/migrations/`의 SQL을 Supabase SQL Editor에서 실행합니다. 개발용 이용권 수동 부여는 `supabase/dev/grant-entitlement.example.sql`(운영 금지).
- 안내 문구: HTML의 `<!--#if monetization-->켜짐<!--#else-->꺼짐<!--#endif-->` 블록을 빌드 때 고릅니다.
- 테스트: `npm run test:gating`(모의 Supabase `scripts/mock-supabase.ts`로 실제 supabase-js 경로 검증)

## API (Vercel 함수)

| 경로 | 요청 | 응답 |
| --- | --- | --- |
| `POST /api/session` | 본문 없음 | `{ token, expiresAt, questions[12] }` — 문항은 `area, areaName, text, figure?, choices[{label, chart?}]`만 |
| `POST /api/report` | `{ token, answers[12], secs[12] }` (+ 선택: `Authorization`) | `{ meta, summary, areaDetails, explanations }` (+ 스위치 켜짐: `gated`) |
| `POST /api/account-delete` | `Authorization: Bearer <토큰>` | `{ deleted: true }` — 이용권 행과 Supabase 계정 삭제 |

- 토큰: `base64url({v, s, iat}).base64url(HMAC-SHA256)`, 유효 6시간. 실제 문제 생성 시드는 `HMAC(키, s)`로 만들어 키 없이는 재현할 수 없습니다.
- 채점은 서버가 토큰의 시드로 같은 문제를 다시 만들어 합니다. 클라이언트가 보낸 점수·정답 여부는 쓰지 않습니다.
- 응답 구역은 `server/diagnosis.ts`의 `composeReportResponse` 한 곳에서 만듭니다(이후 무료/유료 구분 시 여기서 자름).
- 받은 답·시간은 저장하지 않고 로그에도 남기지 않습니다.

## 구조

```
index.html               정적 랜딩 (meta/OG/JSON-LD)
diagnosis/index.html     진단 앱 셸
method/index.html        문제 생성·검증 방식, 판정 기준, 개인정보, 유의사항, 문의
api/                     Vercel 함수 진입점 (session.ts, report.ts)
server/                  서버 전용 (브라우저 번들에 들어가지 않음)
  handlers.ts            HTTP 처리·입력 검증 (dev 서버와 Vercel 함수가 함께 씀)
  token.ts               세션 토큰 서명·검증
  diagnosis.ts           문항 생성, 화면용 문항 변환, 채점, 응답 구역 구성
  engine/
    rng.ts               시드 난수 (mulberry32)
    choices.ts           보기 5개 구성: 흔한 실수 오답 우선, 부족할 때만 근접값("계산 실수")
    set.ts               세트 구성: 영역별 서로 다른 유형 3개, 가능하면 난이도 1·2·3
    mistakes.ts          실수 태그 → 리포트의 "틀린 패턴" 문장
    frac.ts, format.ts   기약분수·조합, 숫자 표기
    types.ts             Template / Generated / Problem
  templates/<영역>/<유형>.ts   24개 유형 (기초연산 8, 기초통계 5, 도표분석 6, 도표작성 5)
  registry.ts            템플릿 목록
  areas.ts               영역 설명, 학습 순서, 권장 시간
  report/analyze.ts      영역별 정답률·시간·수준·틀린 패턴·학습 순서 (순수 함수)
shared/                  서버와 브라우저가 함께 씀
  api.ts                 요청·응답 타입
  charts/render.ts       막대·꺾은선·원·점그래프·표를 SVG/HTML 문자열로 (DOM 없이 동작)
  format.ts              숫자 표기
src/                     브라우저
  ui/                    풀이 화면, 결과 리포트, API 호출
  styles/                tokens / base / components / chart / report / landing / print
  partials/              공통 머리말·꼬리말 (빌드 시 삽입)
scripts/validate.ts      생성기 검증
scripts/golden.ts        골든 스냅샷 생성 (서버 이전 전 한 번 만든 기준값, tests/golden/)
scripts/golden-compare.ts, api-test.ts, check-bundle.ts   검증
```

Node ESM으로 함수가 파일 단위로 실행되므로 `server/`, `shared/`, `api/`의 상대 import에는 `.js` 확장자를 붙입니다.

## 템플릿 추가하기

```ts
export const myType: Template = {
  id: 'arith.myType', area: 'arith', subtype: '유형 이름', difficulty: 2,
  generate(rng) {
    // 1) 정답을 먼저 정하고 숫자를 역산한다
    // 2) 오답은 흔한 실수를 계산식으로 재현하고 mistakeTag를 붙인다 (mistakes.ts에 있는 태그만 가능)
    // 3) 문장 틀은 3가지 이상
    return { text, answer, wrongs: [{ value, mistakeTag: '기준량 혼동' }, ...], steps, format, near };
  },
};
```

`registry.ts`에 추가하고 `areas.ts`의 `studyOrder`에 유형 이름을 넣은 뒤 `npm run validate`로 확인합니다.

## 광고

결과 화면 하단의 `.ad-slot[data-ad-slot="result-bottom"]`만 광고 자리로 비워 두었습니다(풀이 중에는 없음).
광고를 넣을 때는 `method/index.html`의 개인정보 안내를 먼저 갱신하세요.
