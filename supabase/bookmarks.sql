-- 별표 기능 추가 시 Supabase SQL Editor에서 한 번 실행해 주세요.
-- 문제 내용과 정답은 저장하지 않고 원문 문제 번호만 연결합니다.
begin;
create table if not exists public.study_bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  question_id text not null check (char_length(question_id) <= 160),
  concept text not null check (char_length(concept) <= 300),
  round smallint not null check (round between 1 and 10),
  created_at timestamptz not null default now(),
  primary key (user_id, question_id)
);
alter table public.study_bookmarks enable row level security;
revoke all on public.study_bookmarks from anon, authenticated;
grant select, insert, update, delete on public.study_bookmarks to authenticated;
do $$
begin
  if not exists (select 1 from pg_policies where schemaname='public' and tablename='study_bookmarks' and policyname='bookmarks_own') then
    create policy bookmarks_own on public.study_bookmarks for all to authenticated
      using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
  end if;
end $$;
commit;
