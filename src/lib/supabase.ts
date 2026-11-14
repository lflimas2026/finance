/// <reference types="vite/client" />
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import {
  addMonthsClamped,
  buildMonthlyDateClamped,
  getCurrentYearMonthSaoPaulo,
  getTodaySaoPaulo,
  shiftYearMonth,
} from './utils'

export type TipoLancamento = 'receita' | 'despesa'
export type StatusLancamento = 'pendente' | 'pago' | 'recebido'
export type OrigemLancamento = 'avulso' | 'parcelamento' | 'recorrencia'

export interface Categoria {
  id: string
  user_id: string
  nome: string
  cor: string
}

export interface Parcelamento {
  id: string
  user_id: string
  descricao: string
  valor_parcela_centavos: number
  total_parcelas: number
  primeira_parcela_data: string
  categoria_id: string | null
}

export interface Recorrencia {
  id: string
  user_id: string
  tipo: TipoLancamento
  descricao: string
  valor_centavos: number
  dia_do_mes: number
  data_inicio: string
  data_fim: string | null
  categoria_id: string | null
  ativa: boolean
}

export interface Lancamento {
  id: string
  user_id: string
  tipo: TipoLancamento
  descricao: string
  valor_previsto_centavos: number
  valor_real_centavos: number | null
  data_vencimento: string
  status: StatusLancamento
  data_pagamento: string | null
  origem: OrigemLancamento
  parcelamento_id: string | null
  numero_parcela: number | null
  recorrencia_id: string | null
  categoria_id: string | null
}

export const DEFAULT_CATEGORIAS: Array<{ nome: string; cor: string }> = [
  { nome: 'Moradia', cor: '#2563eb' },
  { nome: 'Alimentação', cor: '#16a34a' },
  { nome: 'Transporte', cor: '#d97706' },
  { nome: 'Saúde', cor: '#dc2626' },
  { nome: 'Educação', cor: '#7c3aed' },
  { nome: 'Lazer', cor: '#db2777' },
  { nome: 'Cartão', cor: '#0891b2' },
  { nome: 'Dívidas', cor: '#ea580c' },
  { nome: 'Assinaturas', cor: '#4f46e5' },
  { nome: 'Outros', cor: '#64748b' },
]

const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim()
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim()

export const isSupabaseConfigured =
  Boolean(supabaseUrl && supabaseAnonKey) &&
  !supabaseUrl.includes('seu-projeto.supabase.co')

export const supabase: SupabaseClient | null = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseAnonKey)
  : null

// ============================================================================
// ARMAZENAMENTO LOCAL (DEMO / FALLBACK QUANDO .env.local AINDA NÃO CONFIGURADO)
// ============================================================================
const LS_KEYS = {
  USER: 'finances_demo_user_v1',
  CATEGORIAS: 'finances_categorias_v1',
  PARCELAMENTOS: 'finances_parcelamentos_v1',
  RECORRENCIAS: 'finances_recorrencias_v1',
  LANCAMENTOS: 'finances_lancamentos_v1',
}

function genId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID()
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0
    const v = c === 'x' ? r : (r & 0x3) | 0x8
    return v.toString(16)
  })
}

function readLS<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function writeLS<T>(key: string, value: T): void {
  localStorage.setItem(key, JSON.stringify(value))
}

export function isLocalDemoUser(userId: string): boolean {
  return !isSupabaseConfigured || userId.startsWith('demo-')
}

// ============================================================================
// CATEGORIAS
// ============================================================================
export async function ensureDefaultCategorias(userId: string): Promise<Categoria[]> {
  if (!isLocalDemoUser(userId) && supabase) {
    const { data: existing, error } = await supabase
      .from('categorias')
      .select('*')
      .eq('user_id', userId)
      .order('nome', { ascending: true })

    if (error) throw new Error(error.message)
    if (existing && existing.length > 0) return existing as Categoria[]

    const toInsert = DEFAULT_CATEGORIAS.map((c) => ({
      user_id: userId,
      nome: c.nome,
      cor: c.cor,
    }))
    const { data: created, error: insertErr } = await supabase
      .from('categorias')
      .insert(toInsert)
      .select('*')

    if (insertErr) throw new Error(insertErr.message)
    return (created || []) as Categoria[]
  }

  const all = readLS<Categoria[]>(LS_KEYS.CATEGORIAS, [])
  const mine = all.filter((c) => c.user_id === userId)
  if (mine.length > 0) {
    return mine.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }
  const created: Categoria[] = DEFAULT_CATEGORIAS.map((c) => ({
    id: genId(),
    user_id: userId,
    nome: c.nome,
    cor: c.cor,
  }))
  writeLS(LS_KEYS.CATEGORIAS, [...all, ...created])
  return created.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
}

