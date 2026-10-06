# 로그인·이용권 공개 준비 점검표

기준 커밋: main `04f6a4d`. 코드와 SQL을 읽고 확인한 사실만 적었습니다. 코드는 수정하지 않았습니다.
비밀 값은 적지 않고 환경 변수 이름만 적습니다.

표시: **[확인]** 코드·빌드로 직접 확인함 · **[문제]** 공개 전에 고치거나 정해야 할 점 · **[확인 필요]** 이 저장소만으로는 확인할 수 없음

---

## (가) 코드로 확인된 사실

### 1. 서비스 키가 브라우저 번들에 들어가지 않는가
- **[확인]** `SUPABASE_SERVICE_ROLE_KEY`를 읽는 실행 코드는 `server/accounts.ts`의 `supabaseAdmin()` 한 곳뿐입니다.
  - `vite.config.ts`는 개발·미리보기 서버의 `/api/*` 처리용으로 `process.env`에 옮겨 담기만 합니다.
  - 나머지 언급은 검사 스크립트(`scripts/check-bundle.ts`, `scripts/gating-test.ts`)입니다.
- **[확인]** 브라우저 코드(`src/`)는 `server/`를 import하지 않습니다. `src/ui/monetization.ts`는 공개 값 `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`만 씁니다.
- **[확인]** 서비스 키 이름에 `VITE_` 접두어가 없으므로 Vite가 번들에 넣지 않습니다.
- **[확인]** 이용권 스위치를 켠 빌드(공개 값은 자리 표시)를 저장소 밖에서 만들어 찾아봤습니다. 아래 문자열은 모두 0개 파일에서 나왔습니다.
  - `SUPABASE_SERVICE_ROLE_KEY`, `service_role`, `REPORT_TOKEN_SECRET`, `server/accounts`, `supabaseAdmin`, `setAccountServiceForTests`
  - 공개 주소 `VITE_SUPABASE_URL`은 `assets/monetization-*.js` 한 파일에만 들어갔습니다.
- **[확인]** `npm run check:bundle`이 매 빌드에서 같은 검사를 합니다. 검사하는 것은 서비스 키 이름, 환경 변수나 `.env.local`에 있는 실제 값, `sb_secret_` 모양, `service_role` JWT입니다. 이용권 꺼짐·켜짐 모두 통과합니다.

### 2. RLS: 비로그인(anon)이 이용권을 쓰거나 남의 행을 읽을 수 있는가
`supabase/migrations/20261005000000_entitlements.sql` 기준입니다.
- **[확인]** 테이블에 `enable row level security`가 켜져 있습니다.
- **[확인]** 테이블 권한
  - `revoke all ... from anon, authenticated`로 기본 권한을 먼저 모두 거둡니다.
  - `authenticated`에는 `select`만 줍니다.
  - `service_role`에는 `select, insert, update, delete`를 줍니다.
- **[확인]** 정책은 `"본인 이용권 읽기"` 하나입니다(`for select to authenticated using ((select auth.uid()) = user_id)`).
- **결론 (SQL 문면 기준)**
  - anon은 읽기·쓰기 모두 불가합니다(권한 없음, 정책 없음).
  - 로그인 사용자는 자기 행 읽기만 가능합니다. 쓰기 권한과 쓰기 정책이 없어 insert/update/delete는 불가합니다.
  - 다른 사람 행은 정책 조건(`auth.uid() = user_id`)으로 읽을 수 없습니다.
  - 쓰기는 RLS를 우회하는 서버(service_role)만 할 수 있습니다.
- **[확인]** 클라이언트는 `entitlements`에서 `status, purchased_at`을 자기 행으로만 읽습니다(`src/ui/monetization.ts`).
  - 서버는 `status`만 읽습니다(`server/accounts.ts` `entitlement()`).
- **[확인]** `supabase/dev/grant-entitlement.example.sql`은 결제 없이 이용권을 주는 개발용 SQL입니다. 파일 안에 "운영 프로젝트에서 실행 금지"라고 적혀 있습니다.
- **[확인 필요]** 이 마이그레이션이 운영 Supabase 프로젝트에 실제로 적용됐는지, 대시보드에서 정책·권한이 위와 같은지는 저장소에서 알 수 없습니다.

