-- =============================================================================
-- CONTROLE FINANCEIRO PESSOAL - SCHEMA SQL COMPLETO E IDEMPOTENTE (SUPABASE)
-- Execute este arquivo no SQL Editor do Supabase. Pode ser executado múltiplas
-- vezes com segurança (idempotente).
-- =============================================================================

-- Extensão para geração de UUIDs
create extension if not exists "pgcrypto";

-- -----------------------------------------------------------------------------
-- 1. TABELA: categorias
-- -----------------------------------------------------------------------------
create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  nome text not null,
  cor text not null default '#6366f1',
  created_at timestamptz not null default now()
);

create index if not exists idx_categorias_user_id
  on public.categorias (user_id);

alter table public.categorias enable row level security;

drop policy if exists "categorias_select_own" on public.categorias;
create policy "categorias_select_own"
  on public.categorias for select
  using (user_id = auth.uid());

drop policy if exists "categorias_insert_own" on public.categorias;
create policy "categorias_insert_own"
  on public.categorias for insert
  with check (user_id = auth.uid());

drop policy if exists "categorias_update_own" on public.categorias;
create policy "categorias_update_own"
  on public.categorias for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "categorias_delete_own" on public.categorias;
create policy "categorias_delete_own"
  on public.categorias for delete
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 2. TABELA: parcelamentos
-- -----------------------------------------------------------------------------
create table if not exists public.parcelamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  descricao text not null,
  valor_parcela_centavos integer not null check (valor_parcela_centavos > 0),
  total_parcelas integer not null check (total_parcelas >= 1),
  primeira_parcela_data date not null,
  categoria_id uuid references public.categorias(id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_parcelamentos_user_id
  on public.parcelamentos (user_id);

alter table public.parcelamentos enable row level security;

drop policy if exists "parcelamentos_select_own" on public.parcelamentos;
create policy "parcelamentos_select_own"
  on public.parcelamentos for select
  using (user_id = auth.uid());

drop policy if exists "parcelamentos_insert_own" on public.parcelamentos;
create policy "parcelamentos_insert_own"
  on public.parcelamentos for insert
  with check (user_id = auth.uid());

drop policy if exists "parcelamentos_update_own" on public.parcelamentos;
create policy "parcelamentos_update_own"
  on public.parcelamentos for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "parcelamentos_delete_own" on public.parcelamentos;
create policy "parcelamentos_delete_own"
  on public.parcelamentos for delete
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 3. TABELA: recorrencias
-- -----------------------------------------------------------------------------
create table if not exists public.recorrencias (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('receita', 'despesa')),
  descricao text not null,
  valor_centavos integer not null check (valor_centavos > 0),
  dia_do_mes integer not null check (dia_do_mes >= 1 and dia_do_mes <= 31),
  data_inicio date not null,
  data_fim date,
  categoria_id uuid references public.categorias(id) on delete set null,
  ativa boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_recorrencias_user_id
  on public.recorrencias (user_id);

alter table public.recorrencias enable row level security;

drop policy if exists "recorrencias_select_own" on public.recorrencias;
create policy "recorrencias_select_own"
  on public.recorrencias for select
  using (user_id = auth.uid());

drop policy if exists "recorrencias_insert_own" on public.recorrencias;
create policy "recorrencias_insert_own"
  on public.recorrencias for insert
  with check (user_id = auth.uid());

drop policy if exists "recorrencias_update_own" on public.recorrencias;
create policy "recorrencias_update_own"
  on public.recorrencias for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "recorrencias_delete_own" on public.recorrencias;
create policy "recorrencias_delete_own"
  on public.recorrencias for delete
  using (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- 4. TABELA: lancamentos
-- -----------------------------------------------------------------------------
create table if not exists public.lancamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  tipo text not null check (tipo in ('receita', 'despesa')),
  descricao text not null,
  valor_previsto_centavos integer not null check (valor_previsto_centavos >= 0),
  valor_real_centavos integer check (valor_real_centavos is null or valor_real_centavos >= 0),
  data_vencimento date not null,
  status text not null default 'pendente' check (status in ('pendente', 'pago', 'recebido')),
  data_pagamento date,
  origem text not null default 'avulso' check (origem in ('avulso', 'parcelamento', 'recorrencia')),
  parcelamento_id uuid references public.parcelamentos(id) on delete cascade,
  numero_parcela integer check (numero_parcela is null or numero_parcela >= 1),
  recorrencia_id uuid references public.recorrencias(id) on delete set null,
  categoria_id uuid references public.categorias(id) on delete set null,
  created_at timestamptz not null default now()
);

-- Índices obrigatórios (user_id, data_vencimento) e auxiliares para performance
create index if not exists idx_lancamentos_user_vencimento
  on public.lancamentos (user_id, data_vencimento);

create index if not exists idx_lancamentos_parcelamento_id
  on public.lancamentos (parcelamento_id);

create index if not exists idx_lancamentos_recorrencia_id
  on public.lancamentos (recorrencia_id);

alter table public.lancamentos enable row level security;

drop policy if exists "lancamentos_select_own" on public.lancamentos;
create policy "lancamentos_select_own"
  on public.lancamentos for select
  using (user_id = auth.uid());

drop policy if exists "lancamentos_insert_own" on public.lancamentos;
create policy "lancamentos_insert_own"
  on public.lancamentos for insert
  with check (user_id = auth.uid());

drop policy if exists "lancamentos_update_own" on public.lancamentos;
create policy "lancamentos_update_own"
  on public.lancamentos for update
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

drop policy if exists "lancamentos_delete_own" on public.lancamentos;
create policy "lancamentos_delete_own"
  on public.lancamentos for delete
  using (user_id = auth.uid());