export async function fetchCategorias(userId: string): Promise<Categoria[]> {
  return ensureDefaultCategorias(userId)
}

export async function createCategoria(
  userId: string,
  payload: { nome: string; cor: string }
): Promise<Categoria> {
  if (!isLocalDemoUser(userId) && supabase) {
    const { data, error } = await supabase
      .from('categorias')
      .insert({ user_id: userId, nome: payload.nome.trim(), cor: payload.cor })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as Categoria
  }

  const all = readLS<Categoria[]>(LS_KEYS.CATEGORIAS, [])
  const nova: Categoria = {
    id: genId(),
    user_id: userId,
    nome: payload.nome.trim(),
    cor: payload.cor,
  }
  writeLS(LS_KEYS.CATEGORIAS, [...all, nova])
  return nova
}

export async function updateCategoria(
  userId: string,
  id: string,
  payload: { nome: string; cor: string }
): Promise<void> {
  if (!isLocalDemoUser(userId) && supabase) {
    const { error } = await supabase
      .from('categorias')
      .update({ nome: payload.nome.trim(), cor: payload.cor })
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)
    return
  }

  const all = readLS<Categoria[]>(LS_KEYS.CATEGORIAS, [])
  writeLS(
    LS_KEYS.CATEGORIAS,
    all.map((c) =>
      c.id === id && c.user_id === userId
        ? { ...c, nome: payload.nome.trim(), cor: payload.cor }
        : c
    )
  )
}

export async function deleteCategoria(userId: string, id: string): Promise<void> {
  if (!isLocalDemoUser(userId) && supabase) {
    const { error } = await supabase
      .from('categorias')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)
    return
  }

  const all = readLS<Categoria[]>(LS_KEYS.CATEGORIAS, [])
  writeLS(
    LS_KEYS.CATEGORIAS,
    all.filter((c) => !(c.id === id && c.user_id === userId))
  )
}

// ============================================================================
// LANÇAMENTOS
// ============================================================================
export async function fetchLancamentos(userId: string): Promise<Lancamento[]> {
  if (!isLocalDemoUser(userId) && supabase) {
    const { data, error } = await supabase
      .from('lancamentos')
      .select('*')
      .eq('user_id', userId)
      .order('data_vencimento', { ascending: true })
      .order('descricao', { ascending: true })
    if (error) throw new Error(error.message)
    return (data || []) as Lancamento[]
  }

  const all = readLS<Lancamento[]>(LS_KEYS.LANCAMENTOS, [])
  return all
    .filter((l) => l.user_id === userId)
    .sort(
      (a, b) =>
        a.data_vencimento.localeCompare(b.data_vencimento) ||
        a.descricao.localeCompare(b.descricao, 'pt-BR')
    )
}

export async function createLancamentoAvulso(
  userId: string,
  payload: {
    tipo: TipoLancamento
    descricao: string
    valor_previsto_centavos: number
    valor_real_centavos?: number | null
    data_vencimento: string
    status: StatusLancamento
    data_pagamento?: string | null
    categoria_id: string | null
  }
): Promise<Lancamento> {
  const row: Omit<Lancamento, 'id'> = {
    user_id: userId,
    tipo: payload.tipo,
    descricao: payload.descricao.trim(),
    valor_previsto_centavos: payload.valor_previsto_centavos,
    valor_real_centavos:
      payload.status !== 'pendente'
        ? (payload.valor_real_centavos ?? payload.valor_previsto_centavos)
        : (payload.valor_real_centavos ?? null),
    data_vencimento: payload.data_vencimento,
    status: payload.status,
    data_pagamento:
      payload.status !== 'pendente'
        ? payload.data_pagamento || getTodaySaoPaulo()
        : null,
    origem: 'avulso',
    parcelamento_id: null,
    numero_parcela: null,
    recorrencia_id: null,
    categoria_id: payload.categoria_id || null,
  }

  if (!isLocalDemoUser(userId) && supabase) {
    const { data, error } = await supabase
      .from('lancamentos')
      .insert(row)
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    return data as Lancamento
  }

  const all = readLS<Lancamento[]>(LS_KEYS.LANCAMENTOS, [])
  const created: Lancamento = { id: genId(), ...row }
  writeLS(LS_KEYS.LANCAMENTOS, [...all, created])
  return created
}