### 3. 계정 삭제 흐름과 저장 항목
- **저장 항목** (`entitlements` 테이블)
  - `user_id`(계정 ID)
  - `status`(`active`/`revoked`)
  - `purchased_at`(구매 시각)
  - `order_id`(결제 주문 번호, 지금은 비어 있음)
  - 로그인만으로는 행이 생기지 않습니다(마이그레이션 주석과 코드).
- **[확인]** 삭제 흐름
  1. 화면 "내 계정 → 계정 삭제"에서 확인창이 뜹니다. 안내 문구는 "계정과 이용권 정보가 삭제되며 되돌릴 수 없습니다. 구매한 이용권도 함께 사라집니다."이고, 처음 포커스는 "취소"에 있습니다.
  2. `POST /api/account-delete`(로그인 토큰 필요)를 보냅니다.
  3. 서버가 토큰을 검증한 뒤 `entitlements`에서 본인 행을 삭제합니다. `status`, `purchased_at`, `order_id`가 모두 함께 지워집니다.
  4. 이어서 `auth.admin.deleteUser(userId)`로 Supabase Auth 계정을 삭제합니다. 테이블에는 `on delete cascade`도 걸려 있습니다.
  5. 브라우저에서 로그아웃하고 "계정을 삭제했습니다"를 알립니다.
- **[확인]** 이용권 스위치(`MONETIZATION_ENABLED`)가 꺼져 있으면 `/api/account-delete`는 404입니다.
- **[확인]** 브라우저의 무료 1회 표시(localStorage `ncs-free-diagnosis-used`)는 계정이 아니라 브라우저 기준이라, 계정 삭제와 관계없이 남습니다.
- **[문제·확인 필요]** 결제가 도입되면 `order_id`·`purchased_at`(결제 기록)이 계정 삭제와 함께 즉시 지워집니다. 전자상거래 관련 법령의 거래 기록 보관 의무와 맞는지는 확인이 필요합니다. 지금은 결제가 없어 `order_id`가 늘 비어 있습니다.
- **[확인 필요]** `deleteUser`의 기본값은 완전 삭제(soft delete 아님)로 호출합니다. 다만 Supabase Auth의 감사 로그 등에 기록이 남는지는 Supabase 정책을 확인해야 합니다.

### 4. `/privacy/` 문구와 실제 동작
페이지는 하나이고, 빌드 스위치(`<!--#if monetization-->`)로 문장을 바꿉니다.

**로그인 꺼짐(현재 운영) 문구**
- **[확인]** "회원가입, 로그인, 이름·연락처 입력이 없습니다", "채점이 끝나면 저장하지 않습니다", "쿠키, 방문 분석 도구, 브라우저 저장소를 사용하지 않습니다"는 꺼진 빌드의 동작과 맞습니다.
  - 꺼진 빌드에는 이용권 모듈이 없습니다.
  - 심화 화면 모듈도 저장소를 쓰지 않고 주소(`?level=advanced`)만 씁니다.
- **[문제·작음]** "세션 토큰에는 문제 생성용 번호와 발급 시각이 담기며"라고 되어 있습니다. 실제 토큰에는 형식 버전(`v`)도 있고, 심화를 켜면 수준 표시(`l`)가 더해집니다. 개인 식별 정보가 없다는 요지는 맞습니다.
- **[확인 필요]** 4절은 검색 등록 확인 메타 태그로 네이버만 적습니다. Production에 `VITE_ADSENSE_ACCOUNT`를 넣으면 `google-adsense-account` 메타 태그가 들어가는데, 이 언급이 없습니다. 태그 자체는 정보를 수집하지 않습니다. Production에 이 값이 있는지는 저장소에서 알 수 없습니다.

