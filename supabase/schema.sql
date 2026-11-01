-- chem-study 전용 테이블입니다. Supabase SQL Editor에서 한 번 실행합니다.
begin;

create table if not exists public.study_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  target_round smallint not null default 1 check (target_round between 1 and 10)
);
create table if not exists public.report_links (
  user_id uuid primary key references auth.users(id) on delete cascade,
  report_url text not null check (char_length(report_url) <= 600),
  snapshot jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now()
);
create table if not exists public.study_answers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  session_id uuid not null,
  question_id text not null check (char_length(question_id) <= 160),
  concept text not null check (char_length(concept) <= 300),
  source text not null check (source in ('DT','exam')),
  round smallint not null check (round between 1 and 10),
  mode text not null check (mode in ('review','exam')),
  selected_answer text not null check (selected_answer in ('O','X','1','2','3','4')),
  correct boolean not null,
  created_at timestamptz not null default now(),
  unique (user_id, session_id, question_id)
);
create index if not exists study_answers_user_time on public.study_answers(user_id, created_at desc);

alter table public.study_profiles enable row level security;
alter table public.report_links enable row level security;
alter table public.study_answers enable row level security;

revoke all on public.study_profiles, public.report_links, public.study_answers from anon, authenticated;
grant usage on schema public to authenticated;
grant select, insert, update on public.study_profiles, public.report_links to authenticated;
grant select, insert on public.study_answers to authenticated;

do $$
declare tab text;
begin
  foreach tab in array array['study_profiles','report_links','study_answers'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=tab and policyname='read_own') then
      execute format('create policy read_own on public.%I for select to authenticated using ((select auth.uid()) = user_id)',tab);
    end if;
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=tab and policyname='insert_own') then
      execute format('create policy insert_own on public.%I for insert to authenticated with check ((select auth.uid()) = user_id)',tab);
    end if;
  end loop;
  foreach tab in array array['study_profiles','report_links'] loop
    if not exists (select 1 from pg_policies where schemaname='public' and tablename=tab and policyname='update_own') then
      execute format('create policy update_own on public.%I for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id)',tab);
    end if;
  end loop;
end $$;
commit;

-- 기존 프로젝트는 bookmarks.sql만 추가 실행하셔도 됩니다.
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
