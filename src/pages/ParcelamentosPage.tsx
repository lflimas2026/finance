import React, { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  CreditCard,
  DollarSign,
  Plus,
  RotateCcw,
  Square,
  Trash2,
  X,
} from 'lucide-react'
import { useAuth } from '../App'
import {
  type Categoria,
  type Lancamento,
  type Parcelamento,
  deleteParcelamentoInteiro,
  fetchCategorias,
  fetchLancamentos,
  fetchParcelamentos,
  markMultipleLancamentosPaid,
  updateLancamento,
} from '../lib/supabase'
import {
  addMonthsClamped,
  centsToDecimalInput,
  formatCentsToBRL,
  formatDateBR,
  formatYearMonthLong,
  getTodaySaoPaulo,
  isOverdue,
  parseBRLInputToCents,
} from '../lib/utils'

export function ParcelamentosPage({
  onOpenNewParcelamento,
}: {
  onOpenNewParcelamento: () => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const today = getTodaySaoPaulo()

  // ID do parcelamento aberto em detalhes
  const [expandedId, setExpandedId] = useState<string | null>(null)

  // Seleção múltipla de parcelas para quitar/antecipar de uma vez
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [bulkPayDate, setBulkPayDate] = useState<string>(today)

  // Edição rápida de valor de uma parcela específica
  const [editingValorParcela, setEditingValorParcela] =
    useState<Lancamento | null>(null)
  const [novoValorStr, setNovoValorStr] = useState<string>('')

  // Adiar uma parcela específica
  const [postponingParcela, setPostponingParcela] =
    useState<Lancamento | null>(null)
  const [novaDataVencimento, setNovaDataVencimento] = useState<string>('')

  // Exclusão de parcelamento inteiro com confirmação explícita
  const [confirmDeleteParc, setConfirmDeleteParc] =
    useState<Parcelamento | null>(null)

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias', user?.id],
    queryFn: () => fetchCategorias(user!.id),
    enabled: Boolean(user),
  })

  const { data: parcelamentos = [], isLoading: loadingParc } = useQuery({
    queryKey: ['parcelamentos', user?.id],
    queryFn: () => fetchParcelamentos(user!.id),
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

  // Agrupa as parcelas por parcelamento_id ordenadas pelo número da parcela / vencimento
  const parcelasPorParcelamento = useMemo(() => {
    const map = new Map<string, Lancamento[]>()
    for (const l of lancamentos) {
      if (l.parcelamento_id) {
        const list = map.get(l.parcelamento_id) || []
        list.push(l)
        map.set(l.parcelamento_id, list)
      }
    }
    for (const [k, list] of map.entries()) {
      list.sort(
        (a, b) =>
          (a.numero_parcela || 0) - (b.numero_parcela || 0) ||
          a.data_vencimento.localeCompare(b.data_vencimento)
      )
      map.set(k, list)
    }
    return map
  }, [lancamentos])

  // Resumo geral de todos os parcelamentos ativos
  const resumoGeral = useMemo(() => {
    let totalRestanteCentavos = 0
    let parcelamentosEmAberto = 0
    let parcelasPendentesCount = 0

    for (const p of parcelamentos) {
      const parcelas = parcelasPorParcelamento.get(p.id) || []
      const pendentes = parcelas.filter((l) => l.status === 'pendente')
      if (pendentes.length > 0) {
        parcelamentosEmAberto += 1
        parcelasPendentesCount += pendentes.length
        for (const l of pendentes) {
          totalRestanteCentavos += l.valor_previsto_centavos
        }
      }
    }

    return {
      totalRestanteCentavos,
      parcelamentosEmAberto,
      parcelasPendentesCount,
    }
  }, [parcelamentos, parcelasPorParcelamento])

  // Mutations
  const toggleSinglePaidMut = useMutation({
    mutationFn: async (l: Lancamento) => {
      if (l.status === 'pendente') {
        await updateLancamento(user!.id, l.id, {
          status: 'pago',
          data_pagamento: today,
          valor_real_centavos:
            l.valor_real_centavos ?? l.valor_previsto_centavos,
        })
      } else {
        await updateLancamento(user!.id, l.id, {
          status: 'pendente',
          data_pagamento: null,
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
    },
  })

  const bulkPayMut = useMutation({
    mutationFn: async (ids: string[]) => {
      await markMultipleLancamentosPaid(user!.id, ids, bulkPayDate || today)
    },
    onSuccess: () => {
      setSelectedIds(new Set())
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
    },
  })

  const editValorMut = useMutation({
    mutationFn: async () => {
      if (!editingValorParcela) return
      const cents = parseBRLInputToCents(novoValorStr)
      if (cents <= 0) throw new Error('Informe um valor válido maior que zero.')
      await updateLancamento(user!.id, editingValorParcela.id, {
        valor_previsto_centavos: cents,
        valor_real_centavos:
          editingValorParcela.status === 'pago' ? cents : null,
      })
    },
    onSuccess: () => {
      setEditingValorParcela(null)
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
    },
  })

  const postponeMut = useMutation({
    mutationFn: async (targetDate: string) => {
      if (!postponingParcela || !targetDate) return
      await updateLancamento(user!.id, postponingParcela.id, {
        data_vencimento: targetDate,
      })
    },
    onSuccess: () => {
      setPostponingParcela(null)
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
    },
  })

  const deleteParcMut = useMutation({
    mutationFn: async (parcelamentoId: string) => {
      await deleteParcelamentoInteiro(user!.id, parcelamentoId)
    },
    onSuccess: () => {
      setConfirmDeleteParc(null)
      setExpandedId(null)
      setSelectedIds(new Set())
      qc.invalidateQueries({ queryKey: ['parcelamentos'] })
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
    },
  })

  const toggleSelectParcela = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Parcelamentos</h1>
          <p className="text-sm text-muted-foreground">
            Controle completo de compras parceladas, antecipação e previsão de
            quitação (suporta 100+ parcelas)
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenNewParcelamento}
          className="h-11 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center justify-center gap-2 shadow-sm hover:opacity-95"
        >
          <Plus className="h-4 w-4 stroke-[2.5]" />
          Novo Parcelamento
        </button>
      </div>

      {/* Cartões de Resumo Geral de Parcelamentos */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Saldo restante em parcelas</span>
            <DollarSign className="h-4 w-4 text-primary" />
          </div>
          <div className="text-xl font-extrabold text-foreground">
            {formatCentsToBRL(resumoGeral.totalRestanteCentavos)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Parcelamentos em andamento</span>
            <CreditCard className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-xl font-bold text-foreground">
            {resumoGeral.parcelamentosEmAberto}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              de {parcelamentos.length} cadastrados
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Parcelas restantes a pagar</span>
            <Clock className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-xl font-bold text-foreground">
            {resumoGeral.parcelasPendentesCount}{' '}
            <span className="text-xs font-normal text-muted-foreground">
              vencimentos futuros
            </span>
          </div>
        </div>
      </div>

      {/* Lista de Parcelamentos */}
      {loadingParc || loadingLanc ? (
        <div className="p-10 rounded-2xl bg-card border border-border text-center text-sm text-muted-foreground">
          Carregando parcelamentos...
        </div>
      ) : parcelamentos.length === 0 ? (
        <div className="p-10 rounded-2xl bg-card border border-border text-center space-y-3">
          <div className="h-12 w-12 rounded-2xl bg-muted mx-auto flex items-center justify-center text-muted-foreground">
            <CreditCard className="h-6 w-6" />
          </div>
          <div className="space-y-1">
            <h3 className="font-semibold text-base">
              Nenhum parcelamento cadastrado
            </h3>
            <p className="text-xs text-muted-foreground max-w-md mx-auto">
              Cadastre compras parceladas do início (1ª parcela) ou já em
              andamento (ex: parcela 12 de 36) para projetar seus próximos meses
              automaticamente.
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenNewParcelamento}
            className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
          >
            <Plus className="h-4 w-4" />
            Cadastrar primeiro parcelamento
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {parcelamentos.map((p) => {
            const parcelas = parcelasPorParcelamento.get(p.id) || []
            const cat = p.categoria_id
              ? categoriasMap.get(p.categoria_id)
              : undefined

            const pendentes = parcelas.filter((l) => l.status === 'pendente')
            const atrasadas = pendentes.filter((l) =>
              isOverdue(l.status, l.data_vencimento, today)
            )

            // Quando criado em modo "já em andamento" (ex: da 12/36 em diante),
            // as parcelas anteriores (1..11) já foram pagas antes do cadastro.
            const pagasCount = Math.max(0, p.total_parcelas - pendentes.length)
            const progressoPct = Math.min(
              100,
              Math.round((pagasCount / Math.max(1, p.total_parcelas)) * 100)
            )

            const valorRestanteCentavos = pendentes.reduce(
              (acc, l) => acc + l.valor_previsto_centavos,
              0
            )

            const ultimaParcela =
              pendentes.length > 0
                ? pendentes[pendentes.length - 1]
                : parcelas[parcelas.length - 1]

            const previsaoQuitacaoYM = ultimaParcela
              ? ultimaParcela.data_vencimento.slice(0, 7)
              : null

            const isExpanded = expandedId === p.id
            const selectedInThisParc = parcelas.filter((l) =>
              selectedIds.has(l.id)
            )
            const valorSelecionadoCentavos = selectedInThisParc.reduce(
              (acc, l) => acc + l.valor_previsto_centavos,
              0
            )

            return (
              <div
                key={p.id}
                className="rounded-2xl bg-card border border-border shadow-xs overflow-hidden transition"
              >
                {/* Cabeçalho do Cartão do Parcelamento */}
                <div
                  onClick={() => {
                    setExpandedId(isExpanded ? null : p.id)
                    setSelectedIds(new Set())
                  }}
                  className="p-4 sm:p-5 cursor-pointer hover:bg-muted/30 transition space-y-4"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div className="space-y-1">
                      <div className="flex items-center flex-wrap gap-2">
                        <h3 className="font-bold text-base sm:text-lg">
                          {p.descricao}
                        </h3>
                        {cat && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-background">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: cat.cor }}
                            />
                            {cat.nome}
                          </span>
                        )}
                        {pendentes.length === 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-xs font-bold">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Quitado
                          </span>
                        ) : atrasadas.length > 0 ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-destructive text-destructive-foreground text-xs font-bold">
                            <AlertTriangle className="h-3.5 w-3.5" />
                            {atrasadas.length} em atraso
                          </span>
                        ) : null}
                      </div>

                      <div className="text-xs text-muted-foreground flex items-center flex-wrap gap-x-4 gap-y-1">
                        <span>
                          Parcela base:{' '}
                          <strong className="text-foreground">
                            {formatCentsToBRL(p.valor_parcela_centavos)}
                          </strong>
                        </span>
                        <span>•</span>
                        <span>
                          Previsão de quitação:{' '}
                          <strong className="text-foreground capitalize">
                            {previsaoQuitacaoYM
                              ? `${formatYearMonthLong(previsaoQuitacaoYM)} (${formatDateBR(ultimaParcela?.data_vencimento)})`
                              : '—'}
                          </strong>
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-4">
                      <div className="text-left sm:text-right">
                        <div className="text-[11px] text-muted-foreground">
                          Valor restante
                        </div>
                        <div className="text-lg font-extrabold text-foreground">
                          {formatCentsToBRL(valorRestanteCentavos)}
                        </div>
                      </div>

                      <div className="h-9 w-9 rounded-xl bg-muted/60 flex items-center justify-center text-muted-foreground">
                        {isExpanded ? (
                          <ChevronUp className="h-5 w-5" />
                        ) : (
                          <ChevronDown className="h-5 w-5" />
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Barra de Progresso (pagas / total) */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-foreground">
                        Progresso: {pagasCount} de {p.total_parcelas} parcelas
                        pagas
                      </span>
                      <span className="font-bold text-primary">
                        {progressoPct}% ({pendentes.length} restantes)
                      </span>
                    </div>
                    <div className="h-2.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full bg-primary transition-all duration-300 rounded-full"
                        style={{ width: `${progressoPct}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Painel Expandido com Todas as Parcelas e Ações em Lote / Individuais */}
                {isExpanded && (
                  <div className="border-t border-border bg-background/50 p-4 sm:p-5 space-y-4">
                    {/* Barra de Ações do Parcelamento */}
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 p-3.5 rounded-xl bg-card border border-border">
                      <div className="flex items-center flex-wrap gap-2">
                        {pendentes.length > 0 && (
                          <>
                            <button
                              type="button"
                              onClick={() => {
                                const allPendingIds = pendentes.map((l) => l.id)
                                const allSelected = allPendingIds.every((id) =>
                                  selectedIds.has(id)
                                )
                                if (allSelected) {
                                  setSelectedIds(new Set())
                                } else {
                                  setSelectedIds(new Set(allPendingIds))
                                }
                              }}
                              className="h-9 px-3 rounded-lg border border-border bg-background hover:bg-muted text-xs font-medium inline-flex items-center gap-1.5"
                            >
                              <CheckSquare className="h-3.5 w-3.5 text-primary" />
                              {pendentes.every((l) => selectedIds.has(l.id))
                                ? 'Desmarcar todas'
                                : `Selecionar todas pendentes (${pendentes.length})`}
                            </button>

                            {selectedInThisParc.length > 0 && (
                              <div className="flex items-center flex-wrap gap-2 pl-1">
                                <input
                                  type="date"
                                  value={bulkPayDate}
                                  onChange={(e) =>
                                    setBulkPayDate(e.target.value)
                                  }
                                  title="Data do pagamento das parcelas selecionadas"
                                  className="h-9 px-2.5 rounded-lg border border-input bg-background text-xs"
                                />
                                <button
                                  type="button"
                                  disabled={bulkPayMut.isPending}
                                  onClick={() =>
                                    bulkPayMut.mutate(
                                      selectedInThisParc.map((l) => l.id)
                                    )
                                  }
                                  className="h-9 px-3.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 transition inline-flex items-center gap-1.5 shadow-xs"
                                >
                                  <Check className="h-3.5 w-3.5 stroke-[2.5]" />
                                  Marcar {selectedInThisParc.length} como pagas (
                                  {formatCentsToBRL(valorSelecionadoCentavos)})
                                </button>
                              </div>
                            )}
                          </>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setConfirmDeleteParc(p)}
                        className="h-9 px-3 rounded-lg border border-destructive/30 text-destructive hover:bg-destructive hover:text-destructive-foreground text-xs font-semibold inline-flex items-center gap-1.5 self-start lg:self-auto transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        Excluir parcelamento inteiro
                      </button>
                    </div>

                    {/* Lista de todas as parcelas geradas */}
                    <div className="max-h-[460px] overflow-y-auto space-y-2 pr-1">
                      {parcelas.map((l) => {
                        const quitada = l.status === 'pago'
                        const atrasada = isOverdue(
                          l.status,
                          l.data_vencimento,
                          today
                        )
                        const isChecked = selectedIds.has(l.id)

                        return (
                          <div
                            key={l.id}
                            className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 transition ${
                              atrasada
                                ? 'bg-destructive/8 border-destructive/40'
                                : quitada
                                  ? 'bg-card/50 border-border opacity-80'
                                  : isChecked
                                    ? 'bg-primary/8 border-primary/50'
                                    : 'bg-card border-border'
                            }`}
                          >
                            <div className="flex items-center gap-3">
                              {!quitada ? (
                                <button
                                  type="button"
                                  onClick={() => toggleSelectParcela(l.id)}
                                  className="text-muted-foreground hover:text-primary"
                                  title="Selecionar parcela para quitar em lote"
                                >
                                  {isChecked ? (
                                    <CheckSquare className="h-4 w-4 text-primary" />
                                  ) : (
                                    <Square className="h-4 w-4" />
                                  )}
                                </button>
                              ) : (
                                <span className="h-4 w-4 inline-flex items-center justify-center text-emerald-500">
                                  <CheckCircle2 className="h-4 w-4" />
                                </span>
                              )}

                              <div>
                                <div className="flex items-center flex-wrap gap-2">
                                  <span className="text-xs font-bold px-2 py-0.5 rounded bg-primary/15 text-primary">
                                    Parcela {l.numero_parcela}/{p.total_parcelas}
                                  </span>
                                  <span className="text-xs font-medium text-foreground">
                                    Vencimento: {formatDateBR(l.data_vencimento)}
                                  </span>
                                  {atrasada ? (
                                    <span className="text-[11px] font-bold text-destructive">
                                      Atrasada
                                    </span>
                                  ) : quitada ? (
                                    <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                                      Paga em{' '}
                                      {formatDateBR(l.data_pagamento || today)}
                                    </span>
                                  ) : (
                                    <span className="text-[11px] text-amber-600 dark:text-amber-400">
                                      Pendente
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            <div className="flex items-center justify-between sm:justify-end gap-2 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/50">
                              <span
                                className={`text-sm font-bold mr-2 ${
                                  atrasada
                                    ? 'text-destructive'
                                    : 'text-foreground'
                                }`}
                              >
                                {formatCentsToBRL(
                                  quitada && l.valor_real_centavos !== null
                                    ? l.valor_real_centavos
                                    : l.valor_previsto_centavos
                                )}
                              </span>

                              {/* Ação 1: Editar valor desta parcela específica */}
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingValorParcela(l)
                                  setNovoValorStr(
                                    centsToDecimalInput(
                                      l.valor_previsto_centavos
                                    )
                                  )
                                }}
                                className="h-8 px-2.5 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-medium inline-flex items-center gap-1"
                                title="Editar o valor desta parcela específica"
                              >
                                <DollarSign className="h-3 w-3" />
                                Editar valor
                              </button>

                              {/* Ação 2: Adiar esta parcela */}
                              {!quitada && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPostponingParcela(l)
                                    setNovaDataVencimento(
                                      addMonthsClamped(l.data_vencimento, 1)
                                    )
                                  }}
                                  className="h-8 px-2.5 rounded-lg border border-border bg-background hover:bg-muted text-[11px] font-medium inline-flex items-center gap-1"
                                  title="Adiar vencimento desta parcela"
                                >
                                  <CalendarClock className="h-3 w-3" />
                                  Adiar
                                </button>
                              )}

                              {/* Ação 3: Pagar / Reabrir individual */}
                              {!quitada ? (
                                <button
                                  type="button"
                                  onClick={() => toggleSinglePaidMut.mutate(l)}
                                  className="h-8 px-2.5 rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white text-[11px] font-semibold transition"
                                >
                                  Pagar
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => toggleSinglePaidMut.mutate(l)}
                                  title="Reabrir parcela como pendente"
                                  className="h-8 px-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                                >
                                  <RotateCcw className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* Modal: Editar Valor de uma Parcela Específica */}
      {editingValorParcela && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-bold text-sm">
                Editar valor — Parcela {editingValorParcela.numero_parcela}
              </h3>
              <button
                onClick={() => setEditingValorParcela(null)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                editValorMut.mutate()
              }}
              className="p-5 space-y-4"
            >
              <div className="text-xs text-muted-foreground">
                Alterando apenas a parcela{' '}
                <strong className="text-foreground">
                  #{editingValorParcela.numero_parcela}
                </strong>{' '}
                de{' '}
                <strong className="text-foreground">
                  {editingValorParcela.descricao}
                </strong>{' '}
                (vencimento {formatDateBR(editingValorParcela.data_vencimento)}).
              </div>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Novo valor da parcela (R$)
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  autoFocus
                  value={novoValorStr}
                  onChange={(e) => setNovoValorStr(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm font-bold"
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingValorParcela(null)}
                  className="h-9 px-3.5 rounded-xl border border-border text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={editValorMut.isPending}
                  className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
                >
                  Salvar valor
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Adiar uma Parcela Específica */}
      {postponingParcela && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden">
            <div className="flex items-center justify-between px-5 py-4 border-b border-border">
              <h3 className="font-bold text-sm">
                Adiar Parcela {postponingParcela.numero_parcela}
              </h3>
              <button
                onClick={() => setPostponingParcela(null)}
                className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                postponeMut.mutate(novaDataVencimento)
              }}
              className="p-5 space-y-4"
            >
              <div className="text-xs text-muted-foreground">
                Vencimento atual:{' '}
                <strong className="text-foreground">
                  {formatDateBR(postponingParcela.data_vencimento)}
                </strong>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setNovaDataVencimento(
                      addMonthsClamped(postponingParcela.data_vencimento, 1)
                    )
                  }
                  className="flex-1 h-9 rounded-lg border border-border bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90"
                >
                  +1 mês ({formatDateBR(addMonthsClamped(postponingParcela.data_vencimento, 1))})
                </button>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Nova data de vencimento
                </label>
                <input
                  type="date"
                  required
                  value={novaDataVencimento}
                  onChange={(e) => setNovaDataVencimento(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm"
                />
              </div>

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPostponingParcela(null)}
                  className="h-9 px-3.5 rounded-xl border border-border text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={postponeMut.isPending}
                  className="h-9 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
                >
                  Confirmar adiamento
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Confirmação para Excluir Parcelamento Inteiro */}
      {confirmDeleteParc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
          <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-5 space-y-4">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-xl bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <h3 className="font-bold text-base">
                  Excluir parcelamento inteiro?
                </h3>
                <p className="text-xs text-muted-foreground">
                  Esta ação excluirá o parcelamento{' '}
                  <strong className="text-foreground">
                    "{confirmDeleteParc.descricao}"
                  </strong>{' '}
                  e todas as suas parcelas vinculadas em todos os meses. Esta
                  operação não pode ser desfeita.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteParc(null)}
                className="h-10 px-4 rounded-xl border border-border text-xs font-medium hover:bg-muted"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteParcMut.isPending}
                onClick={() => deleteParcMut.mutate(confirmDeleteParc.id)}
                className="h-10 px-4 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold hover:opacity-95"
              >
                {deleteParcMut.isPending
                  ? 'Excluindo...'
                  : 'Sim, excluir tudo'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