export async function updateLancamento(
  userId: string,
  id: string,
  patch: Partial<Omit<Lancamento, 'id' | 'user_id'>>
): Promise<void> {
  if (!isLocalDemoUser(userId) && supabase) {
    const { error } = await supabase
      .from('lancamentos')
      .update(patch)
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)
    return
  }

  const all = readLS<Lancamento[]>(LS_KEYS.LANCAMENTOS, [])
  writeLS(
    LS_KEYS.LANCAMENTOS,
    all.map((l) => (l.id === id && l.user_id === userId ? { ...l, ...patch } : l))
  )
}

/**
 * Verifica se um parcelamento ficou sem nenhuma parcela na tabela `lancamentos`
 * e, caso positivo, remove o parcelamento órfão.
 */
async function cleanupOrphanParcelamento(
  userId: string,
  parcelamentoId: string
): Promise<void> {
  if (!isLocalDemoUser(userId) && supabase) {
    const { count, error } = await supabase
      .from('lancamentos')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('parcelamento_id', parcelamentoId)

    if (!error && (count === 0 || count === null)) {
      await supabase
        .from('parcelamentos')
        .delete()
        .eq('id', parcelamentoId)
        .eq('user_id', userId)
    }
    return
  }

  const allL = readLS<Lancamento[]>(LS_KEYS.LANCAMENTOS, [])
  const remaining = allL.some(
    (l) => l.user_id === userId && l.parcelamento_id === parcelamentoId
  )
  if (!remaining) {
    const allP = readLS<Parcelamento[]>(LS_KEYS.PARCELAMENTOS, [])
    writeLS(
      LS_KEYS.PARCELAMENTOS,
      allP.filter((p) => !(p.user_id === userId && p.id === parcelamentoId))
    )
  }
}

export async function deleteLancamento(userId: string, id: string): Promise<void> {
  if (!isLocalDemoUser(userId) && supabase) {
    const { data: row } = await supabase
      .from('lancamentos')
      .select('parcelamento_id')
      .eq('id', id)
      .eq('user_id', userId)
      .maybeSingle()

    const { error } = await supabase
      .from('lancamentos')
      .delete()
      .eq('id', id)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)

    if (row?.parcelamento_id) {
      await cleanupOrphanParcelamento(userId, row.parcelamento_id)
    }
    return
  }

  const all = readLS<Lancamento[]>(LS_KEYS.LANCAMENTOS, [])
  const target = all.find((l) => l.id === id && l.user_id === userId)
  writeLS(
    LS_KEYS.LANCAMENTOS,
    all.filter((l) => !(l.id === id && l.user_id === userId))
  )
  if (target?.parcelamento_id) {
    await cleanupOrphanParcelamento(userId, target.parcelamento_id)
  }
}

/**
 * Exclui lançamento com escopo ("so_este" | "este_e_proximos" | "tudo")
 * para parcelamentos e recorrências na tela Mês, removendo também parcelamento órfão.
 */
