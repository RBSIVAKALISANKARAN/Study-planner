create extension if not exists "pgcrypto";

create table public.profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  display_name     text,
  is_admin         boolean default false,
  streak_count     integer default 0,
  last_active_date date,
  created_at       timestamptz default now()
);

create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, new.raw_user_meta_data->>'display_name');
  return new;
end;
$$ language plpgsql security definer;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

create table public.subjects (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles(id) on delete cascade,
  name       text not null,
  color      text default '#3B82F6',
  created_at timestamptz default now(),
  unique (user_id, name)
);
create index idx_subjects_user on public.subjects(user_id);

create table public.topics (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  subject_id      uuid not null references public.subjects(id) on delete cascade,
  name            text not null,
  current_mastery integer default 0 check (current_mastery between 0 and 100),
  created_at      timestamptz default now(),
  unique (user_id, subject_id, name)
);
create index idx_topics_user    on public.topics(user_id);
create index idx_topics_subject on public.topics(subject_id);

create table public.review_states (
  id               uuid primary key default gen_random_uuid(),
  topic_id         uuid not null unique references public.topics(id) on delete cascade,
  ease_factor      numeric(4,2) default 2.50,
  interval_days    integer default 0,
  repetitions      integer default 0,
  next_review_date date default current_date,
  last_review_date date,
  updated_at       timestamptz default now()
);
create index idx_review_states_next on public.review_states(next_review_date);

create table public.study_events (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references public.profiles(id) on delete cascade,
  topic_id          uuid not null references public.topics(id) on delete cascade,
  event_type        text not null default 'timer'
                      check (event_type in ('timer', 'quick', 'pomodoro')),
  start_time        timestamptz,
  end_time          timestamptz,
  duration_minutes  integer check (duration_minutes > 0),
  confidence_rating integer not null check (confidence_rating between 1 and 5),
  focus_rating      integer check (focus_rating between 1 and 5),
  pomodoro_cycles   integer default 0,
  velocity_units    integer,
  notes             text,
  created_at        timestamptz default now()
);
create index idx_study_events_user_time on public.study_events(user_id, start_time desc);
create index idx_study_events_topic     on public.study_events(topic_id);

create table public.goals (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  subject_id   uuid not null references public.subjects(id) on delete cascade,
  target_hours numeric(5,2) not null check (target_hours > 0),
  week_start   date not null,
  week_end     date not null,
  created_at   timestamptz default now(),
  unique (user_id, subject_id, week_start)
);
create index idx_goals_user_week on public.goals(user_id, week_start);

create table public.leaderboard_opt_ins (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  is_visible boolean default false,
  alias      text
);

alter table public.profiles enable row level security;
create policy "Users view own profile"
  on public.profiles for select using (auth.uid() = id);
create policy "Users update own profile"
  on public.profiles for update using (auth.uid() = id);

alter table public.subjects enable row level security;
create policy "Owner CRUD"
  on public.subjects for all using (auth.uid() = user_id);

alter table public.topics enable row level security;
create policy "Owner CRUD"
  on public.topics for all using (auth.uid() = user_id);

alter table public.review_states enable row level security;
create policy "Owner CRUD"
  on public.review_states for all using (
    exists (
      select 1 from public.topics
      where topics.id = review_states.topic_id
      and topics.user_id = auth.uid()
    )
  );

alter table public.study_events enable row level security;
create policy "Owner CRUD"
  on public.study_events for all using (auth.uid() = user_id);

alter table public.goals enable row level security;
create policy "Owner CRUD"
  on public.goals for all using (auth.uid() = user_id);

alter table public.leaderboard_opt_ins enable row level security;
create policy "Owner manage own"
  on public.leaderboard_opt_ins for all using (auth.uid() = user_id);
create policy "Public read visible"
  on public.leaderboard_opt_ins for select using (is_visible = true);
