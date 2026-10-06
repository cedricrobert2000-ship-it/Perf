-- PERF — Run Club · Supabase schema
--
-- Paste this whole file into Supabase → SQL Editor → Run.
-- It is safe to run again (after an update, for example): it never deletes data.
--
-- Security model: tables are locked (RLS on, no policies), so the public
-- "anon" key cannot read or write them directly. The app only calls the
-- perf_* functions below, which check the member's token themselves.

-- ---------- tables ----------

create table if not exists club_config (
  id boolean primary key default true check (id),
  name text not null default 'PERF',
  code text not null default ''          -- if not empty, required to join the club
);
insert into club_config (id) values (true) on conflict do nothing;

create table if not exists members (
  id bigint generated always as identity primary key,
  name text not null,
  color text not null,
  token text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id bigint generated always as identity primary key,
  title text not null,
  kind text not null,
  starts_at timestamptz not null,
  location text not null,
  distance_km numeric,
  pace text,
  description text,
  capacity int,
  cover text,
  creator_id bigint references members(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists events_starts_at on events(starts_at);

create table if not exists registrations (
  id bigint generated always as identity primary key,
  event_id bigint not null references events(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  bib int not null,
  checked_in_at timestamptz,
  result_s int,
  created_at timestamptz not null default now(),
  unique (event_id, member_id),
  unique (event_id, bib)
);

create table if not exists comments (
  id bigint generated always as identity primary key,
  event_id bigint not null references events(id) on delete cascade,
  member_id bigint not null references members(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

alter table club_config enable row level security;
alter table members enable row level security;
alter table events enable row level security;
alter table registrations enable row level security;
alter table comments enable row level security;
revoke all on club_config, members, events, registrations, comments from anon, authenticated;

-- ---------- helpers ----------
-- Errors use PostgREST's "PTxxx" codes so the HTTP status is xxx.

create or replace function perf_str(p_value text, p_max int, p_required boolean, p_field text)
returns text language plpgsql immutable as $$
declare s text := btrim(coalesce(p_value, ''));
begin
  if p_required and s = '' then
    raise exception 'Le % est obligatoire.', p_field using errcode = 'PT400';
  end if;
  if length(s) > p_max then
    raise exception 'Le % est trop long (% max).', p_field, p_max using errcode = 'PT400';
  end if;
  return s;
end $$;

create or replace function perf_num(p_value jsonb, p_min numeric, p_max numeric)
returns numeric language plpgsql immutable as $$
declare n numeric;
begin
  if p_value is null or p_value = 'null'::jsonb or p_value #>> '{}' = '' then return null; end if;
  begin
    n := (p_value #>> '{}')::numeric;
  exception when others then
    raise exception 'Valeur numérique invalide.' using errcode = 'PT400';
  end;
  if n < p_min or n > p_max then
    raise exception 'Valeur numérique invalide.' using errcode = 'PT400';
  end if;
  return n;
end $$;

create or replace function perf_color(p_value text)
returns text language sql immutable as $$
  select case when coalesce(p_value, '') ~* '^#[0-9a-f]{6}$' then p_value else '#ff5a1f' end
$$;

-- An event stays "live" (and open for check-in) 3 hours after its start.
create or replace function perf_status(p_starts_at timestamptz)
returns text language sql stable as $$
  select case
    when now() < p_starts_at then 'upcoming'
    when now() < p_starts_at + interval '3 hours' then 'live'
    else 'done' end
$$;

create or replace function perf_member(p_token text)
returns members language sql stable security definer set search_path = public as $$
  select * from members where token = coalesce(p_token, '') and coalesce(p_token, '') <> ''
$$;

create or replace function perf_require(p_token text)
returns members language plpgsql stable security definer set search_path = public as $$
declare m members;
begin
  m := perf_member(p_token);
  if m.id is null then
    raise exception 'Crée ton profil pour continuer.' using errcode = 'PT401';
  end if;
  return m;
end $$;

create or replace function perf_load_event(p_id bigint)
returns events language plpgsql stable security definer set search_path = public as $$
declare e events;
begin
  select * into e from events where id = p_id;
  if e.id is null then
    raise exception 'Event introuvable.' using errcode = 'PT404';
  end if;
  return e;
end $$;

-- Seeded events have no creator: they belong to the whole crew.
create or replace function perf_can_manage(e events, p_me bigint)
returns boolean language sql immutable as $$
  select p_me is not null and (e.creator_id is null or e.creator_id = p_me)
$$;

create or replace function perf_member_json(m members)
returns jsonb language sql immutable as $$
  select jsonb_build_object('id', m.id, 'name', m.name, 'color', m.color, 'created_at', m.created_at)
$$;

create or replace function perf_event_json(e events, p_me bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object(
    'id', e.id,
    'title', e.title,
    'kind', e.kind,
    'startsAt', e.starts_at,
    'location', e.location,
    'distanceKm', e.distance_km,
    'pace', e.pace,
    'description', e.description,
    'capacity', e.capacity,
    'cover', e.cover,
    'creator', (select jsonb_build_object('id', m.id, 'name', m.name, 'color', m.color)
                from members m where m.id = e.creator_id),
    'count', (select count(*) from registrations r where r.event_id = e.id),
    'myBib', (select r.bib from registrations r where r.event_id = e.id and r.member_id = p_me),
    'status', perf_status(e.starts_at),
    'canManage', perf_can_manage(e, p_me),
    'preview', coalesce((
      select jsonb_agg(jsonb_build_object('id', x.id, 'name', x.name, 'color', x.color) order by x.created_at)
      from (select m.id, m.name, m.color, r.created_at
            from registrations r join members m on m.id = r.member_id
            where r.event_id = e.id order by r.created_at limit 5) x
    ), '[]'::jsonb)
  )
$$;

create or replace function perf_event_detail(p_id bigint, p_me bigint)
returns jsonb language sql stable security definer set search_path = public as $$
  select perf_event_json(e, p_me) || jsonb_build_object(
    'participants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', m.id, 'name', m.name, 'color', m.color, 'bib', r.bib,
        'checkedInAt', r.checked_in_at, 'resultS', r.result_s) order by r.bib)
      from registrations r join members m on m.id = r.member_id where r.event_id = e.id
    ), '[]'::jsonb),
    'comments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id, 'body', c.body, 'createdAt', c.created_at,
        'memberId', m.id, 'name', m.name, 'color', m.color) order by c.created_at, c.id)
      from comments c join members m on m.id = c.member_id where c.event_id = e.id
    ), '[]'::jsonb)
  )
  from events e where e.id = p_id