export async function deleteLancamentoComEscopo(
  userId: string,
  lancamento: Lancamento,
  escopo: 'so_este' | 'este_e_proximos' | 'tudo'
): Promise<void> {
  if (escopo === 'so_este' || lancamento.origem === 'avulso') {
    await deleteLancamento(userId, lancamento.id)
    return
  }

  if (lancamento.origem === 'parcelamento' && lancamento.parcelamento_id) {
    if (escopo === 'tudo') {
      await deleteParcelamentoInteiro(userId, lancamento.parcelamento_id)
      return
    }

    // escopo === 'este_e_proximos'
    if (!isLocalDemoUser(userId) && supabase) {
      if (lancamento.numero_parcela !== null) {
        const { error } = await supabase
          .from('lancamentos')
          .delete()
          .eq('user_id', userId)
          .eq('parcelamento_id', lancamento.parcelamento_id)
          .gte('numero_parcela', lancamento.numero_parcela)
        if (error) throw new Error(error.message)
      } else {
        const { error } = await supabase
          .from('lancamentos')
          .delete()
          .eq('user_id', userId)
          .eq('parcelamento_id', lancamento.parcelamento_id)
          .gte('data_vencimento', lancamento.data_vencimento)
        if (error) throw new Error(error.message)
      }
      await cleanupOrphanParcelamento(userId, lancamento.parcelamento_id)
      return
    }

    const allL = readLS<Lancamento[]>(LS_KEYS.LANCAMENTOS, [])
    writeLS(
      LS_KEYS.LANCAMENTOS,
      allL.filter((l) => {
        if (
          l.user_id === userId &&
          l.parcelamento_id === lancamento.parcelamento_id
        ) {
          if (
            lancamento.numero_parcela !== null &&
            l.numero_parcela !== null
          ) {
            return l.numero_parcela < lancamento.numero_parcela
          }
          return l.data_vencimento < lancamento.data_vencimento
        }
        return true
      })
    )
    await cleanupOrphanParcelamento(userId, lancamento.parcelamento_id)
    return
  }

  if (lancamento.origem === 'recorrencia' && lancamento.recorrencia_id) {
    // Exclui este lançamento e os próximos pendentes, e encerra a recorrência preservando pagos/recebidos anteriores
    const dataCorte = lancamento.data_vencimento
    if (!isLocalDemoUser(userId) && supabase) {
      await supabase
        .from('recorrencias')
        .update({ ativa: false, data_fim: dataCorte })
        .eq('id', lancamento.recorrencia_id)
        .eq('user_id', userId)

      await supabase
        .from('lancamentos')
        .delete()
        .eq('id', lancamento.id)
        .eq('user_id', userId)

      const { error } = await supabase
        .from('lancamentos')
        .delete()
        .eq('user_id', userId)
        .eq('recorrencia_id', lancamento.recorrencia_id)
        .eq('status', 'pendente')
        .gte('data_vencimento', dataCorte)
      if (error) throw new Error(error.message)
      return
    }

    const allR = readLS<Recorrencia[]>(LS_KEYS.RECORRENCIAS, [])
    writeLS(
      LS_KEYS.RECORRENCIAS,
      allR.map((r) =>
        r.id === lancamento.recorrencia_id && r.user_id === userId
          ? { ...r, ativa: false, data_fim: dataCorte }
          : r
      )
    )

    const allL = readLS<Lancamento[]>(LS_KEYS.LANCAMENTOS, [])
    writeLS(
      LS_KEYS.LANCAMENTOS,
      allL.filter((l) => {
        if (l.id === lancamento.id && l.user_id === userId) return false
        if (
          l.user_id === userId &&
          l.recorrencia_id === lancamento.recorrencia_id &&
          l.status === 'pendente' &&
          l.data_vencimento >= dataCorte
        ) {
          return false
        }
        return true
      })
    )
  }
}

// ============================================================================
// PARCELAMENTOS (FASE 3 - Suporta 100+ parcelas e modo "já em andamento")
// ============================================================================
export async function fetchParcelamentos(userId: string): Promise<Parcelamento[]> {
  if (!isLocalDemoUser(userId) && supabase) {
    const { data, error } = await supabase
      .from('parcelamentos')
      .select('*')
      .eq('user_id', userId)
      .order('primeira_parcela_data', { ascending: false })
    if (error) throw new Error(error.message)
    return (data || []) as Parcelamento[]
  }

  const all = readLS<Parcelamento[]>(LS_KEYS.PARCELAMENTOS, [])
  return all.filter((p) => p.user_id === userId)
}

