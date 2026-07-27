create extension if not exists pgcrypto;

create type equipment_type as enum (
  'machine',
  'cable',
  'barbell',
  'dumbbell',
  'bodyweight',
  'smith_machine',
  'cardio',
  'accessory'
);

create type load_type as enum (
  'plate_loaded',
  'selectorized',
  'cable_stack',
  'free_weight',
  'bodyweight',
  'assisted',
  'unknown'
);

create type movement_family as enum (
  'horizontal_push',
  'vertical_push',
  'horizontal_pull',
  'vertical_pull',
  'squat',
  'hinge',
  'knee_extension',
  'knee_flexion',
  'hip_abduction',
  'hip_adduction',
  'elbow_flexion',
  'elbow_extension',
  'shoulder_abduction',
  'shoulder_extension',
  'fly',
  'core',
  'cardio'
);

create type user_preference as enum ('preferred', 'neutral', 'avoid', 'disabled');
create type fatigue_score as enum ('low', 'medium', 'medium_high', 'high');
create type difficulty_level as enum ('low', 'medium', 'high');
create type progression_type as enum ('load', 'reps', 'tempo', 'range_of_motion', 'duration');

create table equipment (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  brand text,
  model text,
  category text not null,
  equipment_type equipment_type not null,
  load_type load_type not null default 'unknown',
  primary_muscles text[] not null default '{}',
  secondary_muscles text[] not null default '{}',
  target_regions text[] not null default '{}',
  movement_patterns text[] not null default '{}',
  movement_family movement_family[] not null default '{}',
  angle text,
  is_unilateral boolean not null default false,
  is_plate_loaded boolean not null default false,
  is_selectorized boolean not null default false,
  is_cable boolean not null default false,
  stability_level difficulty_level not null default 'high',
  fatigue_score fatigue_score not null default 'medium',
  setup_difficulty difficulty_level not null default 'low',
  handles_grips text[] not null default '{}',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table exercises (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  primary_muscle text not null,
  secondary_muscles text[] not null default '{}',
  target_region text not null,
  movement_pattern text not null,
  movement_family movement_family not null,
  compatible_equipment_categories text[] not null default '{}',
  equipment_type_preference equipment_type[] not null default '{}',
  default_sets integer not null default 3,
  default_rep_min integer not null default 8,
  default_rep_max integer not null default 12,
  default_rest_seconds integer not null default 90,
  fatigue_score fatigue_score not null default 'medium',
  technical_difficulty difficulty_level not null default 'medium',
  progression_type progression_type not null default 'load',
  default_weight_lbs numeric,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table exercise_equipment (
  exercise_id uuid not null references exercises(id) on delete cascade,
  equipment_id uuid not null references equipment(id) on delete cascade,
  is_required boolean not null default true,
  primary key (exercise_id, equipment_id)
);

create table user_equipment (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  equipment_id uuid not null references equipment(id) on delete cascade,
  user_preference user_preference not null default 'neutral',
  is_available boolean not null default true,
  custom_notes text,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, equipment_id)
);

create table workout_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workout_type text not null,
  available_minutes integer not null,
  intensity text not null,
  equipment_preference text not null,
  sore_muscles text[] not null default '{}',
  generated_at timestamptz not null default now(),
  notes text[] not null default '{}'
);

create table workout_plan_items (
  id uuid primary key default gen_random_uuid(),
  workout_plan_id uuid not null references workout_plans(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  slot_label text not null,
  slot_movement_family movement_family not null,
  slot_target_region text,
  selected_equipment_ids uuid[] not null default '{}',
  selection_score numeric not null default 0,
  selection_reason text not null,
  sets integer not null,
  rep_min integer not null,
  rep_max integer not null,
  rest_seconds integer not null,
  recommended_weight_lbs numeric,
  sort_order integer not null
);

create table workout_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  workout_plan_id uuid references workout_plans(id) on delete set null,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  session_notes text
);

