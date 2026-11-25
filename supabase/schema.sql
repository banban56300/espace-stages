-- Cap Finance — schéma de base de données Supabase (PostgreSQL)
-- Chaque ligne appartient à un compte (owner_id) et est protégée par RLS.
-- L'agent de veille passe uniquement par les fonctions agent_*.
create or replace function public.norm_txt(t text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(translate(lower(coalesce(t,'')),'àâäáãéèêëíìîïóòôöõúùûüçñ''’','aaaaaeeeeiiiiooooouuuucn  '),'\s+',' ','g')
$$;
create or replace function public.norm_url(u text) returns text
language sql immutable set search_path = '' as $$
  select regexp_replace(regexp_replace(lower(trim(coalesce(u,''))),'^https?://(www\.)?',''),'/+$','')
$$;
create or replace function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;

create table if not exists public.app_config (
  owner_id uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  is_primary boolean not null default true, display_name text, school text default 'IGR-IAE Rennes', pitch text, motivations text,
  last_visit timestamptz, prev_visit timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index if not exists app_config_one_primary on public.app_config(is_primary) where is_primary;

create table if not exists public.companies (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, sector text, tier text, description text, locations text, website text, careers_url text, linkedin_url text, jobs text,
  is_target boolean not null default false, link_note text, signal text, notes text, source text not null default 'manuel',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create unique index if not exists companies_owner_name on public.companies(owner_id, public.norm_txt(name));

create table if not exists public.offers (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ext_id text not null, kind text not null default 'publiee' check (kind in ('publiee','cachee','prospection')),
  certainty text check (certainty in ('confirme','probable','a_prospecter')),
  company_id uuid references public.companies(id) on delete set null, company_name text not null, title text not null,
  sector text, city text, country text default 'France', contract text default 'Stage', duration text, start_label text,
  published_at date, offer_updated_at date, description text, missions text, skills text, education text, languages text, pay text,
  analysis text, approach text, score int check (score between 0 and 100), priority text check (priority in ('Élevée','Intermédiaire','Secondaire')),
  offer_url text, platform text, careers_url text, apply_url text, recruiter_name text, recruiter_role text, recruiter_linkedin text, recruiter_contact text,
  link_state text check (link_state in ('ok','mid','unk','bad')), link_checked_at date,
  source text not null default 'manuel' check (source in ('veille','manuel','import')),
  status text not null default 'Nouvelle offre', status_at timestamptz not null default now(), favorite boolean not null default false,
  saved_at date, prep_at date, applied_at date, applied_url text, follow_up_at date, interview_at date, test_at date, deadline date, response_at date, result text,
  cv_doc_id uuid, letter_doc_id uuid, notes text, prep jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), unique (owner_id, ext_id));
create index if not exists offers_owner_status on public.offers(owner_id, status);
create index if not exists offers_company on public.offers(company_id);

create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  first_name text, last_name text, company_id uuid references public.companies(id) on delete set null, company_name text, role text, sector text, city text, country text,
  linkedin_url text, email text, category text, origin text, relation text not null default 'À contacter', contacted_at date,
  offer_id uuid references public.offers(id) on delete set null, helped boolean not null default false, recommended text, can_introduce boolean not null default false,
  next_action text, next_action_at date, is_suggestion boolean not null default false, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists contacts_company on public.contacts(company_id);
create index if not exists contacts_offer on public.contacts(offer_id);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  offer_id uuid references public.offers(id) on delete cascade, contact_id uuid references public.contacts(id) on delete cascade,
  company_id uuid references public.companies(id) on delete cascade, date date not null default current_date, type text not null default 'Note', text text,
  created_at timestamptz not null default now());
create index if not exists events_offer on public.events(offer_id);
create index if not exists events_contact on public.events(contact_id);
create index if not exists events_company on public.events(company_id);

create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, kind text not null default 'Autre', version_label text, storage_path text, size bigint, content_type text, body text, notes text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table if not exists public.document_links (
  document_id uuid not null references public.documents(id) on delete cascade, offer_id uuid not null references public.offers(id) on delete cascade,
  owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade, role text default 'joint', created_at timestamptz not null default now(),
  primary key (document_id, offer_id));
create index if not exists document_links_offer on public.document_links(offer_id);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  date date not null, time text, kind text not null default 'Rappel', text text not null,
  offer_id uuid references public.offers(id) on delete cascade, contact_id uuid references public.contacts(id) on delete cascade, done boolean not null default false,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create index if not exists tasks_offer on public.tasks(offer_id);
create index if not exists tasks_contact on public.tasks(contact_id);

create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null, category text, channel text default 'LinkedIn', subject text, body text not null,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now());

create table if not exists public.sync_runs (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  started_at timestamptz not null default now(), finished_at timestamptz, status text not null default 'ok' check (status in ('ok','partiel','erreur')),
  found int default 0, verified int default 0, added int default 0, duplicates int default 0, link_updates int default 0, errors text, summary text);
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(), owner_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(), title text not null, body text, offer_id uuid references public.offers(id) on delete cascade, read boolean not null default false);
create index if not exists notifications_offer on public.notifications(offer_id);

