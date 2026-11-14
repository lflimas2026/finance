import React, { useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowRight,
  ArrowUpCircle,
  BarChart3,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Plus,
  TrendingDown,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import { useAuth } from '../App'
import {
  type Categoria,
  type Lancamento,
  type Parcelamento,
  type StatusLancamento,
  fetchCategorias,
  fetchLancamentos,
  fetchParcelamentos,
  updateLancamento,
} from '../lib/supabase'
import {
  addDaysIso,
  formatCentsToBRL,
  formatDateBR,
  formatYearMonthLong,
  formatYearMonthShort,
  getCurrentYearMonthSaoPaulo,
  getDaysInMonth,
  getTodaySaoPaulo,
  isOverdue,
  shiftYearMonth,
} from '../lib/utils'

// ============================================================================
// 1. TELA PROJEÇÃO (A TELA MAIS IMPORTANTE DO APP)
// - Cartões fixos: "Preciso ter em conta neste mês: R$ X" e "Preciso ter no próximo mês: R$ Y"
// - Gráfico de barras com a evolução das despesas mensais (evidenciando queda quando parcelas acabam)
// - Tabela dos meses que tenham algum lançamento, de hoje em diante, com mês, receitas, despesas e saldo previsto (negativo em vermelho)
// - Clicar no mês abre a tela Mês daquele período
// ============================================================================
export function ProjecaoPage() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const currentYM = getCurrentYearMonthSaoPaulo()
  const nextYM = shiftYearMonth(currentYM, 1)

  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ['lancamentos', user?.id],
    queryFn: () => fetchLancamentos(user!.id),
    enabled: Boolean(user),
  })

  // Agrupamento mensal de hoje (currentYM) em diante para meses que tenham algum lançamento
  const mesesProjetados = useMemo(() => {
    const map = new Map<
      string,
      {
        ym: string
        receitasCentavos: number
        despesasCentavos: number
        despesasFaltaPagarCentavos: number
        despesasParcelasCentavos: number
        qtdLancamentos: number
        qtdParcelas: number
      }
    >()

    for (const l of lancamentos) {
      const ym = l.data_vencimento.slice(0, 7)
      if (ym < currentYM) continue

      const row = map.get(ym) || {
        ym,
        receitasCentavos: 0,
        despesasCentavos: 0,
        despesasFaltaPagarCentavos: 0,
        despesasParcelasCentavos: 0,
        qtdLancamentos: 0,
        qtdParcelas: 0,
      }

      row.qtdLancamentos += 1

      if (l.tipo === 'receita') {
        const val =
          l.status === 'recebido' && l.valor_real_centavos !== null
            ? l.valor_real_centavos
            : l.valor_previsto_centavos
        row.receitasCentavos += val
      } else {
        const val =
          l.status === 'pago' && l.valor_real_centavos !== null
            ? l.valor_real_centavos
            : l.valor_previsto_centavos
        row.despesasCentavos += val
        if (l.status === 'pendente') {
          row.despesasFaltaPagarCentavos += l.valor_previsto_centavos
        }
        if (l.origem === 'parcelamento') {
          row.despesasParcelasCentavos += val
          row.qtdParcelas += 1
        }
      }

      map.set(ym, row)
    }

    return Array.from(map.values())
      .sort((a, b) => a.ym.localeCompare(b.ym))
      .map((item) => ({
        ...item,
        saldoPrevistoCentavos: item.receitasCentavos - item.despesasCentavos,
      }))
  }, [lancamentos, currentYM])

  // Cálculo dos cartões fixos: "Preciso ter em conta neste mês" e "Preciso ter no próximo mês"
  const needThisMonth = useMemo(() => {
    let faltaPagarMesAtual = 0
    let totalDespesasMesAtual = 0
    let atrasadosAnteriores = 0

    for (const l of lancamentos) {
      if (l.tipo !== 'despesa') continue
      const ym = l.data_vencimento.slice(0, 7)
      if (ym === currentYM) {
        const val =
          l.status === 'pago' && l.valor_real_centavos !== null
            ? l.valor_real_centavos
            : l.valor_previsto_centavos
        totalDespesasMesAtual += val
        if (l.status === 'pendente') {
          faltaPagarMesAtual += l.valor_previsto_centavos
        }
      } else if (ym < currentYM && l.status === 'pendente') {
        atrasadosAnteriores += l.valor_previsto_centavos
      }
    }

    return {
      precisoTerEmConta: faltaPagarMesAtual + atrasadosAnteriores,
      faltaPagarMesAtual,
      totalDespesasMesAtual,
      atrasadosAnteriores,
    }
  }, [lancamentos, currentYM])

  const needNextMonth = useMemo(() => {
    let faltaPagarProximoMes = 0
    let totalDespesasProximoMes = 0

    for (const l of lancamentos) {
      if (l.tipo !== 'despesa') continue
      const ym = l.data_vencimento.slice(0, 7)
      if (ym === nextYM) {
        const val =
          l.status === 'pago' && l.valor_real_centavos !== null
            ? l.valor_real_centavos
            : l.valor_previsto_centavos
        totalDespesasProximoMes += val
        if (l.status === 'pendente') {
          faltaPagarProximoMes += l.valor_previsto_centavos
        }
      }
    }

    return {
      precisoTerProximoMes: faltaPagarProximoMes,
      totalDespesasProximoMes,
    }
  }, [lancamentos, nextYM])

  const maxDespesaGrafico = useMemo(() => {
    let max = 0
    for (const m of mesesProjetados) {
      if (m.despesasCentavos > max) max = m.despesasCentavos
    }
    return Math.max(max, 100)
  }, [mesesProjetados])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">
          Projeção Financeira
        </h1>
        <p className="text-sm text-muted-foreground">
          Saiba exatamente quanto precisa ter em conta em cada mês e acompanhe a
          queda das despesas conforme parcelamentos terminam
        </p>
      </div>

      {/* Cartões Fixos Obrigatórios em Destaque */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div
          onClick={() => navigate(`/mes?ym=${currentYM}`)}
          className="cursor-pointer p-5 rounded-2xl bg-primary text-primary-foreground shadow-lg hover:opacity-95 transition space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider opacity-90">
            <span>Mês Atual ({formatYearMonthLong(currentYM)})</span>
            <Wallet className="h-5 w-5" />
          </div>
          <div className="text-xs opacity-90">
            Preciso ter em conta neste mês:
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight">
            {formatCentsToBRL(needThisMonth.precisoTerEmConta)}
          </div>
          <div className="text-xs opacity-85 flex items-center flex-wrap gap-x-3 gap-y-1 pt-1 border-t border-primary-foreground/20">
            <span>
              Total de despesas do mês:{' '}
              <strong>
                {formatCentsToBRL(needThisMonth.totalDespesasMesAtual)}
              </strong>
            </span>
            {needThisMonth.atrasadosAnteriores > 0 && (
              <span>
                • Inclui{' '}
                <strong>
                  {formatCentsToBRL(needThisMonth.atrasadosAnteriores)}
                </strong>{' '}
                em atrasados anteriores
              </span>
            )}
          </div>
        </div>

        <div
          onClick={() => navigate(`/mes?ym=${nextYM}`)}
          className="cursor-pointer p-5 rounded-2xl bg-card border-2 border-primary/30 shadow-sm hover:border-primary transition space-y-2"
        >
          <div className="flex items-center justify-between text-xs font-semibold uppercase tracking-wider text-primary">
            <span>Próximo Mês ({formatYearMonthLong(nextYM)})</span>
            <TrendingUp className="h-5 w-5" />
          </div>
          <div className="text-xs text-muted-foreground">
            Preciso ter no próximo mês:
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {formatCentsToBRL(needNextMonth.precisoTerProximoMes)}
          </div>
          <div className="text-xs text-muted-foreground pt-1 border-t border-border">
            Total de despesas previstas para {formatYearMonthShort(nextYM)}:{' '}
            <strong className="text-foreground">
              {formatCentsToBRL(needNextMonth.totalDespesasProximoMes)}
            </strong>
          </div>
        </div>
      </div>

      {isLoading ? (
        <div className="p-10 rounded-2xl bg-card border border-border text-center text-sm text-muted-foreground">
          Calculando projeção mensal...
        </div>
      ) : mesesProjetados.length === 0 ? (
        <div className="p-10 rounded-2xl bg-card border border-border text-center space-y-3">
          <BarChart3 className="h-10 w-10 text-muted-foreground mx-auto" />
          <h3 className="font-semibold text-base">
            Nenhum lançamento futuro encontrado
          </h3>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Cadastre despesas, receitas, parcelamentos ou recorrências para
            visualizar a projeção completa mês a mês.
          </p>
        </div>
      ) : (
        <>
          {/* Gráfico de Barras com a Evolução das Despesas Mensais */}
          <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="font-bold text-base flex items-center gap-2">
                  <BarChart3 className="h-4 w-4 text-primary" />
                  Evolução das Despesas Mensais
                </h2>
                <p className="text-xs text-muted-foreground">
                  Veja em qual mês suas despesas caem conforme os parcelamentos
                  terminam (clique em uma barra para abrir o mês)
                </p>
              </div>
              <div className="flex items-center gap-4 text-xs">
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-xs bg-primary inline-block" />
                  Parcelamentos
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="h-3 w-3 rounded-xs bg-rose-500/75 inline-block" />
                  Fixas / Avulsas
                </span>
              </div>
            </div>

            <div className="overflow-x-auto pb-2">
              <div
                className="flex items-end gap-2.5 min-h-[230px] pt-8 px-1"
                style={{
                  minWidth: `${Math.max(100, mesesProjetados.length * 68)}px`,
                }}
              >
                {mesesProjetados.map((m) => {
                  const totalPct = Math.max(
                    4,
                    Math.round((m.despesasCentavos / maxDespesaGrafico) * 160)
                  )
                  const parcelasRatio =
                    m.despesasCentavos > 0
                      ? m.despesasParcelasCentavos / m.despesasCentavos
                      : 0
                  const parcelasHeight = Math.round(totalPct * parcelasRatio)
                  const outrasHeight = Math.max(0, totalPct - parcelasHeight)

                  return (
                    <button
                      key={m.ym}
                      type="button"
                      onClick={() => navigate(`/mes?ym=${m.ym}`)}
                      title={`${formatYearMonthLong(m.ym)}\nDespesas totais: ${formatCentsToBRL(m.despesasCentavos)}\nParcelas: ${formatCentsToBRL(m.despesasParcelasCentavos)}\nClique para abrir o mês`}
                      className="flex-1 min-w-[56px] group flex flex-col items-center justify-end gap-1.5 focus:outline-none"
                    >
                      <span className="text-[10px] font-bold text-muted-foreground group-hover:text-foreground transition whitespace-nowrap">
                        {formatCentsToBRL(m.despesasCentavos).replace(
                          ',00',
                          ''
                        )}
                      </span>

                      <div className="w-full max-w-[42px] flex flex-col justify-end rounded-t-lg overflow-hidden border border-border/50 group-hover:scale-105 transition">
                        {outrasHeight > 0 && (
                          <div
                            className="w-full bg-rose-500/75 transition-all"
                            style={{ height: `${outrasHeight}px` }}
                          />
                        )}
                        {parcelasHeight > 0 && (
                          <div
                            className="w-full bg-primary transition-all"
                            style={{ height: `${parcelasHeight}px` }}
                          />
                        )}
                        {m.despesasCentavos === 0 && (
                          <div className="w-full h-1 bg-muted" />
                        )}
                      </div>

                      <span
                        className={`text-[11px] font-semibold capitalize ${
                          m.ym === currentYM
                            ? 'text-primary font-bold'
                            : 'text-muted-foreground group-hover:text-foreground'
                        }`}
                      >
                        {formatYearMonthShort(m.ym)}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Tabela dos Meses de Hoje em Diante */}
          <div className="rounded-2xl bg-card border border-border overflow-hidden shadow-xs">
            <div className="px-5 py-4 border-b border-border flex items-center justify-between">
              <div>
                <h2 className="font-bold text-base">
                  Tabela Mensal de Projeção ({mesesProjetados.length} meses com
                  lançamentos)
                </h2>
                <p className="text-xs text-muted-foreground">
                  Clique em qualquer linha para abrir a tela Mês correspondente
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-border bg-muted/40 text-xs font-semibold text-muted-foreground">
                    <th className="py-3.5 px-4">Mês / Ano</th>
                    <th className="py-3.5 px-4 text-right">
                      Total de Receitas
                    </th>
                    <th className="py-3.5 px-4 text-right">
                      Total de Despesas
                    </th>
                    <th className="py-3.5 px-4 text-right">
                      Falta Pagar no Mês
                    </th>
                    <th className="py-3.5 px-4 text-right">Saldo Previsto</th>
                    <th className="py-3.5 px-4 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border text-sm">
                  {mesesProjetados.map((m, idx) => {
                    const prev = idx > 0 ? mesesProjetados[idx - 1] : null
                    const quedaDespesa =
                      prev && prev.despesasCentavos > m.despesasCentavos
                        ? prev.despesasCentavos - m.despesasCentavos
                        : 0

                    return (
                      <tr
                        key={m.ym}
                        onClick={() => navigate(`/mes?ym=${m.ym}`)}
                        className="cursor-pointer hover:bg-muted/50 transition"
                      >
                        <td className="py-3.5 px-4">
                          <div className="flex items-center flex-wrap gap-2">
                            <span className="font-bold capitalize text-foreground">
                              {formatYearMonthLong(m.ym)}
                            </span>
                            {m.ym === currentYM && (
                              <span className="px-2 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-bold">
                                Mês atual
                              </span>
                            )}
                            {m.ym === nextYM && (
                              <span className="px-2 py-0.5 rounded bg-secondary text-secondary-foreground text-[10px] font-semibold">
                                Próximo mês
                              </span>
                            )}
                            {quedaDespesa > 0 && (
                              <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-bold">
                                <TrendingDown className="h-3 w-3" />-
                                {formatCentsToBRL(quedaDespesa)} nas despesas
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            {m.qtdLancamentos} lançamento(s)
                            {m.qtdParcelas > 0 &&
                              ` • ${m.qtdParcelas} parcela(s)`}
                          </div>
                        </td>

                        <td className="py-3.5 px-4 text-right font-semibold text-emerald-600 dark:text-emerald-400 whitespace-nowrap">
                          {formatCentsToBRL(m.receitasCentavos)}
                        </td>

                        <td className="py-3.5 px-4 text-right font-bold text-foreground whitespace-nowrap">
                          {formatCentsToBRL(m.despesasCentavos)}
                        </td>

                        <td className="py-3.5 px-4 text-right font-semibold text-amber-600 dark:text-amber-400 whitespace-nowrap">
                          {formatCentsToBRL(m.despesasFaltaPagarCentavos)}
                        </td>

                        <td className="py-3.5 px-4 text-right whitespace-nowrap">
                          <span
                            className={`inline-block px-2.5 py-1 rounded-lg font-extrabold ${
                              m.saldoPrevistoCentavos < 0
                                ? 'bg-destructive/15 text-destructive'
                                : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            }`}
                          >
                            {formatCentsToBRL(m.saldoPrevistoCentavos)}
                          </span>
                        </td>

                        <td className="py-3.5 px-4 text-right text-muted-foreground">
                          <ArrowRight className="h-4 w-4 inline" />
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

// ============================================================================
// 2. TELA DASHBOARD (TELA INICIAL)
// - Resumo do mês atual (total a pagar, já pago, falta pagar, receitas previstas, saldo previsto)
// - Listas "Vencendo nos próximos 7 dias" e "Atrasados" com o total de cada
// - Próximas parcelas a vencer com numeração (ex: "Notebook, parcela 14/36, R$ 289, vence dia 20")
// - Atalho para a Projeção
// ============================================================================
export function DashboardPage() {
  const { user } = useAuth()
  const qc = useQueryClient()
  const today = getTodaySaoPaulo()
  const currentYM = getCurrentYearMonthSaoPaulo()
  const in7Days = addDaysIso(today, 7)

  const { data: lancamentos = [], isLoading } = useQuery({
    queryKey: ['lancamentos', user?.id],
    queryFn: () => fetchLancamentos(user!.id),
    enabled: Boolean(user),
  })

  const { data: parcelamentos = [] } = useQuery({
    queryKey: ['parcelamentos', user?.id],
    queryFn: () => fetchParcelamentos(user!.id),
    enabled: Boolean(user),
  })

  const parcelamentosMap = useMemo(() => {
    const map = new Map<string, Parcelamento>()
    for (const p of parcelamentos) map.set(p.id, p)
    return map
  }, [parcelamentos])

  // Resumo do mês atual
  const resumoAtual = useMemo(() => {
    let totalAPagar = 0
    let jaPago = 0
    let faltaPagar = 0
    let receitasPrevistas = 0

    for (const l of lancamentos) {
      if (l.data_vencimento.slice(0, 7) !== currentYM) continue
      if (l.tipo === 'receita') {
        const val =
          l.status === 'recebido' && l.valor_real_centavos !== null
            ? l.valor_real_centavos
            : l.valor_previsto_centavos
        receitasPrevistas += val
      } else {
        const valEfetivo =
          l.status === 'pago' && l.valor_real_centavos !== null
            ? l.valor_real_centavos
            : l.valor_previsto_centavos
        totalAPagar += valEfetivo
        if (l.status === 'pago') {
          jaPago += valEfetivo
        } else {
          faltaPagar += l.valor_previsto_centavos
        }
      }
    }

    return {
      totalAPagar,
      jaPago,
      faltaPagar,
      receitasPrevistas,
      saldoPrevisto: receitasPrevistas - totalAPagar,
    }
  }, [lancamentos, currentYM])

  // Lista de Atrasados (pendentes com data_vencimento < hoje)
  const atrasados = useMemo(() => {
    const items = lancamentos.filter((l) =>
      isOverdue(l.status, l.data_vencimento, today)
    )
    const totalCentavos = items.reduce(
      (acc, l) => acc + l.valor_previsto_centavos,
      0
    )
    return { items, totalCentavos }
  }, [lancamentos, today])

  // Lista Vencendo nos próximos 7 dias (pendentes com hoje <= data_vencimento <= hoje + 7 dias)
  const proximos7Dias = useMemo(() => {
    const items = lancamentos.filter(
      (l) =>
        l.status === 'pendente' &&
        l.data_vencimento >= today &&
        l.data_vencimento <= in7Days
    )
    const totalCentavos = items.reduce(
      (acc, l) => acc + l.valor_previsto_centavos,
      0
    )
    return { items, totalCentavos }
  }, [lancamentos, today, in7Days])

  // Próximas parcelas a vencer com numeração (ex: "Notebook, parcela 14/36, R$ 289, vence dia 20")
  const proximasParcelas = useMemo(() => {
    return lancamentos
      .filter(
        (l) =>
          l.origem === 'parcelamento' &&
          l.status === 'pendente' &&
          l.data_vencimento >= today
      )
      .slice(0, 8)
  }, [lancamentos, today])

  const quickPayMut = useMutation({
    mutationFn: async (l: Lancamento) => {
      const novoStatus: StatusLancamento =
        l.tipo === 'receita' ? 'recebido' : 'pago'
      await updateLancamento(user!.id, l.id, {
        status: novoStatus,
        data_pagamento: today,
        valor_real_centavos: l.valor_real_centavos ?? l.valor_previsto_centavos,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
    },
  })

  return (
    <div className="space-y-6">
      {/* Topo com Atalho em Destaque para a Projeção */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight capitalize">
            Visão Geral — {formatYearMonthLong(currentYM)}
          </h1>
          <p className="text-sm text-muted-foreground">
            Resumo do mês atual, alertas de vencimento e próximas parcelas
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            to={`/mes?ym=${currentYM}`}
            className="h-10 px-3.5 rounded-xl border border-border bg-card hover:bg-muted text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Wallet className="h-4 w-4" />
            Abrir Mês Atual
          </Link>
          <Link
            to="/projecao"
            className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5 shadow-sm hover:opacity-95"
          >
            <TrendingUp className="h-4 w-4" />
            Ver Projeção Futura
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* 5 Cartões de Resumo do Mês Atual */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Total a pagar</span>
            <ArrowDownCircle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-foreground">
            {formatCentsToBRL(resumoAtual.totalAPagar)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Já pago</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCentsToBRL(resumoAtual.jaPago)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Falta pagar</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-lg sm:text-xl font-extrabold text-amber-600 dark:text-amber-400">
            {formatCentsToBRL(resumoAtual.faltaPagar)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Receitas previstas</span>
            <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCentsToBRL(resumoAtual.receitasPrevistas)}
          </div>
        </div>

        <div
          className={`col-span-2 sm:col-span-1 p-4 rounded-2xl border space-y-1 ${
            resumoAtual.saldoPrevisto >= 0
              ? 'bg-emerald-500/10 border-emerald-500/30'
              : 'bg-destructive/10 border-destructive/30'
          }`}
        >
          <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
            <span>Saldo previsto</span>
            <Wallet className="h-4 w-4" />
          </div>
          <div
            className={`text-lg sm:text-xl font-extrabold ${
              resumoAtual.saldoPrevisto >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-destructive'
            }`}
          >
            {formatCentsToBRL(resumoAtual.saldoPrevisto)}
          </div>
        </div>
      </div>

      {/* Duas Colunas: "Atrasados" e "Vencendo nos próximos 7 dias" com o total de cada */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Lista Atrasados */}
        <div
          className={`p-5 rounded-2xl border space-y-3 ${
            atrasados.items.length > 0
              ? 'bg-destructive/5 border-destructive/40'
              : 'bg-card border-border'
          }`}
        >
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle
                className={`h-5 w-5 ${
                  atrasados.items.length > 0
                    ? 'text-destructive'
                    : 'text-muted-foreground'
                }`}
              />
              <div>
                <h2 className="font-bold text-base">
                  Atrasados ({atrasados.items.length})
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  Lançamentos pendentes com vencimento anterior a hoje
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-muted-foreground block">
                Total atrasado
              </span>
              <strong
                className={`text-base font-extrabold ${
                  atrasados.totalCentavos > 0
                    ? 'text-destructive'
                    : 'text-emerald-600 dark:text-emerald-400'
                }`}
              >
                {formatCentsToBRL(atrasados.totalCentavos)}
              </strong>
            </div>
          </div>

          {isLoading ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Carregando...
            </div>
          ) : atrasados.items.length === 0 ? (
            <div className="py-6 text-center text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              Excelente! Você não possui nenhum débito em atraso.
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {atrasados.items.map((l) => {
                const parc = l.parcelamento_id
                  ? parcelamentosMap.get(l.parcelamento_id)
                  : undefined
                return (
                  <div
                    key={l.id}
                    className="p-3 rounded-xl bg-card border border-destructive/30 flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-xs sm:text-sm text-destructive truncate">
                          {l.descricao}
                        </span>
                        {l.origem === 'parcelamento' && l.numero_parcela && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                            parcela {l.numero_parcela}/
                            {parc ? parc.total_parcelas : '?'}
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Venceu em {formatDateBR(l.data_vencimento)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <strong className="text-xs sm:text-sm font-extrabold text-destructive">
                        {formatCentsToBRL(l.valor_previsto_centavos)}
                      </strong>
                      <button
                        type="button"
                        onClick={() => quickPayMut.mutate(l)}
                        className="h-8 px-2.5 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-500 inline-flex items-center gap-1"
                      >
                        <Check className="h-3.5 w-3.5" />
                        {l.tipo === 'receita' ? 'Receber' : 'Pagar'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* Lista Vencendo nos Próximos 7 Dias */}
        <div className="p-5 rounded-2xl bg-card border border-border space-y-3">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-5 w-5 text-amber-500" />
              <div>
                <h2 className="font-bold text-base">
                  Vencendo nos próximos 7 dias ({proximos7Dias.items.length})
                </h2>
                <p className="text-[11px] text-muted-foreground">
                  De {formatDateBR(today)} até {formatDateBR(in7Days)}
                </p>
              </div>
            </div>
            <div className="text-right">
              <span className="text-[11px] text-muted-foreground block">
                Total 7 dias
              </span>
              <strong className="text-base font-extrabold text-amber-600 dark:text-amber-400">
                {formatCentsToBRL(proximos7Dias.totalCentavos)}
              </strong>
            </div>
          </div>

          {isLoading ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Carregando...
            </div>
          ) : proximos7Dias.items.length === 0 ? (
            <div className="py-6 text-center text-xs text-muted-foreground">
              Nenhum vencimento pendente para os próximos 7 dias.
            </div>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {proximos7Dias.items.map((l) => {
                const parc = l.parcelamento_id
                  ? parcelamentosMap.get(l.parcelamento_id)
                  : undefined
                const isToday = l.data_vencimento === today
                return (
                  <div
                    key={l.id}
                    className="p-3 rounded-xl bg-background border border-border flex items-center justify-between gap-2"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-xs sm:text-sm truncate">
                          {l.descricao}
                        </span>
                        {l.origem === 'parcelamento' && l.numero_parcela && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary/15 text-primary">
                            parcela {l.numero_parcela}/
                            {parc ? parc.total_parcelas : '?'}
                          </span>
                        )}
                        {isToday && (
                          <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-500 text-white">
                            Vence hoje
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        Vence em {formatDateBR(l.data_vencimento)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <strong className="text-xs sm:text-sm font-bold">
                        {formatCentsToBRL(l.valor_previsto_centavos)}
                      </strong>
                      <button
                        type="button"
                        onClick={() => quickPayMut.mutate(l)}
                        className="h-8 px-2.5 rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white text-xs font-semibold transition"
                      >
                        {l.tipo === 'receita' ? 'Receber' : 'Pagar'}
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      {/* Próximas Parcelas a Vencer com Numeração */}
      <div className="p-5 rounded-2xl bg-card border border-border space-y-3">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <CreditCard className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-bold text-base">
                Próximas parcelas a vencer
              </h2>
              <p className="text-xs text-muted-foreground">
                Acompanhamento rápido das próximas parcelas numeradas
              </p>
            </div>
          </div>
          <Link
            to="/parcelamentos"
            className="text-xs font-semibold text-primary hover:underline inline-flex items-center gap-1"
          >
            Ver todos os parcelamentos
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        {proximasParcelas.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Nenhuma parcela pendente a vencer.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {proximasParcelas.map((l) => {
              const parc = l.parcelamento_id
                ? parcelamentosMap.get(l.parcelamento_id)
                : undefined
              const dia = Number(l.data_vencimento.slice(8, 10))
              const totalParc = parc ? parc.total_parcelas : '?'
              return (
                <div
                  key={l.id}
                  className="p-3.5 rounded-xl bg-background border border-border flex items-center justify-between gap-3"
                >
                  <div className="text-xs sm:text-sm">
                    <strong className="font-bold text-foreground">
                      {l.descricao}
                    </strong>
                    ,{' '}
                    <span className="font-semibold text-primary">
                      parcela {l.numero_parcela}/{totalParc}
                    </span>
                    ,{' '}
                    <strong className="font-bold text-foreground">
                      {formatCentsToBRL(l.valor_previsto_centavos)}
                    </strong>
                    ,{' '}
                    <span className="text-muted-foreground">
                      vence dia {dia} ({formatDateBR(l.data_vencimento)})
                    </span>
                  </div>

                  <button
                    type="button"
                    onClick={() => quickPayMut.mutate(l)}
                    className="h-8 px-2.5 rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white text-xs font-semibold shrink-0 transition"
                  >
                    Pagar
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// 3. TELA CALENDÁRIO
// - Visão mensal com vencimentos por dia (cores para pago, pendente e atrasado)
// - Total de despesas do dia
// - Clicar no dia lista os lançamentos daquele dia
// ============================================================================
const WEEKDAYS_PT = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

export function CalendarioPage({
  onOpenNewModal,
}: {
  onOpenNewModal: (ym: string) => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const today = getTodaySaoPaulo()
  const currentYM = getCurrentYearMonthSaoPaulo()

  const [selectedYM, setSelectedYM] = useState<string>(currentYM)
  const [selectedDate, setSelectedDate] = useState<string>(today)

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias', user?.id],
    queryFn: () => fetchCategorias(user!.id),
    enabled: Boolean(user),
  })

  const { data: lancamentos = [] } = useQuery({
    queryKey: ['lancamentos', user?.id],
    queryFn: () => fetchLancamentos(user!.id),
    enabled: Boolean(user),
  })

  const { data: parcelamentos = [] } = useQuery({
    queryKey: ['parcelamentos', user?.id],
    queryFn: () => fetchParcelamentos(user!.id),
    enabled: Boolean(user),
  })

  const categoriasMap = useMemo(() => {
    const map = new Map<string, Categoria>()
    for (const c of categorias) map.set(c.id, c)
    return map
  }, [categorias])

  const parcelamentosMap = useMemo(() => {
    const map = new Map<string, Parcelamento>()
    for (const p of parcelamentos) map.set(p.id, p)
    return map
  }, [parcelamentos])

  // Agrupa lançamentos por data (YYYY-MM-DD) no mês selecionado
  const byDateMap = useMemo(() => {
    const map = new Map<
      string,
      {
        items: Lancamento[]
        totalDespesasCentavos: number
        hasOverdue: boolean
        hasPending: boolean
        hasPaid: boolean
      }
    >()

    for (const l of lancamentos) {
      if (l.data_vencimento.slice(0, 7) !== selectedYM) continue
      const dt = l.data_vencimento
      const entry = map.get(dt) || {
        items: [],
        totalDespesasCentavos: 0,
        hasOverdue: false,
        hasPending: false,
        hasPaid: false,
      }
      entry.items.push(l)
      if (l.tipo === 'despesa') {
        const val =
          l.status === 'pago' && l.valor_real_centavos !== null
            ? l.valor_real_centavos
            : l.valor_previsto_centavos
        entry.totalDespesasCentavos += val
      }
      if (isOverdue(l.status, l.data_vencimento, today)) {
        entry.hasOverdue = true
      } else if (l.status === 'pendente') {
        entry.hasPending = true
      } else {
        entry.hasPaid = true
      }
      map.set(dt, entry)
    }

    return map
  }, [lancamentos, selectedYM, today])

  // Construção dos dias da grade mensal
  const calendarCells = useMemo(() => {
    const [yStr, mStr] = selectedYM.split('-')
    const year = Number(yStr)
    const month1 = Number(mStr)
    const daysInMonth = getDaysInMonth(year, month1)
    const firstWeekday = new Date(Date.UTC(year, month1 - 1, 1)).getUTCDay() // 0 (Dom) .. 6 (Sáb)

    const cells: Array<{ day: number | null; isoDate: string | null }> = []
    for (let i = 0; i < firstWeekday; i++) {
      cells.push({ day: null, isoDate: null })
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const iso = `${yStr}-${mStr}-${String(d).padStart(2, '0')}`
      cells.push({ day: d, isoDate: iso })
    }
    return cells
  }, [selectedYM])

  const lancamentosDoDiaSelecionado = useMemo(() => {
    return lancamentos.filter((l) => l.data_vencimento === selectedDate)
  }, [lancamentos, selectedDate])

  const quickToggleMut = useMutation({
    mutationFn: async (l: Lancamento) => {
      if (l.status === 'pendente') {
        const novoStatus: StatusLancamento =
          l.tipo === 'receita' ? 'recebido' : 'pago'
        await updateLancamento(user!.id, l.id, {
          status: novoStatus,
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

  const handleChangeMonth = (newYM: string) => {
    setSelectedYM(newYM)
    if (newYM === currentYM) {
      setSelectedDate(today)
    } else {
      setSelectedDate(`${newYM}-01`)
    }
  }

  return (
    <div className="space-y-6">
      {/* Cabeçalho do Calendário */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-card border border-border rounded-2xl p-4 sm:p-5">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => handleChangeMonth(shiftYearMonth(selectedYM, -1))}
            className="h-10 w-10 rounded-xl border border-border flex items-center justify-center hover:bg-muted"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <div className="px-2">
            <h1 className="text-lg sm:text-xl font-bold capitalize">
              Calendário — {formatYearMonthLong(selectedYM)}
            </h1>
            <p className="text-xs text-muted-foreground">
              Toque em qualquer dia para listar os vencimentos daquela data
            </p>
          </div>
          <button
            type="button"
            onClick={() => handleChangeMonth(shiftYearMonth(selectedYM, 1))}
            className="h-10 w-10 rounded-xl border border-border flex items-center justify-center hover:bg-muted"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        {/* Legenda de Cores */}
        <div className="flex items-center flex-wrap gap-3 text-xs">
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
            Pago / Recebido
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-amber-500" />
            Pendente
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-destructive" />
            Atrasado
          </span>
          {selectedYM !== currentYM && (
            <button
              type="button"
              onClick={() => handleChangeMonth(currentYM)}
              className="h-8 px-3 rounded-lg bg-secondary text-secondary-foreground font-semibold"
            >
              Ir para Hoje
            </button>
          )}
        </div>
      </div>

      {/* Grade Mensal do Calendário */}
      <div className="bg-card border border-border rounded-2xl p-3 sm:p-5 space-y-2">
        <div className="grid grid-cols-7 gap-1 sm:gap-2 text-center text-xs font-bold text-muted-foreground pb-1">
          {WEEKDAYS_PT.map((w) => (
            <div key={w} className="py-1">
              {w}
            </div>
          ))}
        </div>

        <div className="grid grid-cols-7 gap-1 sm:gap-2">
          {calendarCells.map((cell, i) => {
            if (!cell.day || !cell.isoDate) {
              return (
                <div
                  key={`empty-${i}`}
                  className="min-h-[68px] sm:min-h-[88px] rounded-xl bg-muted/20 border border-transparent"
                />
              )
            }

            const info = byDateMap.get(cell.isoDate)
            const isSelected = cell.isoDate === selectedDate
            const isToday = cell.isoDate === today

            return (
              <button
                key={cell.isoDate}
                type="button"
                onClick={() => setSelectedDate(cell.isoDate!)}
                className={`min-h-[68px] sm:min-h-[88px] p-1.5 sm:p-2.5 rounded-xl border text-left flex flex-col justify-between transition ${
                  isSelected
                    ? 'border-primary ring-2 ring-primary/30 bg-primary/8'
                    : info?.hasOverdue
                      ? 'border-destructive/50 bg-destructive/5 hover:bg-destructive/10'
                      : 'border-border bg-background/60 hover:bg-muted/50'
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span
                    className={`text-xs sm:text-sm font-bold h-6 w-6 rounded-lg flex items-center justify-center ${
                      isToday
                        ? 'bg-primary text-primary-foreground'
                        : 'text-foreground'
                    }`}
                  >
                    {cell.day}
                  </span>

                  {/* Bolinhas de status do dia (atrasado, pendente, pago) */}
                  {info && (
                    <div className="flex items-center gap-1">
                      {info.hasOverdue && (
                        <span
                          className="h-2 w-2 rounded-full bg-destructive"
                          title="Há lançamentos atrasados neste dia"
                        />
                      )}
                      {info.hasPending && (
                        <span
                          className="h-2 w-2 rounded-full bg-amber-500"
                          title="Há lançamentos pendentes neste dia"
                        />
                      )}
                      {info.hasPaid && (
                        <span
                          className="h-2 w-2 rounded-full bg-emerald-500"
                          title="Há lançamentos pagos/recebidos neste dia"
                        />
                      )}
                    </div>
                  )}
                </div>

                {/* Total de despesas do dia */}
                {info && info.totalDespesasCentavos > 0 ? (
                  <div className="w-full pt-1">
                    <div
                      className={`text-[10px] sm:text-xs font-extrabold truncate ${
                        info.hasOverdue
                          ? 'text-destructive'
                          : info.hasPending
                            ? 'text-amber-600 dark:text-amber-400'
                            : 'text-emerald-600 dark:text-emerald-400'
                      }`}
                    >
                      {formatCentsToBRL(info.totalDespesasCentavos).replace(
                        ',00',
                        ''
                      )}
                    </div>
                    <div className="hidden sm:block text-[10px] text-muted-foreground">
                      {info.items.length}{' '}
                      {info.items.length === 1 ? 'item' : 'itens'}
                    </div>
                  </div>
                ) : info && info.items.length > 0 ? (
                  <div className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold truncate">
                    +{info.items.length} receita(s)
                  </div>
                ) : (
                  <div />
                )}
              </button>
            )
          })}
        </div>
      </div>

      {/* Lista de Lançamentos do Dia Selecionado */}
      <div className="p-5 rounded-2xl bg-card border border-border space-y-4">
        <div className="flex items-center justify-between border-b border-border pb-3">
          <div className="flex items-center gap-2">
            <CalendarIcon className="h-5 w-5 text-primary" />
            <div>
              <h2 className="font-bold text-base">
                Lançamentos do dia {formatDateBR(selectedDate)}
              </h2>
              <p className="text-xs text-muted-foreground">
                {lancamentosDoDiaSelecionado.length}{' '}
                {lancamentosDoDiaSelecionado.length === 1
                  ? 'lançamento nesta data'
                  : 'lançamentos nesta data'}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onOpenNewModal(selectedYM)}
            className="h-9 px-3 rounded-xl bg-primary text-primary-foreground text-xs font-semibold inline-flex items-center gap-1.5"
          >
            <Plus className="h-3.5 w-3.5" />
            Novo no mês
          </button>
        </div>

        {lancamentosDoDiaSelecionado.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Nenhum lançamento com vencimento em {formatDateBR(selectedDate)}.
          </div>
        ) : (
          <div className="space-y-2">
            {lancamentosDoDiaSelecionado.map((l) => {
              const cat = l.categoria_id
                ? categoriasMap.get(l.categoria_id)
                : undefined
              const parc = l.parcelamento_id
                ? parcelamentosMap.get(l.parcelamento_id)
                : undefined
              const atrasado = isOverdue(l.status, l.data_vencimento, today)
              const quitado = l.status === 'pago' || l.status === 'recebido'
              const valorExibido =
                quitado && l.valor_real_centavos !== null
                  ? l.valor_real_centavos
                  : l.valor_previsto_centavos

              return (
                <div
                  key={l.id}
                  className={`p-3.5 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    atrasado
                      ? 'bg-destructive/8 border-destructive/40'
                      : quitado
                        ? 'bg-background/60 border-border opacity-85'
                        : 'bg-background border-border'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => quickToggleMut.mutate(l)}
                      className={`h-8 w-8 rounded-lg flex items-center justify-center border transition ${
                        quitado
                          ? 'bg-emerald-600 border-emerald-600 text-white'
                          : atrasado
                            ? 'border-destructive text-destructive'
                            : 'border-input bg-card text-muted-foreground'
                      }`}
                    >
                      <Check className="h-4 w-4" />
                    </button>

                    <div>
                      <div className="flex items-center flex-wrap gap-2">
                        <span className="font-bold text-sm">{l.descricao}</span>
                        {l.origem === 'parcelamento' && l.numero_parcela && (
                          <span className="px-2 py-0.5 rounded bg-primary/15 text-primary text-[10px] font-bold">
                            parcela {l.numero_parcela}/
                            {parc ? parc.total_parcelas : '?'}
                          </span>
                        )}
                        {cat && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border border-border bg-card">
                            <span
                              className="h-2 w-2 rounded-full"
                              style={{ backgroundColor: cat.cor }}
                            />
                            {cat.nome}
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {atrasado ? (
                          <span className="text-destructive font-bold">
                            Atrasado
                          </span>
                        ) : quitado ? (
                          <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                            {l.tipo === 'receita' ? 'Recebido' : 'Pago'} em{' '}
                            {formatDateBR(l.data_pagamento || today)}
                          </span>
                        ) : (
                          <span className="text-amber-600 dark:text-amber-400 font-medium">
                            Pendente
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between sm:justify-end gap-3">
                    <strong
                      className={`text-sm sm:text-base font-extrabold ${
                        l.tipo === 'receita'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : atrasado
                            ? 'text-destructive'
                            : 'text-foreground'
                      }`}
                    >
                      {l.tipo === 'receita' ? '+ ' : '- '}
                      {formatCentsToBRL(valorExibido)}
                    </strong>

                    <button
                      type="button"
                      onClick={() => quickToggleMut.mutate(l)}
                      className="h-8 px-3 rounded-lg bg-secondary text-secondary-foreground text-xs font-semibold hover:opacity-90"
                    >
                      {quitado
                        ? 'Reabrir'
                        : l.tipo === 'receita'
                          ? 'Receber'
                          : 'Pagar'}
                    </button>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