create table workout_sets (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references workout_sessions(id) on delete cascade,
  workout_plan_item_id uuid references workout_plan_items(id) on delete set null,
  exercise_id uuid not null references exercises(id),
  set_number integer not null,
  reps integer,
  weight_lbs numeric,
  rpe numeric,
  completed boolean not null default false,
  logged_at timestamptz not null default now()
);

create table user_settings (
  user_id uuid primary key,
  default_workout_type text not null default 'push',
  default_available_minutes integer not null default 45,
  default_intensity text not null default 'normal',
  default_equipment_preference text not null default 'machine_cable_priority',
  sore_muscles text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index equipment_tag_search_idx on equipment using gin (
  (
    primary_muscles ||
    secondary_muscles ||
    target_regions ||
    movement_patterns ||
    handles_grips
  )
);
create index exercises_pattern_idx on exercises (movement_family, movement_pattern, target_region);
create index user_equipment_user_idx on user_equipment (user_id, user_preference, is_available);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'Asia/Seoul',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table body_goal_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  main_body_goal text not null default 'aesthetic_v_taper',
  priority_muscles text[] not null default '{}',
  avoid_overdevelopment_muscles text[] not null default '{}',
  target_body_weight_kg numeric,
  target_body_fat_percentage numeric,
  target_skeletal_muscle_mass_kg numeric,
  preferred_training_style text not null default 'machine_cable',
  diet_aggressiveness text not null default 'moderate',
  cardio_preference text not null default 'minimal',
  weekly_weight_change_target_kg numeric not null default 0,
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table daily_check_ins (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  training_intent text not null check (training_intent in ('train', 'rest')),
  bed_time time,
  wake_time time,
  sleep_quality integer check (sleep_quality between 1 and 5),
  condition_score integer check (condition_score between 1 and 10),
  soreness_muscles text[] not null default '{}',
  soreness_level jsonb not null default '{}',
  pain_muscles text[] not null default '{}',
  pain_level jsonb not null default '{}',
  avoid_muscles_today text[] not null default '{}',
  available_time_minutes integer not null default 60,
  preferred_workout_start_time time,
  memo text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, date)
);

create table schedule_constraints (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  daily_check_in_id uuid references daily_check_ins(id) on delete cascade,
  date date not null,
  activity_type text not null,
  expected_duration_minutes integer not null default 0,
  intensity text not null default 'normal',
  affected_muscles text[] not null default '{}',
  memo text not null default '',
  created_at timestamptz not null default now()
);

create table daily_training_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  session_mode text not null,
  session_title text not null,
  selected_muscles jsonb not null default '[]',
  excluded_muscles jsonb not null default '[]',
  movement_slots jsonb not null default '[]',
  overall_intensity text not null default 'normal',
  volume_multiplier numeric not null default 1,
  estimated_duration_minutes integer not null default 0,
  evidence_keys text[] not null default '{}',
  reasoning_summary text[] not null default '{}',
  warnings text[] not null default '{}',
  confidence text not null default 'low',
  requires_user_confirmation boolean not null default false,
  fallback_used boolean not null default false,
  input_snapshot jsonb not null default '{}',
  model text,
  created_at timestamptz not null default now()
);

create table daily_plan_revisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  revision_number integer not null,
  trigger_type text not null,
  trigger_payload jsonb not null default '{}',
  training_decision_snapshot jsonb,
  nutrition_plan_snapshot jsonb not null default '{}',
  final_workout_plan_snapshot jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, date, revision_number)
);

create table workout_session_exercises (
  id uuid primary key default gen_random_uuid(),
  workout_session_id uuid not null references workout_sessions(id) on delete cascade,
  exercise_id uuid not null references exercises(id),
  equipment_id uuid references equipment(id),
  sort_order integer not null,
  slot_id text,
  slot_label text,
  target_sets integer not null default 3,
  rep_min integer not null default 8,
  rep_max integer not null default 12,
  rest_seconds integer not null default 90,
  recommended_weight_lbs numeric,
  selection_reason text not null default '',
  status text not null default 'planned',
  replacement_reason text,
  created_at timestamptz not null default now()
);