export async function createParcelamentoComParcelas(
  userId: string,
  payload: {
    descricao: string
    valor_parcela_centavos: number
    total_parcelas: number
    categoria_id: string | null
    modo: 'inicio' | 'andamento'
    data_referencia: string
    parcela_atual?: number
  }
): Promise<Parcelamento> {
  const parcelaInicial =
    payload.modo === 'andamento'
      ? Math.max(1, Math.min(payload.total_parcelas, payload.parcela_atual || 1))
      : 1

  const primeiraParcelaData =
    payload.modo === 'andamento'
      ? addMonthsClamped(payload.data_referencia, -(parcelaInicial - 1))
      : payload.data_referencia

  let parcelamentoCriado: Parcelamento

  if (!isLocalDemoUser(userId) && supabase) {
    const { data, error } = await supabase
      .from('parcelamentos')
      .insert({
        user_id: userId,
        descricao: payload.descricao.trim(),
        valor_parcela_centavos: payload.valor_parcela_centavos,
        total_parcelas: payload.total_parcelas,
        primeira_parcela_data: primeiraParcelaData,
        categoria_id: payload.categoria_id || null,
      })
      .select('*')
      .single()

    if (error) throw new Error(error.message)
    parcelamentoCriado = data as Parcelamento
  } else {
    const allP = readLS<Parcelamento[]>(LS_KEYS.PARCELAMENTOS, [])
    parcelamentoCriado = {
      id: genId(),
      user_id: userId,
      descricao: payload.descricao.trim(),
      valor_parcela_centavos: payload.valor_parcela_centavos,
      total_parcelas: payload.total_parcelas,
      primeira_parcela_data: primeiraParcelaData,
      categoria_id: payload.categoria_id || null,
    }
    writeLS(LS_KEYS.PARCELAMENTOS, [...allP, parcelamentoCriado])
  }

  const lancamentosBatch: Array<Omit<Lancamento, 'id'>> = []
  for (let num = parcelaInicial; num <= payload.total_parcelas; num++) {
    const offsetFromRef = num - parcelaInicial
    const dataVencimento = addMonthsClamped(payload.data_referencia, offsetFromRef)
    lancamentosBatch.push({
      user_id: userId,
      tipo: 'despesa',
      descricao: payload.descricao.trim(),
      valor_previsto_centavos: payload.valor_parcela_centavos,
      valor_real_centavos: null,
      data_vencimento: dataVencimento,
      status: 'pendente',
      data_pagamento: null,
      origem: 'parcelamento',
      parcelamento_id: parcelamentoCriado.id,
      numero_parcela: num,
      recorrencia_id: null,
      categoria_id: payload.categoria_id || null,
    })
  }

  if (!isLocalDemoUser(userId) && supabase) {
    const { error: batchErr } = await supabase
      .from('lancamentos')
      .insert(lancamentosBatch)
    if (batchErr) throw new Error(batchErr.message)
  } else {
    const allL = readLS<Lancamento[]>(LS_KEYS.LANCAMENTOS, [])
    const withIds: Lancamento[] = lancamentosBatch.map((item) => ({
      id: genId(),
      ...item,
    }))
    writeLS(LS_KEYS.LANCAMENTOS, [...allL, ...withIds])
  }

  return parcelamentoCriado
}

export async function markMultipleLancamentosPaid(
  userId: string,
  ids: string[],
  dataPagamento?: string
): Promise<void> {
  if (ids.length === 0) return
  const payDate = dataPagamento || getTodaySaoPaulo()

  if (!isLocalDemoUser(userId) && supabase) {
    const { data: rows, error: fetchErr } = await supabase
      .from('lancamentos')
      .select('id, tipo, valor_previsto_centavos, valor_real_centavos')
      .eq('user_id', userId)
      .in('id', ids)
    if (fetchErr) throw new Error(fetchErr.message)

    for (const r of rows || []) {
      const novoStatus: StatusLancamento = r.tipo === 'receita' ? 'recebido' : 'pago'
      const { error } = await supabase
        .from('lancamentos')
        .update({
          status: novoStatus,
          data_pagamento: payDate,
          valor_real_centavos: r.valor_real_centavos ?? r.valor_previsto_centavos,
        })
        .eq('id', r.id)
        .eq('user_id', userId)
      if (error) throw new Error(error.message)
    }
    return
  }

  const all = readLS<Lancamento[]>(LS_KEYS.LANCAMENTOS, [])
  const idSet = new Set(ids)
  writeLS(
    LS_KEYS.LANCAMENTOS,
    all.map((l) =>
      l.user_id === userId && idSet.has(l.id)
        ? {
            ...l,
            status: l.tipo === 'receita' ? 'recebido' : 'pago',
            data_pagamento: payDate,
            valor_real_centavos: l.valor_real_centavos ?? l.valor_previsto_centavos,
          }
        : l
    )
  )
}

