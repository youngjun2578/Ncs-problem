-- 이용권(entitlements) 테이블
-- Supabase 대시보드 → SQL Editor에서 한 번 실행한다.
--
-- 저장 원칙: 계정 ID, 이용권 상태(구매 여부·구매 시각), 결제 주문 번호 자리만 둔다.
--   - 풀이 답안·풀이 시간·진단 결과·이름·프로필 사진은 저장하지 않는다.
--   - 로그인 방식(구글/카카오)은 Supabase Auth가 auth.users에 이미 보관하므로 여기 따로 두지 않는다.
--   - 행이 없으면 이용권이 없는 것이다(로그인만으로는 행을 만들지 않는다).
--
-- 접근 권한
--   - 로그인한 사용자(authenticated): 자기 행 읽기만 가능
--   - 비로그인(anon): 접근 불가
--   - 쓰기·수정·삭제: 서버(service_role 키)만. service_role은 RLS를 우회한다.

create table if not exists public.entitlements (
  user_id      uuid primary key references auth.users (id) on delete cascade,
  status       text not null default 'active' check (status in ('active', 'revoked')),
  purchased_at timestamptz not null default now(),
  -- 결제 도입(3단계) 후 결제 주문 번호. 지금은 비워 둔다.
  order_id     text unique
);

comment on table public.entitlements is '이용권 상태. 행이 있고 status = active이면 이용권 있음.';
comment on column public.entitlements.order_id is '결제 주문 번호(3단계에서 사용). 비어 있을 수 있음.';

-- 행 단위 보안
alter table public.entitlements enable row level security;

-- 스키마 사용 권한: 프로젝트 기본값에 기대지 않고 명시한다. grant는 이미 있으면 그대로 두므로 다시 실행해도 오류가 없다.
grant usage on schema public to authenticated, service_role;

-- 테이블 권한: 기본으로 주어질 수 있는 권한을 먼저 모두 거두고 필요한 것만 준다
revoke all on table public.entitlements from anon, authenticated;
grant select on table public.entitlements to authenticated;
grant select, insert, update, delete on table public.entitlements to service_role;

-- 정책: 로그인한 사용자는 자기 행만 읽는다. insert/update/delete 정책은 만들지 않는다(클라이언트 쓰기 차단).
drop policy if exists "본인 이용권 읽기" on public.entitlements;
create policy "본인 이용권 읽기"
  on public.entitlements
  for select
  to authenticated
  using ((select auth.uid()) = user_id);
