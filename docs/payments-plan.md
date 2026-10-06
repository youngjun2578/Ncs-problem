# 결제 뼈대 설계 (결제사 독립 구조 + 가짜 결제사)

가지 `payment-skeleton`. 결제사는 아직 정하지 않았습니다(토스페이먼츠 유력, 사업자 등록 전).
그래서 특정 결제사의 API 규격은 구현하지 않았습니다. 결제사 인터페이스와 시험용 가짜 결제사까지만 있습니다.

표시: **[확인]** 코드·시험으로 확인함 · **[결정 필요]** 영준님이 정할 항목 · **[확인 못 함]** 이 저장소와 작업 환경에서 확인할 수 없음

---

## 1. 스위치

| 이름 | 종류 | 뜻 |
|---|---|---|
| `PAYMENTS_ENABLED` | 서버 | 값이 정확히 `"true"`이고 `MONETIZATION_ENABLED`도 `"true"`일 때만 결제 API가 열립니다. 아니면 `/api/payments/*`는 404입니다. |
| `VITE_PAYMENTS_ENABLED` | 빌드 | `"true"`일 때만 결제 진행 화면(`src/ui/payments.ts`)을 넣어 빌드합니다. 꺼진 빌드의 "이용권 구매"는 이전처럼 "결제는 준비 중입니다"입니다. 이용권 화면(`VITE_MONETIZATION_ENABLED`)이 켜진 빌드에서만 쓰입니다. |
| `PAYMENT_PROVIDER` | 서버 | 결제사 이름입니다. 지금은 `fake`만 있습니다. |

- **[확인]** 모든 스위치가 꺼진 빌드의 dist는 `ef5c803` 빌드와 같습니다(608개 파일).
- **[확인]** 이용권 켜짐·결제 꺼짐 빌드의 dist도 `ef5c803`의 같은 조건 빌드와 같습니다(613개 파일).
- `fake`는 두 곳에서 막습니다.
  - Production(`VERCEL_ENV=production`)이면 서버가 설정 오류(500 `server_misconfigured`)로 거부합니다.
  - Production 빌드 검사(`scripts/check-production.ts`)도 실패합니다.
- 결제 스위치 세 개는 Preview 시험용입니다. Production에는 넣지 않습니다(`.env.example`에 적음).

## 2. 구조
```
server/payments/
  config.ts     스위치(paymentsEnabled), 결제사 이름, Production 여부
  provider.ts   결제사 인터페이스(PaymentProvider): prepare, confirm, cancel, verifyWebhook
  fake.ts       가짜 결제사(서명한 결제 키·웹훅, 실제 결제 없음)
  providers.ts  환경 변수로 결제사 고르기(fake는 Production 거부, 모르는 이름은 설정 오류)
  store.ts      저장소 인터페이스 + Supabase 구현(service_role) + 메모리 구현(시험용)
  service.ts    주문 만들기, 결제 확인, 결제 전 취소, 웹훅 반영, 환불(운영자용 함수)
  handlers.ts   HTTP 처리 함수
api/payments/{order,confirm,cancel,fake-approve,webhook}.ts   Vercel 함수
src/ui/payments.ts, src/styles/payments.css                    결제 진행 화면(VITE_PAYMENTS_ENABLED 빌드에만)
supabase/migrations/20261007000000_payment_orders.sql          주문 테이블(실행하지 않음)
scripts/payments-test.ts                                       시험(test:api, test:payments)
```

### API (모두 POST, 결제 스위치가 꺼져 있으면 404)
| 경로 | 로그인 | 본문 | 하는 일 |
|---|---|---|---|
| `/api/payments/order` | 필요 | 없음 | 주문 만들기. 주문번호·금액(서버 상수 2,900원)·상품 이름은 서버가 정합니다. 이미 이용권이 있으면 409. |
| `/api/payments/confirm` | 필요 | `orderId, paymentKey, amount` | 결제사에 서버 대 서버로 확인한 뒤에만 이용권을 줍니다. `amount`는 비교용이고 주문 금액과 달라도 이용권을 주지 않습니다. |
| `/api/payments/cancel` | 필요 | `orderId` | 결제창에서 취소한 본인의 결제 전 주문을 닫습니다. |
| `/api/payments/fake-approve` | 없음 | `orderId, amount, outcome` | 가짜 결제사의 "결제창"(시험용)입니다. 결제 키만 만들고, 이것만으로는 아무것도 바뀌지 않습니다. 가짜 결제사가 아니면 404. |
| `/api/payments/webhook` | 없음(서명) | 결제사 알림 | 서명이 틀리면 401. 같은 알림이 다시 와도 한 번만 반영합니다. |

