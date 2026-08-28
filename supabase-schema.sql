-- ========================================================
-- SUPABASE VERİTABANI SIFIRLAMA VE YENİDEN OLUŞTURMA KODU
-- ========================================================
-- Bu kodu Supabase Dashboard -> SQL Editor alanına yapıştırıp "Run" butonuna basarak çalıştırabilirsiniz.

-- 1. Mevcut tabloyu ve bağlı izinleri tamamen temizler (Sıfırlama)
drop table if exists public.books cascade;

drop table if exists public.profiles cascade;

drop table if exists public.feed_posts cascade;

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
  using (auth.role() = 'authenticated');

create policy "Users can insert their own profile"
  on public.profiles for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own profile"
  on public.profiles for update
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create table public.friendships (
  id text primary key,
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  constraint friendships_no_self check (requester_id <> addressee_id),
  constraint friendships_unique_pair unique (requester_id, addressee_id)
);

alter table public.friendships enable row level security;

create policy "Users can view their friendships"
  on public.friendships for select
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create policy "Users can send friendship requests"
  on public.friendships for insert
  with check (auth.uid() = requester_id);

create policy "Users can respond to friendship requests"
  on public.friendships for update
  using (auth.uid() = addressee_id)
  with check (auth.uid() = addressee_id);

create policy "Users can remove their friendships"
  on public.friendships for delete
  using (auth.uid() = requester_id or auth.uid() = addressee_id);

create index profiles_username_idx on public.profiles(username);
create index friendships_requester_idx on public.friendships(requester_id);
create index friendships_addressee_idx on public.friendships(addressee_id);

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

create table public.feed_posts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  author text not null default '',
  year text not null default '',
  isbn text not null default '',
  cover_url text not null default '',
  cover_large_url text not null default '',
  rating integer not null default 0 check (rating between 0 and 5),
  status text not null default 'unread',
  caption text not null default '',
  created_at timestamptz not null default now()
);

alter table public.feed_posts enable row level security;

create policy "Users can view their friends feed posts"
  on public.feed_posts for select
  using (
    auth.uid() = user_id
    or exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((requester_id = auth.uid() and addressee_id = feed_posts.user_id)
          or (addressee_id = auth.uid() and requester_id = feed_posts.user_id))
    )
  );

create policy "Users can create their own feed posts"
  on public.feed_posts for insert
  with check (auth.uid() = user_id);

create policy "Users can delete their own feed posts"
  on public.feed_posts for delete
  using (auth.uid() = user_id);

create index feed_posts_user_created_idx on public.feed_posts(user_id, created_at desc);

-- 3. Satır Düzeyinde Güvenliği (RLS) Aktifleştirir
alter table public.books enable row level security;

-- 4. Kullanıcıların Sadece Kendi Kitaplarına Erişebileceği Güvenlik Politikaları (RLS Policies)
create policy "Users can view their own books"
  on public.books for select
  using (auth.uid() = user_id);

create policy "Users can view their friends books"
  on public.books for select
  using (
    exists (
      select 1 from public.friendships
      where status = 'accepted'
        and ((requester_id = auth.uid() and addressee_id = books.user_id)
          or (addressee_id = auth.uid() and requester_id = books.user_id))
    )
  );

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
alter publication supabase_realtime add table public.feed_posts;

-- 7. AkÄ±ÅŸ beÄŸeni ve yorumlarÄ±
create table public.feed_post_likes (
  post_id text not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table public.feed_comments (
  id text primary key,
  post_id text not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.feed_post_likes enable row level security;
alter table public.feed_comments enable row level security;

create policy "Users can view visible post likes" on public.feed_post_likes for select using (
  exists (select 1 from public.feed_posts where id = post_id and (
    auth.uid() = user_id or exists (select 1 from public.friendships where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = feed_posts.user_id)
        or (addressee_id = auth.uid() and requester_id = feed_posts.user_id)))
  ))
);
create policy "Users can like visible posts" on public.feed_post_likes for insert with check (
  auth.uid() = user_id and exists (select 1 from public.feed_posts where id = post_id and (
    auth.uid() = feed_posts.user_id or exists (select 1 from public.friendships where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = feed_posts.user_id)
        or (addressee_id = auth.uid() and requester_id = feed_posts.user_id)))
  ))
);
create policy "Users can remove their likes" on public.feed_post_likes for delete using (auth.uid() = user_id);
create policy "Users can view visible post comments" on public.feed_comments for select using (
  exists (select 1 from public.feed_posts where id = post_id and (
    auth.uid() = user_id or exists (select 1 from public.friendships where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = feed_posts.user_id)
        or (addressee_id = auth.uid() and requester_id = feed_posts.user_id)))
  ))
);
create policy "Users can comment on visible posts" on public.feed_comments for insert with check (
  auth.uid() = user_id and exists (select 1 from public.feed_posts where id = post_id and (
    auth.uid() = feed_posts.user_id or exists (select 1 from public.friendships where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = feed_posts.user_id)
        or (addressee_id = auth.uid() and requester_id = feed_posts.user_id)))
  ))
);
create policy "Users can delete their comments" on public.feed_comments for delete using (auth.uid() = user_id);
create index feed_post_likes_post_idx on public.feed_post_likes(post_id);
create index feed_comments_post_created_idx on public.feed_comments(post_id, created_at);
