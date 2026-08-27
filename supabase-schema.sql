-- ========================================================
-- SUPABASE VERİTABANI SIFIRLAMA VE YENİDEN OLUŞTURMA KODU
-- ========================================================
-- Bu kodu Supabase Dashboard -> SQL Editor alanına yapıştırıp "Run" butonuna basarak çalıştırabilirsiniz.

-- 1. Mevcut tabloyu ve bağlı izinleri tamamen temizler (Sıfırlama)
drop table if exists public.books cascade;

drop table if exists public.profiles cascade;

create table public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  username text not null default '',
  bio text not null default '',
  location text not null default '',
  website text not null default '',
  avatar_url text not null default '',
  cover_url text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.profiles enable row level security;

create policy "Users can view their own profile"
  on public.profiles for select
  using (auth.uid() = user_id);

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- 2. Kitaplar tablosunu tüm güncel sütunlarıyla yeniden oluşturur
create table public.books (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  author text default '',
  year text default '',
  tags jsonb not null default '[]'::jsonb,
  read boolean not null default false,
  status text not null default 'unread',
  progress integer not null default 0 check (progress between 0 and 100),
  rating integer not null default 0 check (rating between 0 and 5),
  review text default '',
  notes text default '',
  shelf text not null default 'owned',
  start_date text default '',
  finish_date text default '',
  isbn text default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- 3. Satır Düzeyinde Güvenliği (RLS) Aktifleştirir
alter table public.books enable row level security;

-- 4. Kullanıcıların Sadece Kendi Kitaplarına Erişebileceği Güvenlik Politikaları (RLS Policies)
create policy "Users can view their own books"
  on public.books for select
  using (auth.uid() = user_id);

create policy "Users can insert their own books"
  on public.books for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own books"
  on public.books for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own books"
  on public.books for delete
  using (auth.uid() = user_id);

-- 5. Hızlı Arama ve Filtreleme İndeksleri
create index books_user_id_idx on public.books(user_id);
create index books_user_isbn_idx on public.books(user_id, isbn);
create index books_created_at_idx on public.books(created_at desc);

-- 6. Supabase Realtime (Canlı Cihaz Eşitleme) Yayınına Ekleme
alter publication supabase_realtime add table public.books;
