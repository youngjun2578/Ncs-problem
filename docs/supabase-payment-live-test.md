# 실제 Supabase 결제 테이블 시험 절차

> ## ⚠️ 먼저 읽으세요: 운영 DB와 같은 프로젝트입니다
> 프리뷰(Preview)와 운영(Production)은 **같은 Supabase 프로젝트**를 씁니다.
> 아래 SQL을 실행하거나 시험 스크립트를 돌리면 **운영 DB가 바로 바뀝니다**.
> - 실제 이용자의 이용권(`entitlements`)이 같은 프로젝트에 있습니다. 이 문서에 없는 SQL은 실행하지 마세요.
> - `delete`, `drop`, `update`는 이 문서의 시험 데이터 지우기 외에는 쓰지 마세요.
> - 이용자가 적은 시간에 하고, 시작 전에 대시보드에서 백업 상태를 확인하세요(Database → Backups. 무료 요금제는 자동 백업이 없을 수 있음, 확인 못 함).

이 문서는 Supabase 대시보드 화면을 직접 보지 못하고 썼습니다(작성 환경에서 접속 불가). 메뉴 이름·버튼 위치가 실제와 다를 수 있으니, 다르면 비슷한 이름을 찾으세요.

## 0. 실행할 파일과 순서
`supabase/migrations/` 폴더의 파일을 이름 순서대로 한 번씩 실행합니다.

| 순서 | 파일 | 하는 일 | 이미 실행했나요? |
|---|---|---|---|
| 1 | `20261005000000_entitlements.sql` | 이용권 테이블 | 로그인·이용권을 켤 때 이미 실행했을 수 있음. 2절 확인 SQL로 먼저 보세요 |
| 2 | `20261007000000_payment_orders.sql` | 결제 주문 테이블(새 저장 항목) | **[결정 필요]** 개인정보 문구 갱신·결제사 확정 뒤 실행하기로 한 파일입니다. 실행하면 운영 DB에도 빈 테이블이 생깁니다 |
| 3 | `20261008000000_payment_constraints.sql` | 계정당 결제 대기 주문 1개 제약 | 2번 뒤에 실행 |

모든 파일은 다시 실행해도 오류가 나지 않게(`if not exists` 등) 썼습니다.

## 1. SQL Editor에서 마이그레이션 실행하기
1. 브라우저에서 Supabase 대시보드(supabase.com/dashboard)에 로그인합니다.
2. 프로젝트 목록에서 이 사이트의 프로젝트를 누릅니다.
3. 왼쪽 세로 메뉴에서 **SQL Editor**(`>_` 모양 아이콘)를 누릅니다.
4. 왼쪽 위 **+ New query**(또는 **New SQL snippet**)를 누릅니다. 빈 편집 창이 열립니다.
5. 저장소의 마이그레이션 파일을 텍스트 편집기로 열어 **내용 전체**를 복사해 편집 창에 붙여 넣습니다.
6. 오른쪽 아래 초록색 **Run** 버튼(또는 Ctrl+Enter, Mac은 Cmd+Enter)을 누릅니다.
7. 아래 결과 창에 `Success. No rows returned`가 나오면 성공입니다.
   - "destructive operation" 같은 확인 창이 뜨면, 붙여 넣은 내용이 이 저장소 파일 그대로인지 다시 본 뒤 진행합니다(`drop policy if exists` 때문에 뜰 수 있음).
   - 3번 파일에서 `한 계정에 결제 대기(pending) 주문이 둘 이상 있어…` 오류가 나면 아무것도 바뀌지 않은 것입니다. 5절의 "pending 중복 확인"을 먼저 보세요.
8. 파일마다 4~7을 반복합니다(한 창에 여러 파일을 섞지 마세요).

## 2. 실행 뒤 확인 SQL (읽기만 함)
새 쿼리 창에 하나씩 붙여 넣고 Run 합니다.

테이블이 있는지
```sql
select table_name
from information_schema.tables
where table_schema = 'public' and table_name in ('entitlements', 'payment_orders');
```
→ 두 줄(`entitlements`, `payment_orders`)이 나와야 합니다.

