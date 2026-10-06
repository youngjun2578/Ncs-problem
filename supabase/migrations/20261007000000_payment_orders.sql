-- 결제 주문(payment_orders) 테이블
-- 결제 뼈대(가지 payment-skeleton)용. 아직 운영 프로젝트에서 실행하지 않는다(결제사 확정·개인정보 문구 갱신 뒤 결정).
--
-- 저장 원칙: 결제 확인·환불에 꼭 필요한 값만 둔다.
--   - 주문번호, 계정 ID, 금액(서버 상수와 대조), 주문 상태, 결제사 이름, 결제사 거래 식별자(환불 요청에 필요), 만든·바뀐 시각
--   - 카드 번호·결제 수단·이름·연락처·풀이 답안·진단 결과는 저장하지 않는다.
--   - 이용권 자체는 기존 entitlements 테이블(계정 ID, 상태, 구매 시각, 주문번호)에 둔다.
--
-- 계정 삭제: auth.users 행이 지워지면 on delete cascade로 주문도 함께 지워진다(기존 entitlements와 같은 방식).
--   결제 기록 보관 의무가 있는지는 확인이 필요하다(docs/payments-plan.md).
--
-- 접근 권한(기존 entitlements와 같은 원칙)
--   - 로그인한 사용자(authenticated): 자기 주문 읽기만
--   - 비로그인(anon): 접근 불가
--   - 쓰기·수정·삭제: 서버(service_role)만

create table if not exists public.payment_orders (
  order_id            text primary key check (order_id ~ '^[A-Za-z0-9_-]{6,64}$'),
  user_id             uuid not null references auth.users (id) on delete cascade,
  amount              integer not null check (amount > 0),
  status              text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'canceled', 'refunded')),
  provider            text not null,
  provider_payment_id text unique,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists payment_orders_user_id_idx on public.payment_orders (user_id);

comment on table public.payment_orders is '결제 주문. 상태: pending → paid → refunded, pending → failed/canceled.';
comment on column public.payment_orders.amount is '주문 금액(원). 서버 상수로 정하고 결제사 확인 결과와 대조한다.';
comment on column public.payment_orders.provider_payment_id is '결제사가 붙인 거래 식별자. 환불·취소 요청에 쓴다.';

alter table public.payment_orders enable row level security;

revoke all on table public.payment_orders from anon, authenticated;
grant select on table public.payment_orders to authenticated;
grant select, insert, update, delete on table public.payment_orders to service_role;

drop policy if exists "본인 주문 읽기" on public.payment_orders;
create policy "본인 주문 읽기"
  on public.payment_orders
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