- 환불은 화면·API가 없고 `service.ts`의 `refundOrder()`(운영자용)뿐입니다.
- 결제사 관리 화면에서 환불하면 `refunded` 웹훅으로 같은 결과가 됩니다.
- **[결정 필요]** 운영자 환불 도구(스크립트 또는 관리 화면)는 결제사가 정해진 뒤 만듭니다.

## 3. 주문 상태 전이
```
           결제 확인 성공 / paid 웹훅            환불 함수 / refunded·canceled 웹훅
pending ─────────────────────────────→ paid ───────────────────────────────→ refunded
   │                                    (이용권 부여 1회)                       (이 주문의 이용권 회수)
   ├── 결제 확인 실패 / failed 웹훅 ───→ failed
   └── 결제창 취소 / canceled 웹훅 ────→ canceled
```
- 모든 전이는 "지금 상태가 이전 상태일 때만" 바꾸는 조건부 갱신입니다(`store.transition`). 같은 확인이나 웹훅이 동시에 여러 번 와도 한 번만 반영됩니다.
- 이용권은 pending → paid가 실제로 일어난 그 한 번에만 부여합니다. 회수도 paid → refunded가 일어난 그 한 번에만, 그 주문으로 받은 이용권일 때만 합니다.
- failed·canceled·refunded 주문은 다시 확인해도 409이고 이용권이 생기지 않습니다. 다시 사려면 새 주문을 만듭니다.
- 결제 확인에서 결제사가 승인했더라도 주문번호·금액이 주문과 다르면 failed로 두고 이용권을 주지 않습니다.
  - **[결정 필요]** 이 경우 실제로 승인된 돈을 자동으로 취소할지는 정해야 합니다. 지금은 표시만 합니다.
- pending 주문은 만료 처리가 없습니다.
  - **[결정 필요]** 오래된 pending을 정리할지 정해야 합니다.

## 4. 저장 항목
- 기존 `entitlements`(결정된 항목): 계정 ID, 이용권 상태, 구매 시각, 주문번호.
  - 결제 확인 때 `order_id`를 채웁니다(지금까지는 늘 비어 있었음).
- 새 `payment_orders` 테이블 (**[결정 필요]** 개인정보 문구 갱신 대상)

| 필드 | 이유 |
|---|---|
| `order_id` | 주문번호(결정된 항목). 결제사·이용권과 연결합니다. |
| `user_id` | 계정 ID(결정된 항목). 주문 주인을 확인합니다(다른 계정 확인 거부). |
| `amount` | **추가.** 결제사가 알려 준 금액과 대조합니다(금액 변조 거부). 서버 상수와 같은 값입니다. |
| `status` | **추가.** 주문 상태. 멱등성(한 번만 반영)과 실패·취소·환불 구분에 필요합니다. |
| `provider` | **추가.** 어느 결제사(또는 `fake`)의 주문인지. 시험 주문과 실제 주문을 가립니다. |
| `provider_payment_id` | **추가.** 결제사가 붙인 거래 식별자. 환불·취소 요청에 필요합니다. |
| `created_at`, `updated_at` | **추가.** 만든·바뀐 시각. 결제 기록과 오래된 pending 정리에 씁니다. |

- 저장하지 않는 것: 카드 번호·결제 수단·이름·연락처·이메일, 답안·진단 결과·프로필 사진.
- RLS: anon 접근 불가, 로그인 사용자는 자기 주문 읽기만, 쓰기는 서버(service_role)만입니다(기존 entitlements와 같은 방식).
- 마이그레이션은 파일만 추가했고 실행하지 않았습니다. 기존 마이그레이션 파일은 고치지 않았습니다.