인덱스·유니크 제약
```sql
select tablename, indexname, indexdef
from pg_indexes
where schemaname = 'public' and tablename in ('entitlements', 'payment_orders')
order by tablename, indexname;
```
→ 다음이 보여야 합니다.
- `entitlements_pkey`(user_id): 계정당 이용권 1행
- `payment_orders_pkey`(order_id)
- `payment_orders_provider_payment_id_key`(provider_payment_id): 거래 식별자 중복 금지
- `payment_orders_user_id_idx`
- `payment_orders_one_pending_per_user` … `WHERE (status = 'pending'::text)`: 계정당 결제 대기 1개

check 제약(status 값, amount > 0)
```sql
select conrelid::regclass as table_name, conname, pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in ('public.entitlements'::regclass, 'public.payment_orders'::regclass)
order by 1, 2;
```

RLS가 켜져 있는지
```sql
select relname as table_name, relrowsecurity as rls_enabled
from pg_class
where relnamespace = 'public'::regnamespace and relname in ('entitlements', 'payment_orders');
```
→ 두 줄 모두 `rls_enabled`가 `true`여야 합니다.

정책과 역할별 권한
```sql
select tablename, policyname, roles, cmd from pg_policies
where schemaname = 'public' and tablename in ('entitlements', 'payment_orders');

select table_name, grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('entitlements', 'payment_orders')
  and grantee in ('anon', 'authenticated', 'service_role')
order by table_name, grantee, privilege_type;
```
→ 정책은 테이블마다 `authenticated`의 `SELECT` 하나씩입니다. 권한은 `anon` 없음, `authenticated`는 `SELECT`만, `service_role`은 `SELECT/INSERT/UPDATE/DELETE`가 보여야 합니다.

## 3. anon(비로그인) 역할로 막히는지 확인
SQL Editor는 기본으로 관리자 역할(`postgres`)로 실행됩니다. 아래처럼 **트랜잭션 안에서만** 역할을 바꿔 시험하고, 마지막 `rollback`으로 원래대로 돌립니다.
- `set local role`은 그 트랜잭션 안에서만 효과가 있어서, `rollback`(또는 오류)으로 트랜잭션이 끝나면 역할이 자동으로 원래대로 돌아옵니다.
- **블록 하나씩** 따로 붙여 넣어 Run 하세요. 오류가 나면 그 블록은 거기서 멈추고 아무것도 바뀌지 않습니다.

읽기(기대: `permission denied for table payment_orders` 오류)
```sql
begin;
set local role anon;
select count(*) from public.payment_orders;
rollback;
```

읽기(기대: `permission denied for table entitlements` 오류)
```sql
begin;
set local role anon;
select count(*) from public.entitlements;
rollback;
```

쓰기(기대: `permission denied` 오류. 오류가 나므로 실제로 들어가지 않고, 마지막 rollback이 한 번 더 막습니다)
```sql
begin;
set local role anon;
insert into public.payment_orders (order_id, user_id, amount, status, provider)
values ('ncs_livecheck_anon_test', '00000000-0000-0000-0000-000000000000', 1, 'paid', 'fake');
rollback;
```
```sql
begin;
set local role anon;
update public.entitlements set status = 'active' where user_id = '00000000-0000-0000-0000-000000000000';
rollback;
```

(선택) 로그인 사용자 역할: 남의 주문이 안 보이는지
```sql
begin;
set local role authenticated;
set local request.jwt.claims = '{"sub":"00000000-0000-0000-0000-000000000000","role":"authenticated"}';
select count(*) from public.payment_orders;   -- 기대: 0 (없는 계정이므로 자기 행 없음)
rollback;
```

원복 확인: 시험이 끝난 뒤 새 쿼리 창에서 아래를 Run 해 `postgres`가 나오면 원래 역할입니다.
```sql
select current_user;
```
혹시 `anon`이나 `authenticated`가 나오면 `reset role;`을 Run 한 뒤 다시 확인하세요.

