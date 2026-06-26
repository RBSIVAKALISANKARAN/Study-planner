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

ALTER TABLE topics ADD COLUMN IF NOT EXISTS description text;

-- ─── EXTEND EXISTING TABLES ───────────────────────────────────────

-- topics
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS position integer DEFAULT 0;
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS difficulty integer DEFAULT 3 CHECK (difficulty BETWEEN 1 AND 5);
ALTER TABLE public.topics ADD COLUMN IF NOT EXISTS estimated_hours numeric(5,2);

-- review_states (FSRS columns — existing SM2 columns untouched)
ALTER TABLE public.review_states ADD COLUMN IF NOT EXISTS stability numeric(6,2) DEFAULT 0;
ALTER TABLE public.review_states ADD COLUMN IF NOT EXISTS fsrs_difficulty numeric(4,2) DEFAULT 0;
ALTER TABLE public.review_states ADD COLUMN IF NOT EXISTS reps integer DEFAULT 0;
ALTER TABLE public.review_states ADD COLUMN IF NOT EXISTS lapses integer DEFAULT 0;
ALTER TABLE public.review_states ADD COLUMN IF NOT EXISTS fsrs_state integer DEFAULT 0;
ALTER TABLE public.review_states ADD COLUMN IF NOT EXISTS last_reviewed_at timestamptz;

-- profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS use_fsrs boolean DEFAULT false;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS plan_streak integer DEFAULT 0;

-- study_events: add mastery snapshot column
ALTER TABLE public.study_events ADD COLUMN IF NOT EXISTS mastery_after numeric(4,2);

-- study_events: update event_type constraint to allow 'feynman'
ALTER TABLE public.study_events DROP CONSTRAINT IF EXISTS study_events_event_type_check;
ALTER TABLE public.study_events ADD CONSTRAINT study_events_event_type_check
  CHECK (event_type IN ('timer', 'quick', 'pomodoro', 'feynman'));


-- ─── NEW TABLES ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.daily_plans (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  date            date NOT NULL,
  planned_tasks   jsonb DEFAULT '[]',
  completed_tasks jsonb DEFAULT '[]',
  completed       boolean DEFAULT false,
  created_at      timestamptz DEFAULT now(),
  UNIQUE (user_id, date)
);
CREATE INDEX IF NOT EXISTS idx_daily_plans_user_date ON public.daily_plans(user_id, date);

CREATE TABLE IF NOT EXISTS public.topic_relationships (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_topic_id   uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  child_topic_id    uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  relationship_type text DEFAULT 'prerequisite'
                      CHECK (relationship_type IN ('prerequisite', 'subtopic', 'related')),
  created_at        timestamptz DEFAULT now(),
  UNIQUE (parent_topic_id, child_topic_id)
);

CREATE TABLE IF NOT EXISTS public.questions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id      uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  type          text CHECK (type IN ('compare', 'apply', 'evaluate', 'analyze', 'create')),
  question_text text NOT NULL,
  model_answer  text,
  difficulty    integer CHECK (difficulty BETWEEN 1 AND 5),
  created_at    timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_questions_topic ON public.questions(topic_id);

CREATE TABLE IF NOT EXISTS public.resources (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  topic_id     uuid NOT NULL REFERENCES public.topics(id) ON DELETE CASCADE,
  type         text CHECK (type IN ('video', 'article', 'pdf', 'book', 'course')),
  url          text,
  title        text NOT NULL,
  completed    boolean DEFAULT false,
  notes        text,
  storage_path text,
  created_at   timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_resources_topic ON public.resources(topic_id);

CREATE TABLE IF NOT EXISTS public.syllabus_uploads (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE DEFAULT auth.uid(),
  original_filename text,
  storage_path      text,
  parsed_topics     jsonb,
  status            text DEFAULT 'pending'
                      CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
  created_at        timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_syllabus_uploads_user ON public.syllabus_uploads(user_id);

CREATE TABLE IF NOT EXISTS public.achievements (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type       text NOT NULL,
  awarded_at timestamptz DEFAULT now(),
  UNIQUE (user_id, type)
);
CREATE INDEX IF NOT EXISTS idx_achievements_user ON public.achievements(user_id);


-- ─── RLS FOR NEW TABLES ───────────────────────────────────────────

ALTER TABLE public.daily_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner CRUD" ON public.daily_plans
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE public.topic_relationships ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner CRUD" ON public.topic_relationships
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.topics
      WHERE topics.id = topic_relationships.parent_topic_id
      AND topics.user_id = auth.uid()
    )
  );

ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner CRUD" ON public.questions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.topics
      WHERE topics.id = questions.topic_id
      AND topics.user_id = auth.uid()
    )
  );

ALTER TABLE public.resources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner CRUD" ON public.resources
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.topics
      WHERE topics.id = resources.topic_id
      AND topics.user_id = auth.uid()
    )
  );

ALTER TABLE public.syllabus_uploads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner CRUD" ON public.syllabus_uploads
  FOR ALL USING (auth.uid() = user_id);

ALTER TABLE public.achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owner select" ON public.achievements
  FOR SELECT USING (auth.uid() = user_id);
-- INSERT is service role only (service role bypasses RLS automatically)