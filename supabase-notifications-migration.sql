-- React bildirim merkezi için bir kez Supabase SQL Editor'da çalıştırın.
create table if not exists public.notifications (
  id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null default 'activity',
  title text not null,
  body text not null default '',
  entity_id text not null default '',
  read boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.notifications enable row level security;
drop policy if exists "Users can view their notifications" on public.notifications;
create policy "Users can view their notifications" on public.notifications for select using (auth.uid() = user_id);
drop policy if exists "Users can mark their notifications read" on public.notifications;
create policy "Users can mark their notifications read" on public.notifications for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index if not exists notifications_user_created_idx on public.notifications(user_id, created_at desc);

create or replace function public.create_book_notification() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into public.notifications (id, user_id, type, title, body, entity_id)
  select md5(random()::text || clock_timestamp()::text), f.friend_id, 'book', 'Yeni kitap paylaşımı', new.title, new.id
  from (
    select case when requester_id = new.user_id then addressee_id else requester_id end as friend_id
    from public.friendships where status = 'accepted' and (requester_id = new.user_id or addressee_id = new.user_id)
  ) f;
  return new;
end; $$;
drop trigger if exists feed_post_notification on public.feed_posts;
create trigger feed_post_notification after insert on public.feed_posts for each row execute function public.create_book_notification();

-- Beğeni ve yorumlar için ayrı, sabit mesajlı güvenli trigger fonksiyonları.
create or replace function public.notify_like() returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid; begin select user_id into owner_id from public.feed_posts where id = new.post_id; if owner_id is not null and owner_id <> new.user_id then insert into public.notifications (id,user_id,type,title,body,entity_id) values (md5(random()::text || clock_timestamp()::text),owner_id,'like','Yeni beğeni','Bir arkadaşın gönderini beğendi.',new.post_id); end if; return new; end; $$;
create or replace function public.notify_comment() returns trigger language plpgsql security definer set search_path = public as $$
declare owner_id uuid; begin select user_id into owner_id from public.feed_posts where id = new.post_id; if owner_id is not null and owner_id <> new.user_id then insert into public.notifications (id,user_id,type,title,body,entity_id) values (md5(random()::text || clock_timestamp()::text),owner_id,'comment','Yeni yorum',left(new.body,120),new.post_id); end if; return new; end; $$;
drop trigger if exists feed_like_notification on public.feed_post_likes;
create trigger feed_like_notification after insert on public.feed_post_likes for each row execute function public.notify_like();
drop trigger if exists feed_comment_notification on public.feed_comments;
create trigger feed_comment_notification after insert on public.feed_comments for each row execute function public.notify_comment();

alter publication supabase_realtime add table public.notifications;