$$;

create or replace function perf_cover(p_cover text)
returns text language plpgsql immutable as $$
begin
  if p_cover is null or p_cover = '' then return null; end if;
  if p_cover ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$' and length(p_cover) < 1500000 then
    return p_cover;
  end if;
  if p_cover ~ '^(preset:[a-z0-9-]+|https?://\S+)$' and length(p_cover) < 1000 then
    return p_cover;
  end if;
  raise exception 'Photo de couverture invalide (ou trop lourde).' using errcode = 'PT400';
end $$;

-- ---------- API: club & members ----------

create or replace function perf_config()
returns jsonb language sql stable security definer set search_path = public as $$
  select jsonb_build_object('clubName', name, 'requiresCode', btrim(code) <> '') from club_config
$$;

create or replace function perf_join(p_name text, p_color text, p_code text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  cfg club_config;
  m members;
begin
  select * into cfg from club_config;
  if btrim(cfg.code) <> '' and lower(btrim(coalesce(p_code, ''))) <> lower(btrim(cfg.code)) then
    raise exception 'Code du club incorrect.' using errcode = 'PT403';
  end if;
  insert into members (name, color, token)
  values (perf_str(p_name, 24, true, 'pseudo'), perf_color(p_color),
          replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', ''))
  returning * into m;
  return jsonb_build_object('member', perf_member_json(m), 'token', m.token);
end $$;

create or replace function perf_me(p_token text)
returns jsonb language sql stable security definer set search_path = public as $$
  select perf_member_json(perf_require(p_token))
$$;

create or replace function perf_update_me(p_token text, p_name text, p_color text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare m members := perf_require(p_token);
begin
  update members
     set name = perf_str(coalesce(p_name, m.name), 24, true, 'pseudo'),
         color = perf_color(coalesce(p_color, m.color))
   where id = m.id
  returning * into m;
  return perf_member_json(m);
end $$;

create or replace function perf_my_bibs(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare m members := perf_require(p_token);
begin
  return coalesce((
    select jsonb_agg(perf_event_json(e, m.id) || jsonb_build_object(
      'checkedInAt', r.checked_in_at, 'resultS', r.result_s) order by e.starts_at desc)
    from events e join registrations r on r.event_id = e.id and r.member_id = m.id
  ), '[]'::jsonb);
end $$;

create or replace function perf_members()
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_agg(to_jsonb(x) order by x.done desc, x.km desc, x."createdAt"), '[]'::jsonb)
  from (
    select m.id, m.name, m.color, m.created_at as "createdAt",
      count(*) filter (where e.starts_at < now()) as done,
      count(*) filter (where e.starts_at >= now()) as upcoming,
      coalesce(sum(e.distance_km) filter (where e.starts_at < now()), 0) as km,
      (select count(*) from events o where o.creator_id = m.id) as organised
    from members m
    left join registrations r on r.member_id = m.id
    left join events e on e.id = r.event_id
    group by m.id
  ) x
$$;

-- ---------- API: events ----------

create or replace function perf_events(p_token text, p_scope text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  me bigint := (perf_member(p_token)).id;
  cutoff timestamptz := now() - interval '3 hours';
begin
  if p_scope = 'past' then
    return coalesce((select jsonb_agg(perf_event_json(e, me) order by e.starts_at desc)
      from (select * from events where starts_at < cutoff order by starts_at desc limit 100) e), '[]'::jsonb);
  end if;
  return coalesce((select jsonb_agg(perf_event_json(e, me) order by e.starts_at)
    from (select * from events where starts_at >= cutoff order by starts_at limit 100) e), '[]'::jsonb);
end $$;

create or replace function perf_event(p_token text, p_id bigint)
returns jsonb language plpgsql stable security definer set search_path = public as $$
begin
  perform perf_load_event(p_id);
  return perf_event_detail(p_id, (perf_member(p_token)).id);
end $$;

-- Creates the event when p_id is null, otherwise updates it.
create or replace function perf_save_event(p_token text, p_id bigint, p_body jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me members := perf_require(p_token);
  e events;
  v_starts timestamptz;
  v_kind text;
  v_cover text;
begin
  if p_id is not null then
    e := perf_load_event(p_id);
    if not perf_can_manage(e, me.id) then
      raise exception 'Seul l''orga peut modifier cet event.' using errcode = 'PT403';
    end if;
  end if;

  begin
    v_starts := coalesce(p_body->>'startsAt', e.starts_at::text)::timestamptz;
  exception when others then
    v_starts := null;
  end;
  if v_starts is null then
    raise exception 'Date invalide.' using errcode = 'PT400';
  end if;

  v_kind := case when p_body->>'kind' in ('run', 'long', 'track', 'trail', 'ride', 'social')
                 then p_body->>'kind' else coalesce(e.kind, 'run') end;

  v_cover := case when p_body ? 'cover' and (p_body->>'cover') is distinct from e.cover
                  then perf_cover(p_body->>'cover') else e.cover end;

  if p_id is null then
    insert into events (title, kind, starts_at, location, distance_km, pace, description, capacity, cover, creator_id)
    values (
      perf_str(p_body->>'title', 80, true, 'titre'), v_kind, v_starts,
      perf_str(p_body->>'location', 120, true, 'lieu'),
      perf_num(p_body->'distanceKm', 0, 500),
      nullif(perf_str(p_body->>'pace', 40, false, 'champ'), ''),
      nullif(perf_str(p_body->>'description', 2000, false, 'champ'), ''),
      perf_num(p_body->'capacity', 1, 999)::int,
      v_cover, me.id)
    returning * into e;
  else
    update events set
      title = perf_str(coalesce(p_body->>'title', e.title), 80, true, 'titre'),
      kind = v_kind,
      starts_at = v_starts,
      location = perf_str(coalesce(p_body->>'location', e.location), 120, true, 'lieu'),
      distance_km = perf_num(p_body->'distanceKm', 0, 500),
      pace = nullif(perf_str(p_body->>'pace', 40, false, 'champ'), ''),
      description = nullif(perf_str(p_body->>'description', 2000, false, 'champ'), ''),
      capacity = perf_num(p_body->'capacity', 1, 999)::int,
      cover = v_cover
    where id = e.id
    returning * into e;
  end if;
  return perf_event_detail(e.id, me.id);
end $$;

create or replace function perf_delete_event(p_token text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me members := perf_require(p_token);
  e events := perf_load_event(p_id);
begin
  if not perf_can_manage(e, me.id) then
    raise exception 'Seul l''orga peut supprimer cet event.' using errcode = 'PT403';
  end if;
  delete from events where id = e.id;
  return jsonb_build_object('ok', true);
end $$;

create or replace function perf_register(p_token text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me members := perf_require(p_token);
  e events;
  n int;
  max_bib int;
begin
  perform perf_load_event(p_id);
  -- Lock the event so two friends signing up at once never get the same bib.
  select * into e from events where id = p_id for update;
  if perf_status(e.starts_at) <> 'upcoming' then
    raise exception 'Les inscriptions sont fermées, le départ est donné.' using errcode = 'PT409';
  end if;
  if not exists (select 1 from registrations where event_id = e.id and member_id = me.id) then
    select count(*), coalesce(max(bib), 0) into n, max_bib from registrations where event_id = e.id;
    if e.capacity is not null and n >= e.capacity then
      raise exception 'C''est complet ! Plus aucun dossard dispo.' using errcode = 'PT409';
    end if;
    insert into registrations (event_id, member_id, bib) values (e.id, me.id, max_bib + 1);
  end if;
  return perf_event_detail(e.id, me.id);
end $$;

create or replace function perf_unregister(p_token text, p_id bigint)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me members := perf_require(p_token);
  e events := perf_load_event(p_id);
begin
  if perf_status(e.starts_at) <> 'upcoming' then
    raise exception 'Trop tard pour se désinscrire, l''event a commencé.' using errcode = 'PT409';
  end if;
  delete from registrations where event_id = e.id and member_id = me.id;
  return perf_event_detail(e.id, me.id);
end $$;

create or replace function perf_checkin(p_token text, p_id bigint, p_bib jsonb, p_present boolean)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me members := perf_require(p_token);
  e events := perf_load_event(p_id);
  v_bib int := perf_num(p_bib, 1, 9999)::int;
begin
  if not perf_can_manage(e, me.id) then
    raise exception 'Seul l''orga peut valider les présences.' using errcode = 'PT403';
  end if;
  update registrations
     set checked_in_at = case when coalesce(p_present, true) then now() end
   where event_id = e.id and bib = v_bib;
  if not found then
    raise exception 'Aucun dossard n°% sur cet event.', v_bib using errcode = 'PT404';
  end if;
  return perf_event_detail(e.id, me.id);
end $$;

create or replace function perf_set_result(p_token text, p_id bigint, p_member_id bigint, p_result_s jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me members := perf_require(p_token);
  e events := perf_load_event(p_id);
  v_result numeric := perf_num(p_result_s, 1, 7 * 24 * 3600);
begin
  if p_member_id <> me.id and not perf_can_manage(e, me.id) then
    raise exception 'Tu ne peux saisir que ton propre chrono.' using errcode = 'PT403';
  end if;
  if perf_status(e.starts_at) = 'upcoming' then
    raise exception 'Les chronos se saisissent après le départ.' using errcode = 'PT409';
  end if;
  update registrations set result_s = round(v_result)
   where event_id = e.id and member_id = p_member_id;
  if not found then
    raise exception 'Ce membre n''est pas inscrit.' using errcode = 'PT404';
  end if;
  return perf_event_detail(e.id, me.id);
end $$;

create or replace function perf_comment(p_token text, p_id bigint, p_body text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  me members := perf_require(p_token);
  e events := perf_load_event(p_id);
begin
  insert into comments (event_id, member_id, body)
  values (e.id, me.id, perf_str(p_body, 500, true, 'message'));
  return perf_event_detail(e.id, me.id);
end $$;

-- ---------- permissions ----------
-- Only the API functions are callable from the app; helpers stay private.

revoke execute on all functions in schema public from public, anon, authenticated;
grant execute on function
  perf_config(),
  perf_join(text, text, text),
  perf_me(text),
  perf_update_me(text, text, text),
  perf_my_bibs(text),
  perf_members(),
  perf_events(text, text),
  perf_event(text, bigint),
  perf_save_event(text, bigint, jsonb),
  perf_delete_event(text, bigint),
  perf_register(text, bigint),
  perf_unregister(text, bigint),
  perf_checkin(text, bigint, jsonb, boolean),
  perf_set_result(text, bigint, bigint, jsonb),
  perf_comment(text, bigint, text)
to anon, authenticated;

-- ---------- demo events (only on an empty database) ----------

do $$
declare
  -- Next occurrence of a weekday (0 = Sunday) at a Paris time, at least one day from now.
  next_at constant text := $q$
    select ((current_date + (((%s - extract(dow from current_date)::int - 1 + 7) %% 7) + 1)) + time %L)
           at time zone 'Europe/Paris'
  $q$;
  d0 timestamptz; d2 timestamptz; d4 timestamptz;
begin
  if exists (select 1 from events) then return; end if;
  execute format(next_at, 0, '09:30') into d0;
  execute format(next_at, 2, '19:15') into d2;
  execute format(next_at, 4, '19:00') into d4;
  insert into events (title, kind, starts_at, location, distance_km, pace, description, capacity, cover) values
    ('Sunday Long Run', 'long', d0, 'Pont des Arts → Bois de Vincennes', 18, '5''30/km',
     'On part ensemble, on rentre ensemble. Allure conversation, café obligatoire à l’arrivée.', null, 'preset:road'),
    ('Track Tuesday — 10×400', 'track', d2, 'Stade Charléty', 8, 'VMA',
     'Échauffement 15 min, 10×400 récup 1 min, retour au calme. Ramène tes pointes si t’en as.', 20, 'preset:track'),
    ('Golden Hour 7K', 'social', d4, 'Canal Saint-Martin', 7, '5''45/km',
     'Run tranquille au coucher du soleil puis apéro au bord du canal. Les nouveaux sont les bienvenus.', 30, 'preset:sunset');
end $$;