create table exercise_muscles (
  id uuid primary key default gen_random_uuid(),
  exercise_id uuid not null references exercises(id) on delete cascade,
  muscle text not null,
  role text not null check (role in ('primary', 'secondary')),
  contribution_weight numeric not null default 1,
  unique (exercise_id, muscle)
);

create table nutrition_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  starting_target_calories integer not null,
  target_protein_g integer not null,
  target_carbs_g integer not null,
  target_fat_g integer not null,
  meal_count integer not null default 4,
  breakfast_enabled boolean not null default true,
  lunch_enabled boolean not null default true,
  dinner_enabled boolean not null default true,
  snack_enabled boolean not null default true,
  preferred_meal_times jsonb not null default '{}',
  food_preferences text[] not null default '{}',
  disliked_foods text[] not null default '{}',
  allergies text[] not null default '{}',
  dietary_restrictions text[] not null default '{}',
  workout_meal_timing_preference text not null default 'pre_workout_carbs',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table daily_nutrition_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  total_calories integer not null,
  protein_g integer not null,
  carbs_g integer not null,
  fat_g integer not null,
  meal_targets jsonb not null default '{}',
  pre_workout_carbs_g integer not null default 0,
  post_workout_carbs_g integer not null default 0,
  supplement_checklist jsonb not null default '[]',
  notes text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table meal_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  logged_at timestamptz not null default now(),
  meal_name text not null,
  calories integer not null default 0,
  protein_g integer not null default 0,
  carbs_g integer not null default 0,
  fat_g integer not null default 0,
  memo text not null default ''
);

create table user_supplements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplement_name text not null,
  enabled boolean not null default false,
  user_configured_dose text not null default '',
  preferred_timing text not null default '',
  frequency text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table supplement_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  supplement_id uuid references user_supplements(id) on delete set null,
  taken_at timestamptz not null default now(),
  dose_text text not null default '',
  notes text not null default ''
);

create table body_compositions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  measured_at timestamptz not null,
  device text,
  weight_kg numeric,
  skeletal_muscle_mass_kg numeric,
  muscle_mass_kg numeric,
  body_fat_mass_kg numeric,
  bmi numeric,
  body_fat_percentage numeric,
  basal_metabolic_rate_kcal numeric,
  inbody_score numeric,
  right_arm_muscle_kg numeric,
  left_arm_muscle_kg numeric,
  trunk_muscle_kg numeric,
  right_leg_muscle_kg numeric,
  left_leg_muscle_kg numeric,
  total_body_water_l numeric,
  intracellular_water_l numeric,
  extracellular_water_l numeric,
  extracellular_water_ratio numeric,
  waist_circumference_cm numeric,
  visceral_fat_area_cm2 numeric,
  visceral_fat_level numeric,
  raw jsonb not null default '{}',
  created_at timestamptz not null default now(),
  unique (user_id, measured_at)
);

create table coach_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  type text not null,
  input_snapshot jsonb not null default '{}',
  output jsonb not null default '{}',
  model text,
  created_at timestamptz not null default now()
);

create table app_state_snapshots (
  user_id uuid not null references auth.users(id) on delete cascade,
  profile_id text not null default 'default',
  profile_name text not null default '사용자',
  snapshot jsonb not null default '{}',
  updated_at timestamptz not null default now(),
  primary key (user_id, profile_id)
);

alter table workout_sessions
  add column if not exists date date,
  add column if not exists daily_training_decision_id uuid references daily_training_decisions(id) on delete set null,
  add column if not exists status text not null default 'planned';

alter table workout_sets
  add column if not exists performed_at timestamptz,
  add column if not exists equipment_id uuid references equipment(id) on delete set null,
  add column if not exists weight numeric,
  add column if not exists rir numeric,
  add column if not exists rpe numeric,
  add column if not exists is_failure boolean not null default false,
  add column if not exists was_completed boolean not null default false,
  add column if not exists was_skipped boolean not null default false,
  add column if not exists replacement_reason text,
  add column if not exists notes text;