**로그인 켜짐 문구**
- **[확인]** "데이터베이스에는 계정 ID와 이용권 상태(구매 여부, 구매 시각)만 저장하며, 결제가 도입되면 결제 주문 번호가 더해집니다"는 `entitlements` 열과 맞습니다.
- **[확인]** "로그인 유지와 무료 진단 사용 여부 표시를 위해 localStorage 사용"은 코드와 맞습니다(`sb-<프로젝트>-auth-token`, `...-code-verifier`, `ncs-free-diagnosis-used`). 쿠키를 쓰지 않는 것도 코드 주석과 맞습니다.
- **[확인]** "내 계정에서 계정 삭제를 누르면 계정과 이용권 정보가 바로 삭제"는 3번 흐름과 맞습니다.
- **[문제·표현]** "이 사이트의 데이터베이스(Supabase)에는 … 만 저장"이라고 되어 있습니다. 그런데 인증 정보(`auth.users`: 이메일·이름 등 동의 항목)도 같은 Supabase 프로젝트에 보관됩니다. 바로 다음 문장이 "인증 서비스가 보관할 수 있다"고 설명하지만, 읽는 사람이 다른 곳에 저장된다고 오해할 수 있습니다.
- **[확인 필요]** 5절 "제3자에게 제공하지 않습니다"가 있습니다. Vercel(호스팅)과 Supabase(인증·DB)에 처리를 맡기는 것을 처리 위탁으로 따로 적어야 하는지는 법적 확인이 필요합니다.

### 5. Production에서 이용권 스위치를 켜면 "이용권 구매" 버튼이 하는 일 (결제 미구현)
`src/ui/monetization.ts`의 `purchase()`, `renderPaywall()`과 `src/ui/diagnosis.ts`의 `mayStart()` 기준입니다.
- **[확인]** 결과 화면
  - 요약과 해설 1·2번만 보입니다.
  - 잠긴 자리에 이용권 카드가 나옵니다: 가격 2,900원, "결제 준비 중" 표시, "이용권 구매" 버튼.
- **[확인]** "이용권 구매"를 누르면
  - 로그인하지 않은 경우: 로그인 창이 열립니다. 구글 로그인 뒤 `/diagnosis/?auth=purchase`로 돌아와 "이용권 구매" 화면이 나옵니다.
  - 로그인했고 이용권이 없는 경우: "결제는 준비 중입니다" 알림만 나옵니다. 결제 화면이나 외부 결제로 가는 경로는 없습니다.
  - 이용권이 있는 경우: "이미 이용권이 있습니다" 알림이 나옵니다. 이용권은 지금 운영자가 SQL로 직접 넣는 방법 말고는 생길 수 없습니다.
- **[문제·공개 차단 수준]** 무료 1회 제한이 화면에서 바로 동작합니다.
  - 한 브라우저에서 진단 결과를 한 번 받으면, 그 뒤 "새 문제로 진단"이나 진단 시작은 "무료 진단을 이미 사용했습니다" 화면으로 막힙니다.
  - 이용권을 살 수 없으므로 이 화면에서 계속할 방법이 없습니다("홈으로"만 있음).
  - 즉, 결제 없이 스위치를 켜면 모든 방문자가 브라우저당 진단 1회로 제한됩니다.
- **[확인]** 무료 1회 제한은 브라우저 저장소에만 기대고, 서버는 세션 수를 제한하지 않습니다. 사이트 데이터를 지우면 다시 무료로 풀 수 있습니다(설계상 그런 것으로 보이며, 기록만 해 둡니다).
- **[확인]** 스위치를 켜고 값이 빠졌을 때
  - `VITE_SUPABASE_URL`이나 `VITE_SUPABASE_ANON_KEY`가 없으면 로그인 버튼이 숨고 "이용권 기능을 준비하고 있습니다"가 나옵니다. 무료 1회 제한은 그대로 적용됩니다.
  - 서버에서 `SUPABASE_SERVICE_ROLE_KEY`가 없으면 로그인한 사용자의 채점 요청이 서버 설정 오류로 실패합니다. 비로그인 채점은 무료 범위로 정상 동작합니다.

