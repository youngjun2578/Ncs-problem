-- ============================================================================
-- [개발·시험 전용] 이용권 수동 부여 / 회수 예시
--
--   !!! 운영(Production) 프로젝트에서 실행하지 마세요 !!!
--   결제 없이 이용권을 만들어 주는 SQL입니다. 개발용 Supabase 프로젝트에서
--   로그인 시험 계정에 이용권을 줄 때만 씁니다.
--
-- 사용법: SQL Editor에서 아래 이메일 또는 사용자 ID를 시험 계정 값으로 바꿔 실행.
--   사용자 ID는 대시보드 Authentication → Users에서 확인할 수 있습니다.
--   (카카오는 이메일이 없을 수 있으므로 사용자 ID로 지정하는 쪽을 권장)
-- ============================================================================

-- 1) 사용자 ID로 부여
insert into public.entitlements (user_id, status, purchased_at)
values ('00000000-0000-0000-0000-000000000000', 'active', now())
on conflict (user_id) do update set status = 'active', purchased_at = excluded.purchased_at;

-- 2) 이메일로 부여 (이메일이 있는 계정만)
-- insert into public.entitlements (user_id, status, purchased_at)
-- select id, 'active', now() from auth.users where email = 'tester@example.com'
-- on conflict (user_id) do update set status = 'active', purchased_at = excluded.purchased_at;

-- 3) 회수 (행을 지우거나 상태를 revoked로)
-- update public.entitlements set status = 'revoked' where user_id = '00000000-0000-0000-0000-000000000000';
-- delete from public.entitlements where user_id = '00000000-0000-0000-0000-000000000000';