create index body_compositions_user_measured_idx on body_compositions (user_id, measured_at desc);
create index daily_check_ins_user_date_idx on daily_check_ins (user_id, date desc);
create index meal_logs_user_logged_idx on meal_logs (user_id, logged_at desc);
create index workout_sets_exercise_logged_idx on workout_sets (exercise_id, logged_at desc);

alter table profiles enable row level security;
alter table body_goal_profiles enable row level security;
alter table daily_check_ins enable row level security;
alter table schedule_constraints enable row level security;
alter table daily_training_decisions enable row level security;
alter table daily_plan_revisions enable row level security;
alter table user_equipment enable row level security;
alter table workout_plans enable row level security;
alter table workout_sessions enable row level security;
alter table workout_session_exercises enable row level security;
alter table workout_sets enable row level security;
alter table user_settings enable row level security;
alter table nutrition_settings enable row level security;
alter table daily_nutrition_plans enable row level security;
alter table meal_logs enable row level security;
alter table user_supplements enable row level security;
alter table supplement_logs enable row level security;
alter table body_compositions enable row level security;
alter table coach_notes enable row level security;
alter table app_state_snapshots enable row level security;

create policy "profiles own rows" on profiles
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "body_goal_profiles own rows" on body_goal_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "daily_check_ins own rows" on daily_check_ins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "schedule_constraints own rows" on schedule_constraints
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "daily_training_decisions own rows" on daily_training_decisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "daily_plan_revisions own rows" on daily_plan_revisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_equipment own rows" on user_equipment
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "workout_plans own rows" on workout_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "workout_sessions own rows" on workout_sessions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "workout_session_exercises own session rows" on workout_session_exercises
  for all using (
    exists (
      select 1 from workout_sessions
      where workout_sessions.id = workout_session_exercises.workout_session_id
        and workout_sessions.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from workout_sessions
      where workout_sessions.id = workout_session_exercises.workout_session_id
        and workout_sessions.user_id = auth.uid()
    )
  );

create policy "workout_sets own session rows" on workout_sets
  for all using (
    exists (
      select 1 from workout_sessions
      where workout_sessions.id = workout_sets.workout_session_id
        and workout_sessions.user_id = auth.uid()
    )
  ) with check (
    exists (
      select 1 from workout_sessions
      where workout_sessions.id = workout_sets.workout_session_id
        and workout_sessions.user_id = auth.uid()
    )
  );

create policy "user_settings own rows" on user_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "nutrition_settings own rows" on nutrition_settings
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "daily_nutrition_plans own rows" on daily_nutrition_plans
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "meal_logs own rows" on meal_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "user_supplements own rows" on user_supplements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "supplement_logs own rows" on supplement_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "body_compositions own rows" on body_compositions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "coach_notes own rows" on coach_notes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "app_state_snapshots own rows" on app_state_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Additive v2 tables for body metric goals and adaptive volume planning.
create table if not exists body_metric_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  direction text not null check (direction in ('at_least', 'at_most', 'target_range')),
  target_value numeric,
  target_min numeric,
  target_max numeric,
  priority text not null default 'secondary' check (priority in ('primary', 'secondary')),
  enabled boolean not null default true,
  target_date date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists body_goal_progress_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid not null references body_metric_goals(id) on delete cascade,
  measured_at timestamptz,
  current_value numeric,
  target_value numeric,
  progress_percentage numeric,
  remaining_value numeric,
  status text not null,
  confidence text not null,
  scenarios jsonb not null default '[]',
  warnings text[] not null default '{}',
  created_at timestamptz not null default now()
);

create table if not exists daily_muscle_decisions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  date date not null,
  session_title text not null,
  selected_muscles jsonb not null default '[]',
  excluded_muscles jsonb not null default '[]',
  body_goal_contribution jsonb not null default '[]',
  overall_intensity text not null,
  estimated_duration_minutes integer not null,
  summary_reasons text[] not null default '{}',
  confidence text not null default 'low',
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