### 6. 로그인 화면의 구글 버튼
- **[확인]** 문구는 "Google로 계속하기"입니다.
- **[확인]** 모양 (`src/styles/account.css` `.gsi-btn`)
  - 흰 바탕 `#ffffff`, 테두리 `#747775` 1px, 글자 `#1f1f1f`
  - 모서리 4px, 높이 44px 이상, 가로 꽉 채움
  - 안쪽 여백 12px, 로고와 글자 사이 10px
  - 글꼴: 500 14px/20px `'Google Sans', Roboto`, 없으면 사이트 글꼴
- **[확인]** 다크 모드: 바탕 `#131314`, 테두리 `#8e918f`, 글자 `#e3e3e3`
- **[확인]** 로고는 표준 4색 "G" SVG를 그대로 씁니다. 외부 글꼴은 불러오지 않습니다.
- **[확인]** 로그인 창 안내 문장: "로그인은 이용권 구매와 이용에만 필요합니다." 그리고 저장 항목·인증 서비스 안내와 개인정보 안내 링크가 있습니다.
- **[확인]** 카카오 버튼은 `VITE_KAKAO_LOGIN_ENABLED=true`일 때만 들어갑니다(현재 보류, 기본 꺼짐).

### 그 밖에 발견한 것
- **[문제·작음]** `.env.example`의 `VITE_ADVANCED_LEVEL_ENABLED` 설명이 "화면 작업 전이라 아직 쓰는 곳 없음"으로 남아 있습니다. 지금은 심화 화면을 켜는 스위치입니다.

---

## (나) 영준님이 콘솔에서 할 일

### 구글 OAuth (Google Cloud Console)
- OAuth 동의 화면을 "테스트"에서 "프로덕션"으로 게시합니다. 테스트 상태에서는 등록한 시험 사용자만 로그인할 수 있습니다.
- 동의 화면의 앱 이름, 지원 이메일, 홈페이지·개인정보처리방침 주소(`https://ncsmath.com/privacy/`), 승인된 도메인을 확인합니다.
- 요청 범위가 로그인에 필요한 기본 범위(openid, email, profile)인지 확인합니다. 민감 범위가 없으면 심사가 가벼울 수 있지만 확인이 필요합니다.
- OAuth 클라이언트의 승인된 리디렉션 URI에 Supabase 콜백 주소(`https://<프로젝트>.supabase.co/auth/v1/callback`)가 있는지 확인합니다.

### Supabase
- 플랜을 확인합니다. 무료 플랜의 사용 제한과 비활성 프로젝트 일시 중지 정책 등이 운영에 맞는지 봅니다.
- 운영 프로젝트에 `supabase/migrations/20261005000000_entitlements.sql`을 적용했는지, 정책·권한이 (가) 2번과 같은지 확인합니다.
- Authentication → URL Configuration 설정
  - Site URL: `https://ncsmath.com`
  - Redirect URLs: 코드가 쓰는 복귀 주소는 `https://ncsmath.com/diagnosis/`, `https://ncsmath.com/diagnosis/?auth=purchase`, 그리고 머리말 로그인 버튼을 누른 그 페이지 경로(`window.location.pathname`, 사이트의 모든 페이지)입니다. 이를 모두 받도록 `https://ncsmath.com/**` 같은 와일드카드를 쓸지 정합니다.
- Google 공급자가 켜져 있고 클라이언트 ID·시크릿이 들어 있는지 확인합니다. 카카오 공급자는 보류 상태로 둡니다.
- 개발용 SQL(`supabase/dev/grant-entitlement.example.sql`)을 운영 프로젝트에서 실행하지 않습니다.

### Vercel 환경 변수 (값은 여기 적지 않음)
Vercel 화면은 이 작업에서 볼 수 없으므로, "현재 어디에 있는지"는 콘솔에서 확인해야 합니다.

**로그인 공개에 새로 필요한 값**

