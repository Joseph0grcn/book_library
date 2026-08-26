create table if not exists public.books (
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
  isbn text default '',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.books enable row level security;

drop policy if exists "Users can view their own books" on public.books;
create policy "Users can view their own books" on public.books for select using (auth.uid() = user_id);

drop policy if exists "Users can insert their own books" on public.books;
create policy "Users can insert their own books" on public.books for insert with check (auth.uid() = user_id);

drop policy if exists "Users can update their own books" on public.books;
create policy "Users can update their own books" on public.books for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "Users can delete their own books" on public.books;
create policy "Users can delete their own books" on public.books for delete using (auth.uid() = user_id);

create index if not exists books_user_id_idx on public.books(user_id);
create index if not exists books_user_isbn_idx on public.books(user_id, isbn);

alter table public.books add column if not exists start_date text default '';
alter table public.books add column if not exists finish_date text default '';
alter table public.books add column if not exists shelf text not null default 'owned';