## 4. 시험 스크립트(`scripts/live-supabase-check.ts`)
실제 DB에서 서버 코드(`server/payments/store.ts`)가 기대대로 동작하는지 확인합니다. 2·3절이 끝난 뒤에만 돌리세요.

확인 항목
1. 조건부 갱신(처음 한 번만 바뀜)
2. 이용권 "이미 있으면 무시"와 회수 뒤 다시 부여
3. 같은 계정 두 번째 pending 거부와 이어 쓰기
4. 동시 부여 5번에도 이용권 1회
5. 거래 식별자 재사용 거부
6. 계정 삭제 시 주문·이용권 cascade
7. anon 키 차단(공개 키가 있을 때)

준비
1. 저장소 맨 위에 `.env.local` 파일이 있어야 합니다. 이 파일은 `.gitignore`에 들어 있어 커밋되지 않습니다. 스크립트도 실행 전에 확인합니다.
2. `.env.local`에 다음 이름으로 값을 넣습니다(값은 대시보드의 Project Settings → API 또는 API Keys에서 복사. 메뉴 이름 확인 못 함).
   - `SUPABASE_URL`(또는 `VITE_SUPABASE_URL`)
   - `SUPABASE_SERVICE_ROLE_KEY`: 서비스 키. 절대 공유·커밋하지 마세요.
   - `VITE_SUPABASE_ANON_KEY`: 공개 키, 선택. 있으면 7번 확인을 합니다.

실행
```sh
LIVE_CHECK_CONFIRM=yes npm run live:supabase-check
```
- `LIVE_CHECK_CONFIRM=yes`가 없으면 아무것도 하지 않고 끝납니다.
- 스크립트가 지키는 것
  - 키 값과 주소는 화면에 찍지 않습니다.
  - 이 실행에서 만든 시험 계정(`ncs-live-check-…@example.com`)과 시험 주문(`ncs_livecheck_…`)만 다룹니다.
  - 끝나면(실패해도, Ctrl+C로 멈춰도) 지웁니다.
- 기본 검증(`npm run test:api` 등)에는 들어가지 않습니다.
- 3번이 실패하면 `20261008000000` 마이그레이션이 실행되지 않은 것입니다.

## 5. 시험 데이터 지우기·문제 확인
시험 스크립트가 정리에 실패했다고 하면 아래로 지웁니다. 시험용 접두사가 붙은 것만 지웁니다.

지울 대상을 먼저 확인(읽기)
```sql
select id, email, created_at from auth.users where email like 'ncs-live-check-%@example.com';
select order_id, user_id, status from public.payment_orders where order_id like 'ncs_livecheck_%';
```

지우기: 시험 주문을 지운 뒤 시험 계정을 지웁니다. 계정을 지우면 그 계정의 이용권·주문도 cascade로 함께 지워집니다.
```sql
delete from public.payment_orders where order_id like 'ncs_livecheck_%';
delete from auth.users where email like 'ncs-live-check-%@example.com';
```
- SQL로 `auth.users`를 지울 수 없다는 오류가 나면 이렇게 지웁니다(확인 못 함).
  1. 왼쪽 메뉴 **Authentication → Users**로 갑니다.
  2. `ncs-live-check`로 검색합니다.
  3. 각 행의 메뉴에서 **Delete user**를 누릅니다.
- 지운 뒤 위 확인 SQL을 다시 Run 해서 0행인지 봅니다.

pending 중복 확인(3번 마이그레이션이 멈췄을 때, 읽기)
```sql
select user_id, count(*) as pending_orders, min(created_at), max(created_at)
from public.payment_orders
where status = 'pending'
group by user_id
having count(*) > 1;
```
- 나온 계정의 오래된 pending 주문을 어떻게 정리할지(canceled로 바꿀지)는 결제사 관리 화면에서 실제 결제 여부를 확인한 뒤 정합니다. 이 문서는 정리 SQL을 주지 않습니다.

제약을 되돌려야 할 때(3번 파일만 되돌림. 데이터는 바뀌지 않음)
```sql
drop index if exists public.payment_orders_one_pending_per_user;
```