| 이름 | 종류 | 넣을 환경 | 비고 |
|---|---|---|---|
| `MONETIZATION_ENABLED` | 서버 스위치 | Production (`true`) | Preview에서 로그인을 시험했다면 Preview에만 있을 것 |
| `VITE_MONETIZATION_ENABLED` | 빌드 스위치 | Production (`true`) | 위와 같음. 바꾸면 다시 배포해야 반영 |
| `VITE_SUPABASE_URL` | 공개 값(번들에 들어감) | Production | 서버도 이 값을 읽음 |
| `VITE_SUPABASE_ANON_KEY` | 공개 값(번들에 들어감) | Production | anon 또는 publishable 키 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 전용 비밀 값 | Production | `VITE_` 접두어를 붙이면 안 됨 |
| `SUPABASE_URL` | 서버 전용(선택) | Production(선택) | 없으면 서버가 `VITE_SUPABASE_URL`을 씀 |

**이미 있어야 하는 값 (Production 기존)**
- `REPORT_TOKEN_SECRET`
- `VITE_SITE_URL`, `VITE_CONTACT_EMAIL`, `VITE_OPERATOR_NAME`, `VITE_LAST_UPDATED`
- (선택) `VITE_ADSENSE_ACCOUNT`

**넣지 않는 값 (이번 공개 범위 밖)**
- `VITE_KAKAO_LOGIN_ENABLED`: 카카오 보류
- `ADVANCED_LEVEL_ENABLED`, `VITE_ADVANCED_LEVEL_ENABLED`: 심화. 별도로 결정

**Preview와 Production 구분 (확인 필요)**
- 로그인 시험을 Preview에서만 했다면 위 "새로 필요한 값" 여섯 개는 지금 Preview에만 있을 가능성이 큽니다.
- Production과 Preview가 같은 Supabase 프로젝트를 쓸지, 따로 쓸지 정해야 합니다.

**순서 제안**
1. (가) 5번의 무료 1회 제한 문제를 먼저 정합니다. 예: 결제 도입 전에는 `VITE_MONETIZATION_ENABLED`를 켜지 않거나, 무료 1회 제한을 결제 도입과 함께 켜는 방안.
2. Supabase와 구글 설정을 마칩니다.
3. 환경 변수를 넣고 다시 배포한 뒤 실제 로그인·로그아웃·계정 삭제를 확인합니다.

---

## (다) 확인 필요 (법적·정책)
아래는 이 저장소만으로 판단할 수 없어 단정하지 않습니다.

- **개인정보 항목:** 구글 로그인으로 Supabase Auth가 받는 항목(이메일, 이름, 프로필 사진 주소 등)을 개인정보처리방침에 "수집 항목"으로 명시해야 하는지, 보관 기간을 적어야 하는지 확인이 필요합니다.
- **처리 위탁 표기:** Vercel(호스팅·접속 기록)과 Supabase(인증·데이터베이스)를 처리 위탁 또는 국외 이전으로 표기해야 하는지 확인이 필요합니다. 서버 위치 확인도 필요합니다. 현재 방침은 "제3자 제공 없음"만 적습니다.
- **결제 기록 보관:** 결제가 도입되면 주문 번호·결제 시각을 계정 삭제와 별도로 일정 기간 보관해야 할 수 있습니다. 지금 삭제 흐름은 즉시 삭제입니다.
- **구글 버튼 가이드라인 대조:** 구글 공식 로그인 버튼 지침과 다음을 대조해야 합니다.
  - 한국어 공식 문구("Google로 계속하기"가 공식 번역과 같은지)
  - 글꼴: Roboto가 없을 때 사이트 글꼴로 바뀌는 점
  - 높이(44px)·모서리·여백
  - 다크 모드 색
- **인증 서비스 표기:** 로그인 화면과 방침에 "인증 서비스(Supabase Auth)"라고 적고 있습니다. 서비스 제공자 표기 방식이 충분한지 확인이 필요합니다.
- **환불·이용 약관:** 이용권(구독 아님, 2,900원) 판매 전에 환불 규정과 이용 약관 페이지가 필요한지 확인이 필요합니다. 현재 사이트에는 "이용 시 유의사항" 페이지만 있습니다.
- **Supabase 플랜 조건:** 무료 플랜의 이용 한도, 일시 중지, 지원 범위가 운영에 맞는지 확인이 필요합니다.