## 5. 계정 삭제
- 지금 흐름(`server/accounts.ts` `deleteAccount`): entitlements 행 삭제 → Supabase Auth 계정 삭제.
- 새 `payment_orders`는 `user_id ... references auth.users on delete cascade`라, 계정이 지워질 때 주문도 함께 지워집니다. 그래서 삭제 코드는 고치지 않았습니다.
- **[결정 필요·확인 필요]** 전자상거래 관련 법령 등으로 결제 기록(주문번호·금액·결제 시각)을 일정 기간 보관해야 하는지 확인해야 합니다. 보관해야 하면 이렇게 바꿔야 합니다.
  - cascade 대신 계정 연결만 끊음(`on delete set null`)
  - 또는 보관용 별도 기록
- **[결정 필요]** 결제창을 연 상태(pending)에서 계정을 지우면, 그 뒤 결제가 승인돼도 주문이 없어 이용권을 줄 수 없습니다. 이 경우의 환불 절차를 정해야 합니다.

## 6. 중복 결제 정책 (**[결정 필요]**, 코드로 정하지 않음)
지금 동작은 다음과 같습니다.
- 이미 이용권이 있는 계정은 새 주문을 만들 수 없습니다(409 `already_entitled`).
- 이용권이 없을 때 주문을 두 개 만들어 둘 다 결제한 경우: 두 번째 주문도 paid가 되고 이용권은 첫 주문 그대로입니다. 응답에 `duplicate: true`가 들어가고, 화면은 "결제가 확인되었지만 이 계정에는 이미 이용권이 있습니다. 처리 방법은 문의해 주세요."를 보여 줍니다.

선택지는 세 가지입니다.
1. 자동 환불: duplicate인 주문은 확인 직후 결제사 취소 API로 바로 환불합니다. 이용자 불편이 없지만 자동 환불 실패 처리가 필요합니다.
2. 환불 대상으로 표시만: 주문 상태를 따로 두고(예: `paid_duplicate`), 운영자가 확인해 환불합니다. 단순하지만 처리 지연이 생깁니다.
3. 결제 단계에서 막기: 결제창을 열기 직전에 다시 확인하거나 계정당 pending 주문을 1개로 제한해 중복 자체를 줄입니다. 1·2와 함께 쓰는 보완책입니다.

## 7. 무료 1회 뒤 막다른 길
- 결제 켜짐(구현함): "무료 진단을 이미 사용했습니다" 화면에서 다음 순서로 이어집니다.
  1. 게스트에게 "로그인하고 이용권 구매" 버튼
  2. 로그인
  3. 이용권 구매 화면
  4. 결제
  5. "새 문제로 진단"
- 결제 꺼짐(바꾸지 않음): 지금처럼 "홈으로"만 있습니다.

**[결정 필요]** 결제 꺼짐 상태의 막다른 길을 푸는 선택지는 네 가지입니다.
1. 결제 도입 전에는 무료 1회 제한을 끄기: 이용권 켜짐이어도 무료 결과는 계속 볼 수 있게 하고, 무료 1회는 결제와 함께 켜기.
2. 무료 1회 제한을 날짜 단위로 완화하기(예: 하루 1회). 저장 키와 안내 문구가 바뀝니다.
3. 결제 도입 전에는 이용권 스위치 자체를 Production에서 켜지 않기(설정만으로 가능, 코드 변경 없음).
4. 막힌 화면에 "기본 결과(요약·해설 2개)는 계속 무료" 안내와 다시 풀기 버튼 두기(무료 1회 정의를 "전체 리포트 1회"로 바꾸는 것).

## 8. 실제 결제사 어댑터가 채울 항목
결제사가 정해지면 `server/payments/`에 어댑터 하나(예: `toss.ts`)를 추가합니다. 그다음 `providers.ts`의 `resolveProvider`에 이름을 연결하고 화면의 결제창 부분(`src/ui/payments.ts`)을 채웁니다.
**[확인 못 함]** 토스페이먼츠 등 특정 결제사의 실제 규격(필드 이름, 주문번호 형식, 서명 방식, 웹훅 재전송 규칙)은 확인하지 않았습니다. 아래는 필요한 모양만 적은 것입니다.

