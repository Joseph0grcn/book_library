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

-- Kabul edilmiş arkadaşlar birbirlerinin kitaplıklarını görebilir.
drop policy if exists "Users can view their friends books" on public.books;
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

create table if not exists public.feed_post_likes (
  post_id text not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (post_id, user_id)
);

create table if not exists public.feed_comments (
  id text primary key,
  post_id text not null references public.feed_posts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 500),
  created_at timestamptz not null default now()
);

alter table public.feed_post_likes enable row level security;
alter table public.feed_comments enable row level security;

drop policy if exists "Users can view visible post likes" on public.feed_post_likes;
create policy "Users can view visible post likes" on public.feed_post_likes for select using (
  exists (select 1 from public.feed_posts where id = post_id and (
    auth.uid() = user_id
    or exists (select 1 from public.friendships where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = feed_posts.user_id)
        or (addressee_id = auth.uid() and requester_id = feed_posts.user_id)))
  ))
);
drop policy if exists "Users can like visible posts" on public.feed_post_likes;
create policy "Users can like visible posts" on public.feed_post_likes for insert with check (
  auth.uid() = user_id and exists (select 1 from public.feed_posts where id = post_id and (
    auth.uid() = feed_posts.user_id
    or exists (select 1 from public.friendships where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = feed_posts.user_id)
        or (addressee_id = auth.uid() and requester_id = feed_posts.user_id)))
  ))
);
drop policy if exists "Users can remove their likes" on public.feed_post_likes;
create policy "Users can remove their likes" on public.feed_post_likes for delete using (auth.uid() = user_id);

drop policy if exists "Users can view visible post comments" on public.feed_comments;
create policy "Users can view visible post comments" on public.feed_comments for select using (
  exists (select 1 from public.feed_posts where id = post_id and (
    auth.uid() = user_id
    or exists (select 1 from public.friendships where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = feed_posts.user_id)
        or (addressee_id = auth.uid() and requester_id = feed_posts.user_id)))
  ))
);
drop policy if exists "Users can comment on visible posts" on public.feed_comments;
create policy "Users can comment on visible posts" on public.feed_comments for insert with check (
  auth.uid() = user_id and exists (select 1 from public.feed_posts where id = post_id and (
    auth.uid() = feed_posts.user_id
    or exists (select 1 from public.friendships where status = 'accepted'
      and ((requester_id = auth.uid() and addressee_id = feed_posts.user_id)
        or (addressee_id = auth.uid() and requester_id = feed_posts.user_id)))
  ))
);
drop policy if exists "Users can delete their comments" on public.feed_comments;
create policy "Users can delete their comments" on public.feed_comments for delete using (auth.uid() = user_id);

create index if not exists feed_post_likes_post_idx on public.feed_post_likes(post_id);
create index if not exists feed_comments_post_created_idx on public.feed_comments(post_id, created_at);