create trigger trg_touch before update on public.app_config for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.companies for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.offers for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.contacts for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.documents for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.tasks for each row execute function public.touch_updated_at();
create trigger trg_touch before update on public.templates for each row execute function public.touch_updated_at();

alter table public.app_config enable row level security;
alter table public.companies enable row level security;
alter table public.offers enable row level security;
alter table public.contacts enable row level security;
alter table public.events enable row level security;
alter table public.documents enable row level security;
alter table public.document_links enable row level security;
alter table public.tasks enable row level security;
alter table public.templates enable row level security;
alter table public.sync_runs enable row level security;
alter table public.notifications enable row level security;
create policy own_rows on public.app_config for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_rows on public.companies for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_rows on public.offers for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_rows on public.contacts for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_rows on public.events for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_rows on public.documents for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_rows on public.document_links for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_rows on public.tasks for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_rows on public.templates for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy own_read on public.sync_runs for select to authenticated using (owner_id = (select auth.uid()));
create policy own_rows on public.notifications for all to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

-- ===== Fonctions de l'agent de veille : schéma « agent », non exposé par l'API =====
-- (aucun accès possible depuis le site : seul l'administrateur, via le connecteur Supabase, peut les appeler)
create schema if not exists agent;

create or replace function agent.owner_id() returns uuid
language sql stable security definer set search_path = '' as $$ select owner_id from public.app_config where is_primary limit 1 $$;

create or replace function agent.offers()
returns table(ext_id text, kind text, company_name text, title text, city text, offer_url text, status text, link_state text, link_checked_at date)
language sql stable security definer set search_path = '' as $$
  select o.ext_id, o.kind, o.company_name, o.title, o.city, o.offer_url, o.status, o.link_state, o.link_checked_at
  from public.offers o where o.owner_id = agent.owner_id() order by o.ext_id $$;

create or replace function agent.add_offer(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := agent.owner_id(); v_dup record; v_company uuid; v_ext text; v_id uuid; v_kind text; v_score int;
begin
  if v_owner is null then return jsonb_build_object('result','error','reason','aucun compte principal configuré'); end if;
  if coalesce(p->>'company_name','') = '' or coalesce(p->>'title','') = '' then return jsonb_build_object('result','error','reason','company_name et title obligatoires'); end if;
  v_kind := coalesce(nullif(p->>'kind',''),'publiee');
  if v_kind = 'publiee' and coalesce(p->>'source','veille') <> 'import' and coalesce(p->>'link_state','') not in ('ok','mid') then
    return jsonb_build_object('result','refused','reason','une offre publiée doit avoir un lien vérifié (ok ou mid)'); end if;
  for v_dup in select o.ext_id from public.offers o where o.owner_id = v_owner and (
      (coalesce(p->>'offer_url','') <> '' and public.norm_url(o.offer_url) = public.norm_url(p->>'offer_url'))
      or (public.norm_txt(o.company_name) = public.norm_txt(p->>'company_name') and public.norm_txt(o.title) = public.norm_txt(p->>'title')
          and public.norm_txt(coalesce(o.city,'')) = public.norm_txt(coalesce(p->>'city','')))) limit 1
  loop return jsonb_build_object('result','duplicate','ext_id',v_dup.ext_id); end loop;
  select c.id into v_company from public.companies c where c.owner_id = v_owner and public.norm_txt(c.name) = public.norm_txt(p->>'company_name') limit 1;
  if v_company is null then
    insert into public.companies(owner_id, name, sector, careers_url, source) values (v_owner, p->>'company_name', p->>'sector', p->>'careers_url', 'veille') returning id into v_company;
  end if;
  select 'OFF-' || lpad((coalesce(max(substring(o.ext_id from 5)::int),0)+1)::text, 4, '0') into v_ext from public.offers o where o.owner_id = v_owner and o.ext_id ~ '^OFF-[0-9]+$';
  v_score := nullif(p->>'score','')::int;
  insert into public.offers(owner_id, ext_id, kind, certainty, company_id, company_name, title, sector, city, country, contract, duration, start_label, published_at, offer_updated_at,
    description, missions, skills, education, languages, pay, analysis, approach, score, priority, offer_url, platform, careers_url, apply_url, recruiter_name, recruiter_role,
    recruiter_linkedin, recruiter_contact, link_state, link_checked_at, source, status)
  values (v_owner, v_ext, v_kind, nullif(p->>'certainty',''), v_company, p->>'company_name', p->>'title', p->>'sector', p->>'city', coalesce(nullif(p->>'country',''),'France'),
    coalesce(nullif(p->>'contract',''),'Stage'), p->>'duration', p->>'start_label', nullif(p->>'published_at','')::date, nullif(p->>'offer_updated_at','')::date,
    p->>'description', p->>'missions', p->>'skills', p->>'education', p->>'languages', p->>'pay', p->>'analysis', p->>'approach', v_score, nullif(p->>'priority',''),
    nullif(p->>'offer_url',''), p->>'platform', nullif(p->>'careers_url',''), nullif(p->>'apply_url',''), p->>'recruiter_name', p->>'recruiter_role',
    nullif(p->>'recruiter_linkedin',''), p->>'recruiter_contact', nullif(p->>'link_state',''), coalesce(nullif(p->>'link_checked_at','')::date, current_date), coalesce(nullif(p->>'source',''),'veille'), coalesce(nullif(p->>'status',''),'Nouvelle offre'))
  returning id into v_id;
  if coalesce(v_score,0) >= 80 and coalesce(p->>'source','veille') = 'veille' then
    insert into public.notifications(owner_id, title, body, offer_id) values (v_owner, 'Offre très pertinente : ' || (p->>'company_name'), (p->>'title') || ' — note ' || v_score || '/100', v_id);
  end if;
  return jsonb_build_object('result','added','ext_id',v_ext);
end $$;

create or replace function agent.update_link(p_ext_id text, p_state text, p_checked date default current_date) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := agent.owner_id(); v_old text; v_title text; v_comp text; v_id uuid;
begin
  if p_state not in ('ok','mid','unk','bad') then return jsonb_build_object('result','error','reason','état invalide'); end if;
  select o.id, o.link_state, o.title, o.company_name into v_id, v_old, v_title, v_comp from public.offers o where o.owner_id = v_owner and o.ext_id = p_ext_id;
  if v_id is null then return jsonb_build_object('result','not_found'); end if;
  update public.offers set link_state = p_state, link_checked_at = p_checked where id = v_id;
  if p_state = 'bad' and coalesce(v_old,'') <> 'bad' then
    insert into public.notifications(owner_id, title, body, offer_id) values (v_owner, 'Annonce devenue indisponible : ' || v_comp, v_title, v_id);
  end if;
  return jsonb_build_object('result','updated','ext_id',p_ext_id,'from',v_old,'to',p_state);
end $$;

create or replace function agent.upsert_company(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := agent.owner_id(); v_id uuid;
begin
  select c.id into v_id from public.companies c where c.owner_id = v_owner and public.norm_txt(c.name) = public.norm_txt(p->>'name');
  if v_id is null then
    insert into public.companies(owner_id, name, sector, tier, description, locations, website, careers_url, linkedin_url, jobs, link_note, signal, source)
    values (v_owner, p->>'name', p->>'sector', p->>'tier', p->>'description', p->>'locations', p->>'website', p->>'careers_url', p->>'linkedin_url', p->>'jobs', p->>'link_note', p->>'signal', coalesce(nullif(p->>'source',''),'veille')) returning id into v_id;
    return jsonb_build_object('result','added','id',v_id);
  end if;
  update public.companies c set sector = coalesce(nullif(c.sector,''), p->>'sector'), tier = coalesce(nullif(c.tier,''), p->>'tier'), description = coalesce(nullif(c.description,''), p->>'description'),
    locations = coalesce(nullif(c.locations,''), p->>'locations'), website = coalesce(nullif(c.website,''), p->>'website'),
    careers_url = coalesce(nullif(c.careers_url,''), p->>'careers_url'), linkedin_url = coalesce(nullif(c.linkedin_url,''), p->>'linkedin_url'),
    jobs = coalesce(nullif(c.jobs,''), p->>'jobs'), link_note = coalesce(nullif(c.link_note,''), p->>'link_note'), signal = coalesce(p->>'signal', c.signal) where c.id = v_id;
  return jsonb_build_object('result','completed','id',v_id);
end $$;

create or replace function agent.log_sync(p jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare v_owner uuid := agent.owner_id(); v_id uuid;
begin
  insert into public.sync_runs(owner_id, started_at, finished_at, status, found, verified, added, duplicates, link_updates, errors, summary)
  values (v_owner, coalesce(nullif(p->>'started_at','')::timestamptz, now()), now(), coalesce(nullif(p->>'status',''),'ok'), coalesce((p->>'found')::int,0), coalesce((p->>'verified')::int,0),
    coalesce((p->>'added')::int,0), coalesce((p->>'duplicates')::int,0), coalesce((p->>'link_updates')::int,0), p->>'errors', p->>'summary') returning id into v_id;
  return jsonb_build_object('result','logged','id',v_id);
end $$;

-- ===== Stockage privé des documents (bucket « documents ») =====
insert into storage.buckets (id, name, public, file_size_limit) values ('documents','documents', false, 52428800) on conflict (id) do nothing;
create policy docs_own_read on storage.objects for select to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy docs_own_write on storage.objects for insert to authenticated with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy docs_own_update on storage.objects for update to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy docs_own_delete on storage.objects for delete to authenticated using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