| 인터페이스 | 필요한 입력 | 필요한 출력 | 확인할 것 |
|---|---|---|---|
| `prepare(order)` | 주문번호, 금액, 상품 이름 | 브라우저가 결제창을 열 값(`Checkout`). 예: 공개 키, 성공·실패 복귀 주소. 지금 종류는 `fake`뿐이라 새 종류를 추가해야 함 | 주문번호 허용 문자·길이, 복귀 주소 형식, 공개 키 이름 |
| `confirm({orderId, amount, paymentKey})` | 결제창에서 돌아온 결제 키, 서버의 주문 금액 | 승인되면 결제사의 주문번호·금액·거래 식별자, 거절이면 사유 코드, 연결 실패는 `unavailable` | 서버 대 서버 승인 API, 인증 방식(비밀 키), 같은 결제 키를 두 번 승인할 때의 응답 |
| `cancel({paymentId, amount, reason})` | 거래 식별자, 금액, 사유 | 성공 여부 | 취소·환불 API, 부분 환불 여부, 이미 취소된 거래의 응답 |
| `verifyWebhook(rawBody, headers)` | 원본 본문, 헤더 | 결제사와 무관한 이벤트(`eventId`, `type`, `orderId`, `paymentId`, `amount`) 또는 서명 실패 `null` | 서명 헤더·알고리즘·비밀 값, 이벤트 종류 이름, 재전송 규칙 |

- 복귀 처리: 결제창에서 돌아오는 주소(예: `/diagnosis/?payment=success&...`)를 화면이 받아 `/api/payments/confirm`을 부르는 부분이 필요합니다. 지금은 가짜 결제사가 사이트 안 창이라 이 부분이 없습니다.
- 웹훅 주소 `https://<도메인>/api/payments/webhook`를 결제사 관리 화면에 등록해야 합니다.

## 9. 환경 변수 이름 (값은 적지 않음)
| 이름 | 종류 | Preview(시험) | Production |
|---|---|---|---|
| `PAYMENTS_ENABLED` | 서버 | 시험할 때 `true` | 넣지 않음(결제사 확정·검토 전) |
| `VITE_PAYMENTS_ENABLED` | 빌드 | 시험할 때 `true` | 넣지 않음 |
| `PAYMENT_PROVIDER` | 서버 | `fake` | 넣지 않음. `fake`면 빌드·서버 모두 거부 |
| `MONETIZATION_ENABLED`, `VITE_MONETIZATION_ENABLED` | 서버·빌드 | `true`(결제는 이용권이 켜져야 의미 있음) | 별도 결정(로그인 공개 점검표 참고) |
| `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` | 빌드(공개 값) | 필요 | 로그인 공개 때 필요 |
| `SUPABASE_SERVICE_ROLE_KEY` | 서버 비밀 값 | 필요(주문 저장) | 로그인 공개 때 필요 |
| `REPORT_TOKEN_SECRET` | 서버 비밀 값 | 이미 있음. 가짜 결제사의 서명 키도 여기서 파생 | 이미 있음 |
| (가칭) `PAYMENT_SECRET_KEY` | 서버 비밀 값 | 실제 결제사 시험 때 | 실제 결제사 연결 때 |
| (가칭) `PAYMENT_WEBHOOK_SECRET` | 서버 비밀 값 | 결제사가 웹훅 비밀 값을 쓰면 | 같음 |
| (가칭) `VITE_PAYMENT_CLIENT_KEY` | 빌드(공개 값) | 결제창용 공개 키가 있으면 | 같음 |

- 가칭 세 개는 코드에서 아직 쓰지 않습니다. 서버 전용 두 개(`PAYMENT_SECRET_KEY`, `PAYMENT_WEBHOOK_SECRET`)는 `check:bundle`이 번들에 나오면 실패하도록 미리 넣었습니다.

## 10. 시험
- `npm run test:payments`(`npm run test:api`에도 포함): 시나리오 (a)~(j). 저장소 두 가지(메모리, 모의 Supabase를 쓰는 실제 supabase-js 경로)로 같은 시나리오를 돌립니다.
- 모의 Supabase(`scripts/mock-supabase.ts`)에 `payment_orders`와 entitlements 쓰기(upsert·update)를 흉내 내는 부분을 더했습니다. 필터는 `eq`, `in`만 지원합니다.