export async function deleteParcelamentoInteiro(
  userId: string,
  parcelamentoId: string
): Promise<void> {
  if (!isLocalDemoUser(userId) && supabase) {
    await supabase
      .from('lancamentos')
      .delete()
      .eq('parcelamento_id', parcelamentoId)
      .eq('user_id', userId)

    const { error } = await supabase
      .from('parcelamentos')
      .delete()
      .eq('id', parcelamentoId)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)
    return
  }

  const allL = readLS<Lancamento[]>(LS_KEYS.LANCAMENTOS, [])
  writeLS(
    LS_KEYS.LANCAMENTOS,
    allL.filter(
      (l) => !(l.user_id === userId && l.parcelamento_id === parcelamentoId)
    )
  )

  const allP = readLS<Parcelamento[]>(LS_KEYS.PARCELAMENTOS, [])
  writeLS(
    LS_KEYS.PARCELAMENTOS,
    allP.filter((p) => !(p.user_id === userId && p.id === parcelamentoId))
  )
}

// ============================================================================
// RECORRÊNCIAS (FASE 4 - Janela de 24 meses, extensão automática e edição)
// ============================================================================
export async function fetchRecorrencias(userId: string): Promise<Recorrencia[]> {
  if (!isLocalDemoUser(userId) && supabase) {
    const { data, error } = await supabase
      .from('recorrencias')
      .select('*')
      .eq('user_id', userId)
      .order('descricao', { ascending: true })
    if (error) throw new Error(error.message)
    return (data || []) as Recorrencia[]
  }

  const all = readLS<Recorrencia[]>(LS_KEYS.RECORRENCIAS, [])
  return all
    .filter((r) => r.user_id === userId)
    .sort((a, b) => a.descricao.localeCompare(b.descricao, 'pt-BR'))
}

export async function syncRecorrencias24Meses(userId: string): Promise<number> {
  const [recorrencias, lancamentos] = await Promise.all([
    fetchRecorrencias(userId),
    fetchLancamentos(userId),
  ])

  const ativas = recorrencias.filter((r) => r.ativa)
  if (ativas.length === 0) return 0

  const currentYM = getCurrentYearMonthSaoPaulo()
  const maxHorizonYM = shiftYearMonth(currentYM, 23)

  const existingMonthsByRecId = new Map<string, Set<string>>()
  for (const l of lancamentos) {
    if (l.recorrencia_id) {
      let set = existingMonthsByRecId.get(l.recorrencia_id)
      if (!set) {
        set = new Set<string>()
        existingMonthsByRecId.set(l.recorrencia_id, set)
      }
      set.add(l.data_vencimento.slice(0, 7))
    }
  }

  const toCreate: Array<Omit<Lancamento, 'id'>> = []

  for (const rec of ativas) {
    const startYM = rec.data_inicio.slice(0, 7)
    const firstYM = startYM > currentYM ? startYM : currentYM
    const horizonForRec =
      startYM > currentYM ? shiftYearMonth(startYM, 23) : maxHorizonYM
    const endYM = rec.data_fim ? rec.data_fim.slice(0, 7) : horizonForRec
    const targetEndYM = endYM < horizonForRec ? endYM : horizonForRec

    const existingSet = existingMonthsByRecId.get(rec.id) || new Set<string>()

    let cursorYM = firstYM
    let safetyCounter = 0
    while (cursorYM <= targetEndYM && safetyCounter < 120) {
      safetyCounter++
      if (!existingSet.has(cursorYM)) {
        const [yStr, mStr] = cursorYM.split('-')
        const vencimento = buildMonthlyDateClamped(
          Number(yStr),
          Number(mStr),
          rec.dia_do_mes
        )
        if (
          vencimento >= rec.data_inicio &&
          (!rec.data_fim || vencimento <= rec.data_fim)
        ) {
          toCreate.push({
            user_id: userId,
            tipo: rec.tipo,
            descricao: rec.descricao,
            valor_previsto_centavos: rec.valor_centavos,
            valor_real_centavos: null,
            data_vencimento: vencimento,
            status: 'pendente',
            data_pagamento: null,
            origem: 'recorrencia',
            parcelamento_id: null,
            numero_parcela: null,
            recorrencia_id: rec.id,
            categoria_id: rec.categoria_id,
          })
          existingSet.add(cursorYM)
        }
      }
      cursorYM = shiftYearMonth(cursorYM, 1)
    }
  }

  if (toCreate.length === 0) return 0

  if (!isLocalDemoUser(userId) && supabase) {
    const { error } = await supabase.from('lancamentos').insert(toCreate)
    if (error) throw new Error(error.message)
  } else {
    const allL = readLS<Lancamento[]>(LS_KEYS.LANCAMENTOS, [])
    const withIds: Lancamento[] = toCreate.map((item) => ({
      id: genId(),
      ...item,
    }))
    writeLS(LS_KEYS.LANCAMENTOS, [...allL, ...withIds])
  }

  return toCreate.length
}

