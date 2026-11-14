import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  PauseCircle,
  Pencil,
  PlayCircle,
  Plus,
  Repeat,
  RotateCcw,
  StopCircle,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '../App'
import {
  type Categoria,
  type Lancamento,
  type Recorrencia,
  type TipoLancamento,
  createLancamentoAvulso,
  createRecorrencia,
  encerrarRecorrencia,
  fetchCategorias,
  fetchLancamentos,
  fetchRecorrencias,
  togglePauseRecorrencia,
  updateLancamento,
  updateRecorrencia,
} from '../lib/supabase'
import {
  centsToDecimalInput,
  formatCentsToBRL,
  formatDateBR,
  formatYearMonthLong,
  getCurrentYearMonthSaoPaulo,
  getTodaySaoPaulo,
  parseBRLInputToCents,
  shiftYearMonth,
} from '../lib/utils'

// ============================================================================
// MODAL DE CRIAÇÃO / EDIÇÃO DE RECORRÊNCIA
// Ao editar o valor, pergunta se vale só para os próximos lançamentos
// ou também para os já gerados pendentes!
// ============================================================================
function RecorrenciaFormModal({
  open,
  onClose,
  editingRecorrencia,
  defaultTipo = 'despesa',
  categorias,
}: {
  open: boolean
  onClose: () => void
  editingRecorrencia: Recorrencia | null
  defaultTipo?: TipoLancamento
  categorias: Categoria[]
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const currentYM = getCurrentYearMonthSaoPaulo()

  const [tipo, setTipo] = useState<TipoLancamento>(defaultTipo)
  const [descricao, setDescricao] = useState('')
  const [valorStr, setValorStr] = useState('')
  const [diaDoMes, setDiaDoMes] = useState('5')
  const [dataInicio, setDataInicio] = useState(`${currentYM}-01`)
  const [dataFim, setDataFim] = useState('')
  const [categoriaId, setCategoriaId] = useState('')
  const [escopoValor, setEscopoValor] = useState<
    'tambem_pendentes' | 'apenas_futuros'
  >('tambem_pendentes')
  const [erro, setErro] = useState<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    setErro(null)
    if (editingRecorrencia) {
      setTipo(editingRecorrencia.tipo)
      setDescricao(editingRecorrencia.descricao)
      setValorStr(centsToDecimalInput(editingRecorrencia.valor_centavos))
      setDiaDoMes(String(editingRecorrencia.dia_do_mes))
      setDataInicio(editingRecorrencia.data_inicio)
      setDataFim(editingRecorrencia.data_fim || '')
      setCategoriaId(editingRecorrencia.categoria_id || '')
      setEscopoValor('tambem_pendentes')
    } else {
      setTipo(defaultTipo)
      setDescricao('')
      setValorStr('')
      setDiaDoMes('5')
      setDataInicio(`${currentYM}-01`)
      setDataFim('')
      setCategoriaId('')
    }
  }, [open, editingRecorrencia, defaultTipo, currentYM])

  const novoValorCents = parseBRLInputToCents(valorStr)
  const valorMudou =
    Boolean(editingRecorrencia) &&
    novoValorCents > 0 &&
    novoValorCents !== editingRecorrencia!.valor_centavos

  const saveMut = useMutation({
    mutationFn: async () => {
      setErro(null)
      if (!descricao.trim()) throw new Error('Informe a descrição.')
      if (novoValorCents <= 0)
        throw new Error('Informe um valor maior que R$ 0,00.')
      const dia = Number(diaDoMes)
      if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
        throw new Error('O dia do mês deve ser entre 1 e 31.')
      }
      if (!dataInicio) throw new Error('Informe a data de início.')
      if (dataFim && dataFim < dataInicio) {
        throw new Error('A data de fim não pode ser anterior à data de início.')
      }

      if (editingRecorrencia) {
        await updateRecorrencia(
          user!.id,
          editingRecorrencia.id,
          {
            tipo,
            descricao: descricao.trim(),
            valor_centavos: novoValorCents,
            dia_do_mes: dia,
            data_inicio: dataInicio,
            data_fim: dataFim || null,
            categoria_id: categoriaId || null,
          },
          escopoValor
        )
      } else {
        await createRecorrencia(user!.id, {
          tipo,
          descricao: descricao.trim(),
          valor_centavos: novoValorCents,
          dia_do_mes: dia,
          data_inicio: dataInicio,
          data_fim: dataFim || null,
          categoria_id: categoriaId || null,
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recorrencias'] })
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      onClose()
    },
    onError: (err: unknown) => {
      setErro(
        err instanceof Error ? err.message : 'Erro ao salvar recorrência.'
      )
    },
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-base">
              {editingRecorrencia
                ? 'Editar Recorrência'
                : 'Nova Recorrência Mensal'}
            </h2>
            <p className="text-xs text-muted-foreground">
              Gera lançamentos automaticamente para os próximos 24 meses
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            saveMut.mutate()
          }}
          className="p-5 space-y-4"
        >
          {/* Seletor Despesa Fixa vs Receita Fixa */}
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted rounded-xl text-xs font-semibold">
            <button
              type="button"
              onClick={() => setTipo('despesa')}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
                tipo === 'despesa'
                  ? 'bg-destructive text-destructive-foreground shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ArrowDownCircle className="h-3.5 w-3.5" />
              Despesa Fixa (Aluguel, Internet...)
            </button>
            <button
              type="button"
              onClick={() => setTipo('receita')}
              className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
                tipo === 'receita'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <ArrowUpCircle className="h-3.5 w-3.5" />
              Receita Fixa (Salário, Aluguel...)
            </button>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Descrição
            </label>
            <input
              type="text"
              required
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={
                tipo === 'receita'
                  ? 'Ex: Salário Mensal, Pró-labore...'
                  : 'Ex: Aluguel, Fibra Óptica, Condomínio, Netflix...'
              }
              className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Valor mensal (R$)
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={valorStr}
                onChange={(e) => setValorStr(e.target.value)}
                placeholder="0,00"
                className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm font-bold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Dia do mês (1 a 31)
              </label>
              <input
                type="number"
                min={1}
                max={31}
                required
                value={diaDoMes}
                onChange={(e) => setDiaDoMes(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm font-semibold"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Categoria
              </label>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-background border border-input text-sm"
              >
                <option value="">Sem categoria</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Data de início
              </label>
              <input
                type="date"
                required
                value={dataInicio}
                onChange={(e) => setDataInicio(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Data de fim (opcional)
              </label>
              <input
                type="date"
                value={dataFim}
                onChange={(e) => setDataFim(e.target.value)}
                className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm"
              />
            </div>
          </div>

          <p className="text-[11px] text-muted-foreground">
            Dica: Se o dia escolhido (ex.: 31) não existir em algum mês (como
            fevereiro ou abril), o vencimento será ajustado automaticamente para
            o último dia daquele mês.
          </p>

          {/* Pergunta obrigatória quando o usuário edita o valor da recorrência */}
          {editingRecorrencia && valorMudou && (
            <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 space-y-2.5">
              <div className="text-xs font-bold text-amber-700 dark:text-amber-300">
                Você alterou o valor de{' '}
                {formatCentsToBRL(editingRecorrencia.valor_centavos)} para{' '}
                {formatCentsToBRL(novoValorCents)}. Onde aplicar este novo valor?
              </div>
              <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="escopoValor"
                  checked={escopoValor === 'tambem_pendentes'}
                  onChange={() => setEscopoValor('tambem_pendentes')}
                  className="mt-0.5"
                />
                <span>
                  <strong className="text-foreground">
                    Também nos lançamentos pendentes já gerados
                  </strong>{' '}
                  (atualiza todas as parcelas futuras ainda pendentes; os meses já
                  pagos/recebidos permanecem intactos no histórico).
                </span>
              </label>
              <label className="flex items-start gap-2.5 text-xs cursor-pointer">
                <input
                  type="radio"
                  name="escopoValor"
                  checked={escopoValor === 'apenas_futuros'}
                  onChange={() => setEscopoValor('apenas_futuros')}
                  className="mt-0.5"
                />
                <span>
                  <strong className="text-foreground">
                    Só para os próximos lançamentos ainda não gerados
                  </strong>{' '}
                  (mantém o valor antigo nos lançamentos pendentes que já existem).
                </span>
              </label>
            </div>
          )}

          {erro && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive font-medium">
              {erro}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl border border-border text-xs font-medium hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saveMut.isPending}
              className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-95"
            >
              {saveMut.isPending
                ? 'Salvando...'
                : editingRecorrencia
                  ? 'Salvar Alterações'
                  : 'Criar Recorrência (24 meses)'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// MODAL PARA MARCAR RECEITA COMO "RECEBIDO" INFORMANDO VALOR REALIZADO
// ============================================================================
function ConfirmarRecebimentoModal({
  lancamento,
  onClose,
}: {
  lancamento: Lancamento | null
  onClose: () => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const today = getTodaySaoPaulo()

  const [valorRealStr, setValorRealStr] = useState('')
  const [dataRecebimento, setDataRecebimento] = useState(today)

  React.useEffect(() => {
    if (lancamento) {
      setValorRealStr(
        centsToDecimalInput(
          lancamento.valor_real_centavos ?? lancamento.valor_previsto_centavos
        )
      )
      setDataRecebimento(lancamento.data_pagamento || today)
    }
  }, [lancamento, today])

  const receberMut = useMutation({
    mutationFn: async () => {
      if (!lancamento) return
      const realCents = parseBRLInputToCents(valorRealStr)
      await updateLancamento(user!.id, lancamento.id, {
        status: 'recebido',
        data_pagamento: dataRecebimento || today,
        valor_real_centavos:
          realCents > 0 ? realCents : lancamento.valor_previsto_centavos,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      onClose()
    },
  })

  if (!lancamento) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-bold text-sm">Confirmar Recebimento</h3>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            receberMut.mutate()
          }}
          className="p-5 space-y-4"
        >
          <div className="p-3 rounded-xl bg-muted/40 border border-border flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Valor previsto:</span>
            <strong className="text-foreground text-sm">
              {formatCentsToBRL(lancamento.valor_previsto_centavos)}
            </strong>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Valor efetivamente recebido (Realizado R$)
            </label>
            <input
              type="text"
              inputMode="decimal"
              required
              autoFocus
              value={valorRealStr}
              onChange={(e) => setValorRealStr(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm font-bold text-emerald-600 dark:text-emerald-400"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Data do recebimento
            </label>
            <input
              type="date"
              required
              value={dataRecebimento}
              onChange={(e) => setDataRecebimento(e.target.value)}
              className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-9 px-3.5 rounded-xl border border-border text-xs font-medium"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={receberMut.isPending}
              className="h-9 px-4 rounded-xl bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500"
            >
              Marcar como Recebido
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// TELA DE RECORRÊNCIAS E RECEITAS (FASE 4)
// ============================================================================
export function RecorrenciasPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const today = getTodaySaoPaulo()
  const currentYM = getCurrentYearMonthSaoPaulo()

  const [subView, setSubView] = useState<'recorrencias' | 'receitas'>(
    'recorrencias'
  )
  const [selectedYM, setSelectedYM] = useState<string>(currentYM)

  // Modal de criar/editar recorrência
  const [recModalOpen, setRecModalOpen] = useState(false)
  const [recModalDefaultTipo, setRecModalDefaultTipo] =
    useState<TipoLancamento>('despesa')
  const [editingRec, setEditingRec] = useState<Recorrencia | null>(null)

  // Confirmação de encerramento de recorrência
  const [confirmEndRec, setConfirmEndRec] = useState<Recorrencia | null>(null)

  // Modal rápido de nova receita variável (avulsa)
  const [novaReceitaAvulsaOpen, setNovaReceitaAvulsaOpen] = useState(false)
  const [avulsaDesc, setAvulsaDesc] = useState('')
  const [avulsaPrevistoStr, setAvulsaPrevistoStr] = useState('')
  const [avulsaRealStr, setAvulsaRealStr] = useState('')
  const [avulsaData, setAvulsaData] = useState(today)
  const [avulsaCatId, setAvulsaCatId] = useState('')
  const [avulsaJaRecebido, setAvulsaJaRecebido] = useState(false)

  // Modal para confirmar recebimento informando Previsto vs Realizado
  const [recebendoLancamento, setRecebendoLancamento] =
    useState<Lancamento | null>(null)

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias', user?.id],
    queryFn: () => fetchCategorias(user!.id),
    enabled: Boolean(user),
  })

  const { data: recorrencias = [], isLoading: loadingRec } = useQuery({
    queryKey: ['recorrencias', user?.id],
    queryFn: () => fetchRecorrencias(user!.id),
    enabled: Boolean(user),
  })

  const { data: lancamentos = [], isLoading: loadingLanc } = useQuery({
    queryKey: ['lancamentos', user?.id],
    queryFn: () => fetchLancamentos(user!.id),
    enabled: Boolean(user),
  })

  const categoriasMap = useMemo(() => {
    const map = new Map<string, Categoria>()
    for (const c of categorias) map.set(c.id, c)
    return map
  }, [categorias])

  // Estatísticas de lançamentos por recorrência
  const statsByRecId = useMemo(() => {
    const map = new Map<
      string,
      { pagos: number; pendentes: number; proximoVencimento: string | null }
    >()
    for (const l of lancamentos) {
      if (!l.recorrencia_id) continue
      const cur = map.get(l.recorrencia_id) || {
        pagos: 0,
        pendentes: 0,
        proximoVencimento: null,
      }
      if (l.status === 'pendente') {
        cur.pendentes += 1
        if (
          !cur.proximoVencimento ||
          l.data_vencimento < cur.proximoVencimento
        ) {
          cur.proximoVencimento = l.data_vencimento
        }
      } else {
        cur.pagos += 1
      }
      map.set(l.recorrencia_id, cur)
    }
    return map
  }, [lancamentos])

  // Mutations de Recorrências
  const pauseResumeMut = useMutation({
    mutationFn: ({ id, ativa }: { id: string; ativa: boolean }) =>
      togglePauseRecorrencia(user!.id, id, ativa),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['recorrencias'] })
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
    },
  })

  const encerrarMut = useMutation({
    mutationFn: (id: string) => encerrarRecorrencia(user!.id, id, today),
    onSuccess: () => {
      setConfirmEndRec(null)
      qc.invalidateQueries({ queryKey: ['recorrencias'] })
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
    },
  })

  // Mutation de criação de Receita Variável (Avulsa)
  const createReceitaAvulsaMut = useMutation({
    mutationFn: async () => {
      const prevCents = parseBRLInputToCents(avulsaPrevistoStr)
      if (!avulsaDesc.trim() || prevCents <= 0) {
        throw new Error('Preencha descrição e valor previsto.')
      }
      const realCents =
        avulsaJaRecebido && avulsaRealStr.trim()
          ? parseBRLInputToCents(avulsaRealStr)
          : avulsaJaRecebido
            ? prevCents
            : null

      await createLancamentoAvulso(user!.id, {
        tipo: 'receita',
        descricao: avulsaDesc.trim(),
        valor_previsto_centavos: prevCents,
        valor_real_centavos: realCents,
        data_vencimento: avulsaData,
        status: avulsaJaRecebido ? 'recebido' : 'pendente',
        data_pagamento: avulsaJaRecebido ? today : null,
        categoria_id: avulsaCatId || null,
      })
    },
    onSuccess: () => {
      setAvulsaDesc('')
      setAvulsaPrevistoStr('')
      setAvulsaRealStr('')
      setAvulsaJaRecebido(false)
      setNovaReceitaAvulsaOpen(false)
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
    },
  })

  const reabrirReceitaMut = useMutation({
    mutationFn: (id: string) =>
      updateLancamento(user!.id, id, {
        status: 'pendente',
        data_pagamento: null,
        valor_real_centavos: null,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
    },
  })

  // Separação das recorrências
  const despesasFixas = useMemo(
    () => recorrencias.filter((r) => r.tipo === 'despesa'),
    [recorrencias]
  )
  const receitasFixas = useMemo(
    () => recorrencias.filter((r) => r.tipo === 'receita'),
    [recorrencias]
  )

  // Receitas do mês selecionado (Fixas vs Variáveis lado a lado)
  const receitasDoMes = useMemo(() => {
    return lancamentos.filter(
      (l) => l.tipo === 'receita' && l.data_vencimento.slice(0, 7) === selectedYM
    )
  }, [lancamentos, selectedYM])

  const receitasFixasDoMes = useMemo(
    () => receitasDoMes.filter((l) => l.origem === 'recorrencia'),
    [receitasDoMes]
  )
  const receitasVariaveisDoMes = useMemo(
    () => receitasDoMes.filter((l) => l.origem !== 'recorrencia'),
    [receitasDoMes]
  )

  const resumoReceitasMes = useMemo(() => {
    let totalPrevisto = 0
    let totalRealizado = 0
    for (const r of receitasDoMes) {
      totalPrevisto += r.valor_previsto_centavos
      if (r.status === 'recebido') {
        totalRealizado += r.valor_real_centavos ?? r.valor_previsto_centavos
      }
    }
    return {
      totalPrevisto,
      totalRealizado,
      faltaReceber: Math.max(0, totalPrevisto - totalRealizado),
    }
  }, [receitasDoMes])

  const renderRecorrenciaCard = (r: Recorrencia) => {
    const cat = r.categoria_id ? categoriasMap.get(r.categoria_id) : undefined
    const stats = statsByRecId.get(r.id) || {
      pagos: 0,
      pendentes: 0,
      proximoVencimento: null,
    }
    const isEncerrada = !r.ativa && Boolean(r.data_fim)
    const isPausada = !r.ativa && !r.data_fim

    return (
      <div
        key={r.id}
        className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          !r.ativa
            ? 'bg-card/50 border-border opacity-80'
            : 'bg-card border-border'
        }`}
      >
        <div className="space-y-1.5 min-w-0">
          <div className="flex items-center flex-wrap gap-2">
            <span className="font-bold text-base truncate">{r.descricao}</span>
            <span className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-xs font-semibold">
              Todo dia {r.dia_do_mes}
            </span>
            {cat && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-background">
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: cat.cor }}
                />
                {cat.nome}
              </span>
            )}
            {r.ativa ? (
              <span className="px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                Ativa (24 meses)
              </span>
            ) : isEncerrada ? (
              <span className="px-2 py-0.5 rounded-md bg-destructive/15 text-destructive text-xs font-bold">
                Encerrada em {formatDateBR(r.data_fim)}
              </span>
            ) : isPausada ? (
              <span className="px-2 py-0.5 rounded-md bg-amber-500/15 text-amber-600 dark:text-amber-400 text-xs font-bold">
                Pausada
              </span>
            ) : null}
          </div>

          <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-3 gap-y-1">
            <span>Início: {formatDateBR(r.data_inicio)}</span>
            {r.data_fim && <span>• Fim: {formatDateBR(r.data_fim)}</span>}
            <span>
              • Histórico preservado:{' '}
              <strong className="text-foreground">{stats.pagos} pagos</strong>
            </span>
            <span>
              • Pendentes gerados:{' '}
              <strong className="text-foreground">{stats.pendentes}</strong>
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
          <div
            className={`text-base sm:text-lg font-extrabold whitespace-nowrap ${
              r.tipo === 'receita'
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-foreground'
            }`}
          >
            {r.tipo === 'receita' ? '+ ' : '- '}
            {formatCentsToBRL(r.valor_centavos)}
            <span className="text-[11px] font-normal text-muted-foreground block text-right">
              /mês
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setEditingRec(r)
                setRecModalOpen(true)
              }}
              className="h-8 px-2.5 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium inline-flex items-center gap-1"
              title="Editar recorrência"
            >
              <Pencil className="h-3.5 w-3.5" />
              Editar
            </button>

            {r.ativa ? (
              <button
                type="button"
                onClick={() =>
                  pauseResumeMut.mutate({ id: r.id, ativa: false })
                }
                className="h-8 px-2.5 rounded-lg border border-amber-500/40 text-amber-600 dark:text-amber-400 hover:bg-amber-500/10 text-xs font-medium inline-flex items-center gap-1"
                title="Pausar recorrência sem apagar lançamentos"
              >
                <PauseCircle className="h-3.5 w-3.5" />
                Pausar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => pauseResumeMut.mutate({ id: r.id, ativa: true })}
                className="h-8 px-2.5 rounded-lg border border-emerald-500/40 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10 text-xs font-medium inline-flex items-center gap-1"
                title="Retomar recorrência e gerar próximos 24 meses"
              >
                <PlayCircle className="h-3.5 w-3.5" />
                Retomar
              </button>
            )}

            {r.ativa && (
              <button
                type="button"
                onClick={() => setConfirmEndRec(r)}
                className="h-8 px-2.5 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground text-xs font-medium inline-flex items-center gap-1"
                title="Encerrar recorrência (mantém pagos e remove futuros pendentes)"
              >
                <StopCircle className="h-3.5 w-3.5" />
                Encerrar
              </button>
            )}
          </div>
        </div>
      </div>
    )
  }

  const renderReceitaItem = (l: Lancamento) => {
    const recebido = l.status === 'recebido'
    const valorReal = l.valor_real_centavos ?? l.valor_previsto_centavos
    const diff = valorReal - l.valor_previsto_centavos

    return (
      <div
        key={l.id}
        className={`p-3.5 rounded-xl border transition space-y-2.5 ${
          recebido
            ? 'bg-emerald-500/5 border-emerald-500/30'
            : 'bg-background border-border'
        }`}
      >
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm">{l.descricao}</span>
              <span
                className={`px-2 py-0.5 rounded text-[11px] font-bold ${
                  recebido
                    ? 'bg-emerald-600 text-white'
                    : 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                }`}
              >
                {recebido ? 'Recebido' : 'Pendente'}
              </span>
            </div>
            <div className="text-xs text-muted-foreground mt-0.5">
              Previsão: {formatDateBR(l.data_vencimento)}
              {recebido &&
                l.data_pagamento &&
                ` • Recebido em ${formatDateBR(l.data_pagamento)}`}
            </div>
          </div>

          {!recebido ? (
            <button
              type="button"
              onClick={() => setRecebendoLancamento(l)}
              className="h-8 px-3 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 inline-flex items-center gap-1 shrink-0 shadow-xs"
            >
              <Check className="h-3.5 w-3.5 stroke-[2.5]" />
              Receber
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setRecebendoLancamento(l)}
                className="h-8 px-2.5 rounded-lg border border-border bg-card text-xs font-medium hover:bg-muted"
                title="Ajustar valor realizado"
              >
                Ajustar
              </button>
              <button
                type="button"
                onClick={() => reabrirReceitaMut.mutate(l.id)}
                className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
                title="Voltar para pendente"
              >
                <RotateCcw className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>

        {/* Previsto e Realizado Lado a Lado */}
        <div className="grid grid-cols-2 gap-2 pt-2 border-t border-border/60 text-xs">
          <div className="p-2 rounded-lg bg-muted/40">
            <span className="text-[11px] text-muted-foreground block">
              Valor Previsto
            </span>
            <strong className="text-sm font-bold text-foreground">
              {formatCentsToBRL(l.valor_previsto_centavos)}
            </strong>
          </div>
          <div
            className={`p-2 rounded-lg ${
              recebido
                ? 'bg-emerald-500/15 border border-emerald-500/30'
                : 'bg-muted/20'
            }`}
          >
            <span className="text-[11px] text-muted-foreground block">
              Valor Realizado
            </span>
            {recebido ? (
              <div className="flex items-baseline justify-between gap-1">
                <strong className="text-sm font-extrabold text-emerald-600 dark:text-emerald-400">
                  {formatCentsToBRL(valorReal)}
                </strong>
                {diff !== 0 && (
                  <span
                    className={`text-[10px] font-bold ${
                      diff > 0 ? 'text-emerald-600' : 'text-destructive'
                    }`}
                  >
                    ({diff > 0 ? '+' : ''}
                    {formatCentsToBRL(diff)})
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground italic">
                Aguardando recebimento
              </span>
            )}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho e Seletor de Sub-visão */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">
            Recorrências e Receitas
          </h1>
          <p className="text-sm text-muted-foreground">
            Despesas e receitas fixas (janela automática de 24 meses) e
            comparativo Previsto vs. Realizado
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setEditingRec(null)
              setRecModalDefaultTipo('despesa')
              setRecModalOpen(true)
            }}
            className="h-10 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Nova Recorrência
          </button>
          <button
            type="button"
            onClick={() => {
              setAvulsaData(
                selectedYM === currentYM ? today : `${selectedYM}-15`
              )
              setNovaReceitaAvulsaOpen(true)
            }}
            className="h-10 px-3.5 rounded-xl bg-emerald-600 text-white text-xs font-semibold inline-flex items-center gap-1.5 shadow-xs hover:bg-emerald-500"
          >
            <Plus className="h-4 w-4" />
            Receita Variável
          </button>
        </div>
      </div>

      {/* Abas de alternância */}
      <div className="grid grid-cols-2 gap-2 p-1.5 bg-card border border-border rounded-2xl">
        <button
          type="button"
          onClick={() => setSubView('recorrencias')}
          className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition ${
            subView === 'recorrencias'
              ? 'bg-primary text-primary-foreground shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Repeat className="h-4 w-4" />
          Cadastros Fixos ({recorrencias.length})
        </button>
        <button
          type="button"
          onClick={() => setSubView('receitas')}
          className={`py-2.5 px-3 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-center gap-2 transition ${
            subView === 'receitas'
              ? 'bg-emerald-600 text-white shadow-xs'
              : 'text-muted-foreground hover:text-foreground'
          }`}
        >
          <Wallet className="h-4 w-4" />
          Receitas Fixas vs. Variáveis (Previsto x Realizado)
        </button>
      </div>

      {subView === 'recorrencias' ? (
        <div className="space-y-6">
          {loadingRec || loadingLanc ? (
            <div className="p-10 rounded-2xl bg-card border border-border text-center text-sm text-muted-foreground">
              Carregando recorrências...
            </div>
          ) : (
            <>
              {/* Seção 1: Receitas Fixas */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold flex items-center gap-2">
                    <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
                    Receitas Fixas Mensais ({receitasFixas.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRec(null)
                      setRecModalDefaultTipo('receita')
                      setRecModalOpen(true)
                    }}
                    className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar receita fixa
                  </button>
                </div>

                {receitasFixas.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-card border border-border text-center text-xs text-muted-foreground">
                    Nenhuma receita fixa cadastrada (ex.: Salário).
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {receitasFixas.map(renderRecorrenciaCard)}
                  </div>
                )}
              </div>

              {/* Seção 2: Despesas Fixas */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-base font-bold flex items-center gap-2">
                    <ArrowDownCircle className="h-4 w-4 text-rose-500" />
                    Despesas Fixas Mensais ({despesasFixas.length})
                  </h2>
                  <button
                    type="button"
                    onClick={() => {
                      setEditingRec(null)
                      setRecModalDefaultTipo('despesa')
                      setRecModalOpen(true)
                    }}
                    className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Adicionar despesa fixa
                  </button>
                </div>

                {despesasFixas.length === 0 ? (
                  <div className="p-6 rounded-2xl bg-card border border-border text-center text-xs text-muted-foreground">
                    Nenhuma despesa fixa cadastrada (ex.: Aluguel, Internet,
                    Assinaturas).
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {despesasFixas.map(renderRecorrenciaCard)}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      ) : (
        /* Visão Lado a Lado: Receitas Fixas e Receitas Variáveis (Previsto x Realizado) */
        <div className="space-y-5">
          {/* Seletor de Mês e Resumo Previsto vs Realizado */}
          <div className="bg-card border border-border rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedYM(shiftYearMonth(selectedYM, -1))}
                className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <div className="px-2">
                <h2 className="font-bold text-base capitalize">
                  {formatYearMonthLong(selectedYM)}
                </h2>
                <p className="text-xs text-muted-foreground">
                  Comparativo de Receitas Previstas x Realizadas
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedYM(shiftYearMonth(selectedYM, 1))}
                className="h-9 w-9 rounded-xl border border-border flex items-center justify-center hover:bg-muted"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div className="px-3 py-2 rounded-xl bg-muted/40 border border-border">
                <span className="text-[11px] text-muted-foreground block">
                  Total Previsto
                </span>
                <strong className="text-sm sm:text-base font-bold">
                  {formatCentsToBRL(resumoReceitasMes.totalPrevisto)}
                </strong>
              </div>
              <div className="px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/30">
                <span className="text-[11px] text-muted-foreground block">
                  Total Realizado
                </span>
                <strong className="text-sm sm:text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                  {formatCentsToBRL(resumoReceitasMes.totalRealizado)}
                </strong>
              </div>
              <div className="px-3 py-2 rounded-xl bg-amber-500/10 border border-amber-500/30">
                <span className="text-[11px] text-muted-foreground block">
                  Falta Receber
                </span>
                <strong className="text-sm sm:text-base font-bold text-amber-600 dark:text-amber-400">
                  {formatCentsToBRL(resumoReceitasMes.faltaReceber)}
                </strong>
              </div>
            </div>
          </div>

          {/* Duas Colunas Lado a Lado: Receitas Fixas vs Receitas Variáveis (Avulsas) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Coluna 1: Receitas Fixas (Recorrentes) */}
            <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-1.5">
                    <Repeat className="h-4 w-4 text-primary" />
                    Receitas Fixas no Mês ({receitasFixasDoMes.length})
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Geradas pelas suas recorrências mensais
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setEditingRec(null)
                    setRecModalDefaultTipo('receita')
                    setRecModalOpen(true)
                  }}
                  className="h-8 px-2.5 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold hover:opacity-90"
                >
                  + Fixa
                </button>
              </div>

              {receitasFixasDoMes.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Nenhuma receita fixa neste mês.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {receitasFixasDoMes.map(renderReceitaItem)}
                </div>
              )}
            </div>

            {/* Coluna 2: Receitas Variáveis (Avulsas) */}
            <div className="p-4 rounded-2xl bg-card border border-border space-y-3">
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div>
                  <h3 className="font-bold text-sm flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                    Receitas Variáveis / Avulsas ({receitasVariaveisDoMes.length}
                    )
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Lançadas avulsamente no mês em que entram
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAvulsaData(
                      selectedYM === currentYM ? today : `${selectedYM}-15`
                    )
                    setNovaReceitaAvulsaOpen(true)
                  }}
                  className="h-8 px-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500"
                >
                  + Variável
                </button>
              </div>

              {receitasVariaveisDoMes.length === 0 ? (
                <div className="p-6 text-center text-xs text-muted-foreground">
                  Nenhuma receita variável lançada em{' '}
                  {formatYearMonthLong(selectedYM)}.
                </div>
              ) : (
                <div className="space-y-2.5">
                  {receitasVariaveisDoMes.map(renderReceitaItem)}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal de Criar/Editar Recorrência */}
      <RecorrenciaFormModal
        open={recModalOpen}
        onClose={() => setRecModalOpen(false)}
        editingRecorrencia={editingRec}
        defaultTipo={recModalDefaultTipo}
        categorias={categorias}
      />

      {/* Modal de Confirmação para Encerrar Recorrência */}
      {confirmEndRec && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base">
                  Encerrar recorrência "{confirmEndRec.descricao}"?
                </h3>
                <p className="text-xs text-muted-foreground">
                  Todos os lançamentos{' '}
                  <strong className="text-foreground">
                    já pagos/recebidos permanecerão salvos no seu histórico
                  </strong>
                  , e apenas os lançamentos futuros ainda pendentes serão
                  removidos.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmEndRec(null)}
                className="h-9 px-4 rounded-xl border border-border text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={encerrarMut.isPending}
                onClick={() => encerrarMut.mutate(confirmEndRec.id)}
                className="h-9 px-4 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold"
              >
                Confirmar encerramento
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Rápido: Nova Receita Variável (Avulsa) */}
      {novaReceitaAvulsaOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <div>
                <h3 className="font-bold text-base">
                  Nova Receita Variável (Avulsa)
                </h3>
                <p className="text-xs text-muted-foreground">
                  Informe o valor previsto e, se já entrou, o valor realizado
                </p>
              </div>
              <button
                onClick={() => setNovaReceitaAvulsaOpen(false)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                createReceitaAvulsaMut.mutate()
              }}
              className="p-5 space-y-4"
            >
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Descrição
                </label>
                <input
                  type="text"
                  required
                  value={avulsaDesc}
                  onChange={(e) => setAvulsaDesc(e.target.value)}
                  placeholder="Ex: Projeto Freelance, Bônus, Venda..."
                  className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Valor previsto (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    required
                    value={avulsaPrevistoStr}
                    onChange={(e) => setAvulsaPrevistoStr(e.target.value)}
                    placeholder="0,00"
                    className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Data prevista
                  </label>
                  <input
                    type="date"
                    required
                    value={avulsaData}
                    onChange={(e) => setAvulsaData(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">
                  Categoria
                </label>
                <select
                  value={avulsaCatId}
                  onChange={(e) => setAvulsaCatId(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm"
                >
                  <option value="">Sem categoria</option>
                  {categorias.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
              </div>

              <div className="p-3 rounded-xl bg-muted/40 border border-border space-y-2.5">
                <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={avulsaJaRecebido}
                    onChange={(e) => setAvulsaJaRecebido(e.target.checked)}
                  />
                  <span>Já foi recebido</span>
                </label>
                {avulsaJaRecebido && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Valor realizado / recebido (R$)
                    </label>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={avulsaRealStr}
                      onChange={(e) => setAvulsaRealStr(e.target.value)}
                      placeholder={avulsaPrevistoStr || 'Igual ao previsto'}
                      className="w-full h-9 px-3 rounded-lg bg-background border border-input text-xs font-bold"
                    />
                  </div>
                )}
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setNovaReceitaAvulsaOpen(false)}
                  className="h-9 px-4 rounded-xl border border-border text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={createReceitaAvulsaMut.isPending}
                  className="h-9 px-4 rounded-xl bg-emerald-600 text-white text-xs font-semibold"
                >
                  Salvar Receita
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de Confirmar Recebimento (Previsto vs Realizado) */}
      <ConfirmarRecebimentoModal
        lancamento={recebendoLancamento}
        onClose={() => setRecebendoLancamento(null)}
      />
    </div>
  )
}