create table if not exists personal_training_style_profiles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade unique,
  equipment_mix_mode text not null default 'adaptive_balanced',
  target_free_weight_exercise_share_min numeric not null default 0.25,
  target_free_weight_exercise_share_max numeric not null default 0.4,
  target_machine_cable_exercise_share_min numeric not null default 0.6,
  target_machine_cable_exercise_share_max numeric not null default 0.75,
  typical_working_sets_per_exercise_min integer not null default 3,
  typical_working_sets_per_exercise_max integer not null default 4,
  historical_median_exercise_count numeric,
  historical_median_working_sets numeric,
  historical_median_total_recorded_sets numeric,
  historical_median_duration_minutes numeric,
  historical_median_seconds_per_recorded_set numeric,
  historical_median_minutes_per_exercise numeric,
  volume_preference text not null default 'adaptive',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table body_metric_goals enable row level security;
alter table body_goal_progress_snapshots enable row level security;
alter table daily_muscle_decisions enable row level security;
alter table personal_training_style_profiles enable row level security;

drop policy if exists "body_metric_goals own rows" on body_metric_goals;
create policy "body_metric_goals own rows" on body_metric_goals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "body_goal_progress_snapshots own rows" on body_goal_progress_snapshots;
create policy "body_goal_progress_snapshots own rows" on body_goal_progress_snapshots
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "daily_muscle_decisions own rows" on daily_muscle_decisions;
create policy "daily_muscle_decisions own rows" on daily_muscle_decisions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "personal_training_style_profiles own rows" on personal_training_style_profiles;
create policy "personal_training_style_profiles own rows" on personal_training_style_profiles
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- Server-side AI request quotas. Keys are salted SHA-256 digests generated by
-- the API; raw user IDs and IP addresses are never stored here.
create table if not exists ai_rate_limit_buckets (
  key_hash text not null,
  window_seconds integer not null check (window_seconds between 60 and 86400),
  bucket_start timestamptz not null,
  request_count integer not null default 0 check (request_count >= 0),
  updated_at timestamptz not null default now(),
  primary key (key_hash, window_seconds)
);

alter table ai_rate_limit_buckets enable row level security;
revoke all on table ai_rate_limit_buckets from anon, authenticated, public;

create or replace function consume_ai_rate_limit(
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns table (
  allowed boolean,
  remaining integer,
  reset_at timestamptz
)
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_bucket_start timestamptz;
  v_count integer;
begin
  if length(p_key_hash) <> 64
    or p_limit < 1
    or p_limit > 10000
    or p_window_seconds < 60
    or p_window_seconds > 86400 then
    raise exception 'invalid rate limit parameters';
  end if;

  v_bucket_start := to_timestamp(
    floor(extract(epoch from clock_timestamp()) / p_window_seconds)
    * p_window_seconds
  );

  insert into ai_rate_limit_buckets as bucket (
    key_hash,
    window_seconds,
    bucket_start,
    request_count,
    updated_at
  )
  values (
    p_key_hash,
    p_window_seconds,
    v_bucket_start,
    1,
    clock_timestamp()
  )
  on conflict (key_hash, window_seconds)
  do update set
    bucket_start = excluded.bucket_start,
    request_count = case
      when bucket.bucket_start = excluded.bucket_start
        then bucket.request_count + 1
      else 1
    end,
    updated_at = clock_timestamp()
  returning bucket.request_count, bucket.bucket_start
  into v_count, v_bucket_start;

  return query
  select
    v_count <= p_limit,
    greatest(0, p_limit - v_count),
    v_bucket_start + make_interval(secs => p_window_seconds);
end;
$$;

revoke all on function consume_ai_rate_limit(text, integer, integer) from public;
revoke all on function consume_ai_rate_limit(text, integer, integer) from anon, authenticated;
grant execute on function consume_ai_rate_limit(text, integer, integer) to service_role;
