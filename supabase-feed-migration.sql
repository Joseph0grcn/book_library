-- Mevcut verileri silmeden arkadaş akışını ekler.
-- Supabase Dashboard -> SQL Editor alanında bir kez çalıştırın.

create table if not exists public.feed_posts (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  author text not null default '',
  year text not null default '',
  isbn text not null default '',
  cover_url text not null default '',
  rating integer not null default 0 check (rating between 0 and 5),
  status text not null default 'unread',
  caption text not null default '',
  created_at timestamptz not null default now()
);

alter table public.feed_posts add column if not exists cover_large_url text not null default '';

alter table public.feed_posts enable row level security;

drop policy if exists "Users can view their friends feed posts" on public.feed_posts;
drop policy if exists "Users can create their own feed posts" on public.feed_posts;
drop policy if exists "Users can delete their own feed posts" on public.feed_posts;

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

create index if not exists feed_posts_user_created_idx on public.feed_posts(user_id, created_at desc);