export async function createRecorrencia(
  userId: string,
  payload: {
    tipo: TipoLancamento
    descricao: string
    valor_centavos: number
    dia_do_mes: number
    data_inicio: string
    data_fim: string | null
    categoria_id: string | null
  }
): Promise<Recorrencia> {
  let created: Recorrencia
  if (!isLocalDemoUser(userId) && supabase) {
    const { data, error } = await supabase
      .from('recorrencias')
      .insert({
        user_id: userId,
        tipo: payload.tipo,
        descricao: payload.descricao.trim(),
        valor_centavos: payload.valor_centavos,
        dia_do_mes: payload.dia_do_mes,
        data_inicio: payload.data_inicio,
        data_fim: payload.data_fim || null,
        categoria_id: payload.categoria_id || null,
        ativa: true,
      })
      .select('*')
      .single()
    if (error) throw new Error(error.message)
    created = data as Recorrencia
  } else {
    const all = readLS<Recorrencia[]>(LS_KEYS.RECORRENCIAS, [])
    created = {
      id: genId(),
      user_id: userId,
      tipo: payload.tipo,
      descricao: payload.descricao.trim(),
      valor_centavos: payload.valor_centavos,
      dia_do_mes: payload.dia_do_mes,
      data_inicio: payload.data_inicio,
      data_fim: payload.data_fim || null,
      categoria_id: payload.categoria_id || null,
      ativa: true,
    }
    writeLS(LS_KEYS.RECORRENCIAS, [...all, created])
  }

  await syncRecorrencias24Meses(userId)
  return created
}

