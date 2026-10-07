-- ⚠️ 주의: 프리뷰(Preview)와 운영(Production)이 같은 Supabase 프로젝트를 쓴다.
-- ⚠️ 이 SQL을 실행하면 운영 DB에도 그대로 적용된다. 실행 전 docs/supabase-payment-live-test.md의 절차를 먼저 읽는다.
--
-- 결제 중복·동시성 방어 제약(가지 payment-hardening). 20261007000000_payment_orders.sql을 실행한 뒤에 실행한다.
-- 저장 필드는 추가하지 않는다(인덱스·제약만).
-- 다시 실행해도 오류가 나지 않는다(if not exists). 이미 있는 데이터가 제약을 어기면 아무것도 바꾸지 않고 멈춘다(아래 1번).
--
-- 이미 있어서 이 파일에서 만들지 않는 것
--   - 이용권 계정당 1행: entitlements.user_id가 기본키(20261005000000_entitlements.sql)라서 이미 보장된다.
--   - 결제사 거래 식별자 중복 금지: payment_orders.provider_payment_id에 unique가 이미 있다(20261007000000).
--     결제사와 상관없이 같은 값을 막으므로 (provider, provider_payment_id) 유니크보다 넓게 막는다. 비어 있는(null) 행은 유니크 검사에서 빠진다.
--   - status 값 제한(pending/paid/failed/canceled/refunded), amount > 0: 20261007000000의 check 제약에 이미 있다.

-- 1) 계정당 결제 대기(pending) 주문 1개
-- 이유: 같은 계정이 결제창을 여러 번 열거나 주문 요청이 동시에 와도 결제 대기 주문이 하나만 생기게 해서, 한 계정이 이중 결제하는 길을 DB에서 막는다.

-- 이미 한 계정에 pending 주문이 둘 이상 있으면 인덱스를 만들 수 없다. 이때는 아무것도 바꾸지 않고 멈춘다(운영자가 확인 후 정리).
do $$
begin
  if exists (
    select 1 from public.payment_orders
    where status = 'pending'
    group by user_id
    having count(*) > 1
  ) then
    raise exception '한 계정에 결제 대기(pending) 주문이 둘 이상 있어 제약을 만들 수 없습니다. docs/supabase-payment-live-test.md의 "pending 중복 확인" 조회로 먼저 정리하세요.';
  end if;
end
$$;

create unique index if not exists payment_orders_one_pending_per_user
  on public.payment_orders (user_id)
  where status = 'pending';

comment on index public.payment_orders_one_pending_per_user is '계정당 결제 대기(pending) 주문 1개. 서버는 위반(23505)을 받으면 이미 있는 주문을 이어 쓴다.';