export async function updateRecorrencia(
  userId: string,
  recorrenciaId: string,
  payload: {
    tipo: TipoLancamento
    descricao: string
    valor_centavos: number
    dia_do_mes: number
    data_inicio: string
    data_fim: string | null
    categoria_id: string | null
  },
  escopoValor: 'apenas_futuros' | 'tambem_pendentes'
): Promise<void> {
  if (!isLocalDemoUser(userId) && supabase) {
    const { error } = await supabase
      .from('recorrencias')
      .update({
        tipo: payload.tipo,
        descricao: payload.descricao.trim(),
        valor_centavos: payload.valor_centavos,
        dia_do_mes: payload.dia_do_mes,
        data_inicio: payload.data_inicio,
        data_fim: payload.data_fim || null,
        categoria_id: payload.categoria_id || null,
      })
      .eq('id', recorrenciaId)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)

    const { data: pendentes, error: pendErr } = await supabase
      .from('lancamentos')
      .select('id, data_vencimento, valor_previsto_centavos')
      .eq('user_id', userId)
      .eq('recorrencia_id', recorrenciaId)
      .eq('status', 'pendente')

    if (pendErr) throw new Error(pendErr.message)

    for (const p of pendentes || []) {
      const [yStr, mStr] = p.data_vencimento.slice(0, 7).split('-')
      const novaDataVenc = buildMonthlyDateClamped(
        Number(yStr),
        Number(mStr),
        payload.dia_do_mes
      )

      if (payload.data_fim && novaDataVenc > payload.data_fim) {
        await supabase
          .from('lancamentos')
          .delete()
          .eq('id', p.id)
          .eq('user_id', userId)
      } else {
        await supabase
          .from('lancamentos')
          .update({
            tipo: payload.tipo,
            descricao: payload.descricao.trim(),
            categoria_id: payload.categoria_id || null,
            data_vencimento: novaDataVenc,
            valor_previsto_centavos:
              escopoValor === 'tambem_pendentes'
                ? payload.valor_centavos
                : p.valor_previsto_centavos,
          })
          .eq('id', p.id)
          .eq('user_id', userId)
      }
    }
  } else {
    const allR = readLS<Recorrencia[]>(LS_KEYS.RECORRENCIAS, [])
    writeLS(
      LS_KEYS.RECORRENCIAS,
      allR.map((r) =>
        r.id === recorrenciaId && r.user_id === userId
          ? {
              ...r,
              tipo: payload.tipo,
              descricao: payload.descricao.trim(),
              valor_centavos: payload.valor_centavos,
              dia_do_mes: payload.dia_do_mes,
              data_inicio: payload.data_inicio,
              data_fim: payload.data_fim || null,
              categoria_id: payload.categoria_id || null,
            }
          : r
      )
    )

    const allL = readLS<Lancamento[]>(LS_KEYS.LANCAMENTOS, [])
    const updatedL: Lancamento[] = []
    for (const l of allL) {
      if (
        l.user_id === userId &&
        l.recorrencia_id === recorrenciaId &&
        l.status === 'pendente'
      ) {
        const [yStr, mStr] = l.data_vencimento.slice(0, 7).split('-')
        const novaDataVenc = buildMonthlyDateClamped(
          Number(yStr),
          Number(mStr),
          payload.dia_do_mes
        )
        if (payload.data_fim && novaDataVenc > payload.data_fim) {
          continue
        }
        updatedL.push({
          ...l,
          tipo: payload.tipo,
          descricao: payload.descricao.trim(),
          categoria_id: payload.categoria_id || null,
          data_vencimento: novaDataVenc,
          valor_previsto_centavos:
            escopoValor === 'tambem_pendentes'
              ? payload.valor_centavos
              : l.valor_previsto_centavos,
        })
      } else {
        updatedL.push(l)
      }
    }
    writeLS(LS_KEYS.LANCAMENTOS, updatedL)
  }

  await syncRecorrencias24Meses(userId)
}

export async function togglePauseRecorrencia(
  userId: string,
  recorrenciaId: string,
  ativa: boolean
): Promise<void> {
  if (!isLocalDemoUser(userId) && supabase) {
    const { error } = await supabase
      .from('recorrencias')
      .update({
        ativa,
        ...(ativa ? { data_fim: null } : {}),
      })
      .eq('id', recorrenciaId)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)
  } else {
    const allR = readLS<Recorrencia[]>(LS_KEYS.RECORRENCIAS, [])
    writeLS(
      LS_KEYS.RECORRENCIAS,
      allR.map((r) =>
        r.id === recorrenciaId && r.user_id === userId
          ? { ...r, ativa, ...(ativa ? { data_fim: null } : {}) }
          : r
      )
    )
  }

  if (ativa) {
    await syncRecorrencias24Meses(userId)
  }
}

export async function encerrarRecorrencia(
  userId: string,
  recorrenciaId: string,
  dataEncerramento?: string
): Promise<void> {
  const endDay = dataEncerramento || getTodaySaoPaulo()
  if (!isLocalDemoUser(userId) && supabase) {
    const { error } = await supabase
      .from('recorrencias')
      .update({ ativa: false, data_fim: endDay })
      .eq('id', recorrenciaId)
      .eq('user_id', userId)
    if (error) throw new Error(error.message)

    await supabase
      .from('lancamentos')
      .delete()
      .eq('recorrencia_id', recorrenciaId)
      .eq('user_id', userId)
      .eq('status', 'pendente')
    return
  }

  const allR = readLS<Recorrencia[]>(LS_KEYS.RECORRENCIAS, [])
  writeLS(
    LS_KEYS.RECORRENCIAS,
    allR.map((r) =>
      r.id === recorrenciaId && r.user_id === userId
        ? { ...r, ativa: false, data_fim: endDay }
        : r
    )
  )

  const allL = readLS<Lancamento[]>(LS_KEYS.LANCAMENTOS, [])
  writeLS(
    LS_KEYS.LANCAMENTOS,
    allL.filter(
      (l) =>
        !(
          l.user_id === userId &&
          l.recorrencia_id === recorrenciaId &&
          l.status === 'pendente'
        )
    )
  )
}
