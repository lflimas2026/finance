import React, { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowDownCircle,
  ArrowUpCircle,
  Calendar as CalendarIcon,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  CreditCard,
  Filter,
  Pencil,
  Plus,
  Repeat,
  RotateCcw,
  Trash2,
  Wallet,
  X,
} from 'lucide-react'
import { useAuth } from '../App'
import {
  type Categoria,
  type Lancamento,
  type Parcelamento,
  type StatusLancamento,
  type TipoLancamento,
  createLancamentoAvulso,
  createParcelamentoComParcelas,
  createRecorrencia,
  deleteLancamentoComEscopo,
  fetchCategorias,
  fetchLancamentos,
  fetchParcelamentos,
  updateLancamento,
} from '../lib/supabase'
import {
  centsToDecimalInput,
  formatCentsToBRL,
  formatDateBR,
  formatYearMonthLong,
  getCurrentYearMonthSaoPaulo,
  getTodaySaoPaulo,
  isOverdue,
  parseBRLInputToCents,
  shiftYearMonth,
} from '../lib/utils'

const MONTHS_SHORT = [
  { num: '01', label: 'Jan' },
  { num: '02', label: 'Fev' },
  { num: '03', label: 'Mar' },
  { num: '04', label: 'Abr' },
  { num: '05', label: 'Mai' },
  { num: '06', label: 'Jun' },
  { num: '07', label: 'Jul' },
  { num: '08', label: 'Ago' },
  { num: '09', label: 'Set' },
  { num: '10', label: 'Out' },
  { num: '11', label: 'Nov' },
  { num: '12', label: 'Dez' },
]

// ============================================================================
// MODAL GLOBAL "NOVO LANÇAMENTO"
// Inclui: Despesa (Avulsa ou Fixa/Repetir todo mês), Receita (Avulsa ou Fixa)
// e Parcelamento (Do início ou Já em andamento)
// ============================================================================
export function NovoLancamentoModal({
  open,
  onClose,
  defaultYearMonth,
  defaultTab = 'despesa',
}: {
  open: boolean
  onClose: () => void
  defaultYearMonth?: string
  defaultTab?: 'despesa' | 'receita' | 'parcelamento'
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const today = getTodaySaoPaulo()
  const currentYM = getCurrentYearMonthSaoPaulo()

  const initialDate = useMemo(() => {
    if (!defaultYearMonth || defaultYearMonth === today.slice(0, 7)) return today
    return `${defaultYearMonth}-10`
  }, [defaultYearMonth, today])

  const [tab, setTab] = useState<'despesa' | 'receita' | 'parcelamento'>(
    defaultTab
  )
  // Seletor "Repetir todo mês" (Despesa fixa / Receita fixa)
  const [repetirTodoMes, setRepetirTodoMes] = useState(false)

  const [descricao, setDescricao] = useState('')
  const [valorStr, setValorStr] = useState('')
  const [dataVencimento, setDataVencimento] = useState(initialDate)
  const [categoriaId, setCategoriaId] = useState<string>('')
  const [jaQuitado, setJaQuitado] = useState(false)
  const [dataPagamento, setDataPagamento] = useState(today)
  const [valorRealStr, setValorRealStr] = useState('')

  // Campos de Recorrência (Despesa fixa / Receita fixa)
  const [diaDoMes, setDiaDoMes] = useState('5')
  const [dataInicioRec, setDataInicioRec] = useState(`${currentYM}-01`)
  const [dataFimRec, setDataFimRec] = useState('')

  // Campos exclusivos de Parcelamento
  const [modoParc, setModoParc] = useState<'inicio' | 'andamento'>('inicio')
  const [totalParcelas, setTotalParcelas] = useState('12')
  const [parcelaAtual, setParcelaAtual] = useState('1')
  const [erroForm, setErroForm] = useState<string | null>(null)

  React.useEffect(() => {
    if (open) {
      setTab(defaultTab)
      setRepetirTodoMes(false)
      setDataVencimento(initialDate)
      setDataPagamento(today)
      setDataInicioRec(`${(defaultYearMonth || currentYM).slice(0, 7)}-01`)
      setDataFimRec('')
      setErroForm(null)
    }
  }, [open, defaultTab, initialDate, today, defaultYearMonth, currentYM])

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias', user?.id],
    queryFn: () => fetchCategorias(user!.id),
    enabled: Boolean(user && open),
  })

  const saveMutation = useMutation({
    mutationFn: async () => {
      setErroForm(null)
      if (!descricao.trim()) {
        throw new Error('Informe uma descrição.')
      }
      const valorCents = parseBRLInputToCents(valorStr)
      if (valorCents <= 0) {
        throw new Error('Informe um valor maior que R$ 0,00.')
      }

      if (tab === 'despesa' || tab === 'receita') {
        const tipo: TipoLancamento = tab

        if (repetirTodoMes) {
          const dia = Number(diaDoMes)
          if (!Number.isInteger(dia) || dia < 1 || dia > 31) {
            throw new Error('O dia do mês deve ser entre 1 e 31.')
          }
          if (!dataInicioRec) {
            throw new Error('Informe a data de início da recorrência.')
          }
          if (dataFimRec && dataFimRec < dataInicioRec) {
            throw new Error(
              'A data de fim não pode ser anterior à data de início.'
            )
          }

          await createRecorrencia(user!.id, {
            tipo,
            descricao: descricao.trim(),
            valor_centavos: valorCents,
            dia_do_mes: dia,
            data_inicio: dataInicioRec,
            data_fim: dataFimRec || null,
            categoria_id: categoriaId || null,
          })
          return
        }

        if (!dataVencimento) {
          throw new Error('Informe a data de vencimento.')
        }

        const status: StatusLancamento = jaQuitado
          ? tipo === 'receita'
            ? 'recebido'
            : 'pago'
          : 'pendente'
        const realCents =
          jaQuitado && valorRealStr.trim()
            ? parseBRLInputToCents(valorRealStr)
            : jaQuitado
              ? valorCents
              : null

        await createLancamentoAvulso(user!.id, {
          tipo,
          descricao: descricao.trim(),
          valor_previsto_centavos: valorCents,
          valor_real_centavos: realCents,
          data_vencimento: dataVencimento,
          status,
          data_pagamento: jaQuitado ? dataPagamento || today : null,
          categoria_id: categoriaId || null,
        })
      } else {
        if (!dataVencimento) {
          throw new Error('Informe a data de vencimento.')
        }
        const total = Number(totalParcelas)
        if (!Number.isInteger(total) || total < 1 || total > 600) {
          throw new Error(
            'O total de parcelas deve ser um número inteiro (ex: 2 a 240).'
          )
        }
        const atual = modoParc === 'andamento' ? Number(parcelaAtual) : 1
        if (
          modoParc === 'andamento' &&
          (!Number.isInteger(atual) || atual < 1 || atual > total)
        ) {
          throw new Error(`A parcela atual deve estar entre 1 e ${total}.`)
        }

        await createParcelamentoComParcelas(user!.id, {
          descricao: descricao.trim(),
          valor_parcela_centavos: valorCents,
          total_parcelas: total,
          categoria_id: categoriaId || null,
          modo: modoParc,
          data_referencia: dataVencimento,
          parcela_atual: atual,
        })
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['parcelamentos'] })
      qc.invalidateQueries({ queryKey: ['recorrencias'] })
      setDescricao('')
      setValorStr('')
      setValorRealStr('')
      setJaQuitado(false)
      setRepetirTodoMes(false)
      onClose()
    },
    onError: (err: unknown) => {
      setErroForm(
        err instanceof Error ? err.message : 'Erro ao salvar lançamento.'
      )
    },
  })

  if (!open) return null

  const totalNum = Math.max(1, Number(totalParcelas) || 1)
  const atualNum =
    modoParc === 'andamento'
      ? Math.min(totalNum, Math.max(1, Number(parcelaAtual) || 1))
      : 1
  const parcelasGeradasCount = totalNum - atualNum + 1
  const valorParcelaCents = parseBRLInputToCents(valorStr)

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-auto">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-base">Novo Lançamento</h2>
            <p className="text-xs text-muted-foreground">
              Despesa/Receita (avulsa ou fixa mensal) ou Parcelamento
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

        {/* Abas: Despesa | Receita | Parcelamento */}
        <div className="p-3 bg-muted/40 border-b border-border grid grid-cols-3 gap-1.5">
          <button
            type="button"
            onClick={() => {
              setTab('despesa')
              setErroForm(null)
            }}
            className={`py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              tab === 'despesa'
                ? 'bg-destructive text-destructive-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
            }`}
          >
            <ArrowDownCircle className="h-3.5 w-3.5" />
            Despesa
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('receita')
              setErroForm(null)
            }}
            className={`py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              tab === 'receita'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
            }`}
          >
            <ArrowUpCircle className="h-3.5 w-3.5" />
            Receita
          </button>
          <button
            type="button"
            onClick={() => {
              setTab('parcelamento')
              setErroForm(null)
            }}
            className={`py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
              tab === 'parcelamento'
                ? 'bg-primary text-primary-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground hover:bg-background/60'
            }`}
          >
            <CreditCard className="h-3.5 w-3.5" />
            Parcelamento
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            saveMutation.mutate()
          }}
          className="p-5 space-y-4"
        >
          {/* Seletor Avulsa vs Fixa (Repetir todo mês) nas abas de Despesa e Receita */}
          {(tab === 'despesa' || tab === 'receita') && (
            <div className="grid grid-cols-2 gap-1.5 p-1 bg-muted rounded-xl text-xs font-semibold">
              <button
                type="button"
                onClick={() => setRepetirTodoMes(false)}
                className={`py-2 rounded-lg transition ${
                  !repetirTodoMes
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {tab === 'receita' ? 'Receita avulsa' : 'Despesa avulsa'}
              </button>
              <button
                type="button"
                onClick={() => setRepetirTodoMes(true)}
                className={`py-2 rounded-lg flex items-center justify-center gap-1.5 transition ${
                  repetirTodoMes
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <Repeat className="h-3.5 w-3.5" />
                {tab === 'receita'
                  ? 'Receita fixa (todo mês)'
                  : 'Despesa fixa (todo mês)'}
              </button>
            </div>
          )}

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
                tab === 'receita'
                  ? repetirTodoMes
                    ? 'Ex: Salário, Pró-labore, Aluguel recebido...'
                    : 'Ex: Freelance, Reembolso, Venda...'
                  : tab === 'parcelamento'
                    ? 'Ex: Notebook Dell, Geladeira, Reforma...'
                    : repetirTodoMes
                      ? 'Ex: Aluguel, Internet, Condomínio, Assinatura...'
                      : 'Ex: Conta de Luz, Supermercado, Farmácia...'
              }
              className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                {tab === 'parcelamento'
                  ? 'Valor de cada parcela (R$)'
                  : repetirTodoMes
                    ? 'Valor mensal (R$)'
                    : 'Valor previsto (R$)'}
              </label>
              <input
                type="text"
                inputMode="decimal"
                required
                value={valorStr}
                onChange={(e) => setValorStr(e.target.value)}
                placeholder="0,00"
                className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-ring"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium text-muted-foreground">
                Categoria
              </label>
              <select
                value={categoriaId}
                onChange={(e) => setCategoriaId(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              >
                <option value="">Sem categoria</option>
                {categorias.map((c: Categoria) => (
                  <option key={c.id} value={c.id}>
                    {c.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {tab === 'parcelamento' ? (
            <div className="space-y-3 p-3.5 rounded-xl bg-muted/40 border border-border">
              <div className="grid grid-cols-2 gap-1.5 p-1 bg-background rounded-lg border border-border text-xs font-medium">
                <button
                  type="button"
                  onClick={() => setModoParc('inicio')}
                  className={`py-1.5 rounded-md transition ${
                    modoParc === 'inicio'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  Do início (1ª parcela)
                </button>
                <button
                  type="button"
                  onClick={() => setModoParc('andamento')}
                  className={`py-1.5 rounded-md transition ${
                    modoParc === 'andamento'
                      ? 'bg-primary text-primary-foreground font-semibold'
                      : 'text-muted-foreground'
                  }`}
                >
                  Já em andamento
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {modoParc === 'andamento' && (
                  <div className="space-y-1">
                    <label className="text-xs font-medium text-muted-foreground">
                      Parcela atual (ex: 12)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={600}
                      required
                      value={parcelaAtual}
                      onChange={(e) => setParcelaAtual(e.target.value)}
                      className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm"
                    />
                  </div>
                )}

                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Total de parcelas (suporta 100+)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={600}
                    required
                    value={totalParcelas}
                    onChange={(e) => setTotalParcelas(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm"
                  />
                </div>

                <div
                  className={`space-y-1 ${
                    modoParc === 'andamento' ? 'sm:col-span-2' : ''
                  }`}
                >
                  <label className="text-xs font-medium text-muted-foreground">
                    {modoParc === 'inicio'
                      ? 'Vencimento da 1ª parcela'
                      : `Vencimento da parcela ${atualNum}/${totalNum}`}
                  </label>
                  <input
                    type="date"
                    required
                    value={dataVencimento}
                    onChange={(e) => setDataVencimento(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm"
                  />
                </div>
              </div>

              <div className="text-xs text-muted-foreground flex items-center justify-between pt-1 border-t border-border/60">
                <span>
                  Serão gerados{' '}
                  <strong className="text-foreground">
                    {parcelasGeradasCount} lançamentos
                  </strong>{' '}
                  ({atualNum}/{totalNum} até {totalNum}/{totalNum})
                </span>
                <strong className="text-foreground">
                  Total restante:{' '}
                  {formatCentsToBRL(parcelasGeradasCount * valorParcelaCents)}
                </strong>
              </div>
            </div>
          ) : repetirTodoMes ? (
            /* Campos de Despesa Fixa / Receita Fixa (Recorrência 24 meses) */
            <div className="space-y-3 p-3.5 rounded-xl bg-muted/40 border border-border">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
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
                    className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm font-bold"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Data de início
                  </label>
                  <input
                    type="date"
                    required
                    value={dataInicioRec}
                    onChange={(e) => setDataInicioRec(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Data de fim (opcional)
                  </label>
                  <input
                    type="date"
                    value={dataFimRec}
                    onChange={(e) => setDataFimRec(e.target.value)}
                    className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm"
                  />
                </div>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Serão gerados automaticamente os lançamentos para os próximos{' '}
                <strong className="text-foreground">24 meses</strong>{' '}
                (ajustando o dia 31 para o último dia nos meses mais curtos).
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <label className="text-xs font-medium text-muted-foreground">
                  Data de vencimento
                </label>
                <input
                  type="date"
                  required
                  value={dataVencimento}
                  onChange={(e) => setDataVencimento(e.target.value)}
                  className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
                />
              </div>

              <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-3">
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={jaQuitado}
                    onChange={(e) => setJaQuitado(e.target.checked)}
                    className="h-4 w-4 rounded border-input text-primary focus:ring-primary"
                  />
                  <span className="text-xs font-medium">
                    {tab === 'receita' ? 'Já foi recebido' : 'Já foi pago'}
                  </span>
                </label>

                {jaQuitado && (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        {tab === 'receita'
                          ? 'Data do recebimento'
                          : 'Data do pagamento'}
                      </label>
                      <input
                        type="date"
                        value={dataPagamento}
                        onChange={(e) => setDataPagamento(e.target.value)}
                        className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="text-xs font-medium text-muted-foreground">
                        Valor realizado (opcional, R$)
                      </label>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={valorRealStr}
                        onChange={(e) => setValorRealStr(e.target.value)}
                        placeholder={valorStr || 'Igual ao previsto'}
                        className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm"
                      />
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {erroForm && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive font-medium">
              {erroForm}
            </div>
          )}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl border border-border text-xs font-medium hover:bg-muted"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={saveMutation.isPending}
              className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-95 disabled:opacity-50"
            >
              {saveMutation.isPending ? 'Salvando...' : 'Salvar Lançamento'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// MODAL DE EDIÇÃO DE LANÇAMENTO
// ============================================================================
function EditarLancamentoModal({
  lancamento,
  categorias,
  onClose,
}: {
  lancamento: Lancamento | null
  categorias: Categoria[]
  onClose: () => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const today = getTodaySaoPaulo()

  const [descricao, setDescricao] = useState('')
  const [valorPrevistoStr, setValorPrevistoStr] = useState('')
  const [valorRealStr, setValorRealStr] = useState('')
  const [dataVencimento, setDataVencimento] = useState('')
  const [status, setStatus] = useState<StatusLancamento>('pendente')
  const [dataPagamento, setDataPagamento] = useState('')
  const [categoriaId, setCategoriaId] = useState('')

  React.useEffect(() => {
    if (lancamento) {
      setDescricao(lancamento.descricao)
      setValorPrevistoStr(centsToDecimalInput(lancamento.valor_previsto_centavos))
      setValorRealStr(
        lancamento.valor_real_centavos !== null
          ? centsToDecimalInput(lancamento.valor_real_centavos)
          : ''
      )
      setDataVencimento(lancamento.data_vencimento)
      setStatus(lancamento.status)
      setDataPagamento(lancamento.data_pagamento || today)
      setCategoriaId(lancamento.categoria_id || '')
    }
  }, [lancamento, today])

  const updateMut = useMutation({
    mutationFn: async () => {
      if (!lancamento) return
      const prevCents = parseBRLInputToCents(valorPrevistoStr)
      const isQuitado = status === 'pago' || status === 'recebido'
      const realCents = isQuitado
        ? valorRealStr.trim()
          ? parseBRLInputToCents(valorRealStr)
          : prevCents
        : null

      await updateLancamento(user!.id, lancamento.id, {
        descricao: descricao.trim() || lancamento.descricao,
        valor_previsto_centavos: prevCents,
        valor_real_centavos: realCents,
        data_vencimento: dataVencimento,
        status,
        data_pagamento: isQuitado ? dataPagamento || today : null,
        categoria_id: categoriaId || null,
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      onClose()
    },
  })

  if (!lancamento) return null

  const quitadoStatus: StatusLancamento =
    lancamento.tipo === 'receita' ? 'recebido' : 'pago'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h2 className="font-bold text-base">Editar Lançamento</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            updateMut.mutate()
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
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
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
                value={valorPrevistoStr}
                onChange={(e) => setValorPrevistoStr(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm font-semibold"
              />
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">
                Vencimento
              </label>
              <input
                type="date"
                required
                value={dataVencimento}
                onChange={(e) => setDataVencimento(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-background border border-input text-sm"
              />
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-xs font-medium text-muted-foreground">
              Categoria
            </label>
            <select
              value={categoriaId}
              onChange={(e) => setCategoriaId(e.target.value)}
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

          <div className="p-3.5 rounded-xl bg-muted/40 border border-border space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium">Situação</span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  onClick={() => setStatus('pendente')}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    status === 'pendente'
                      ? 'bg-amber-500 text-white'
                      : 'bg-background border border-border text-muted-foreground'
                  }`}
                >
                  Pendente
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setStatus(quitadoStatus)
                    if (!dataPagamento) setDataPagamento(today)
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-semibold transition ${
                    status !== 'pendente'
                      ? 'bg-emerald-600 text-white'
                      : 'bg-background border border-border text-muted-foreground'
                  }`}
                >
                  {lancamento.tipo === 'receita' ? 'Recebido' : 'Pago'}
                </button>
              </div>
            </div>

            {status !== 'pendente' && (
              <div className="grid grid-cols-2 gap-3 pt-1">
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    {lancamento.tipo === 'receita'
                      ? 'Data recebimento'
                      : 'Data pagamento'}
                  </label>
                  <input
                    type="date"
                    value={dataPagamento}
                    onChange={(e) => setDataPagamento(e.target.value)}
                    className="w-full h-9 px-2.5 rounded-lg bg-background border border-input text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs font-medium text-muted-foreground">
                    Valor realizado (R$)
                  </label>
                  <input
                    type="text"
                    inputMode="decimal"
                    value={valorRealStr}
                    onChange={(e) => setValorRealStr(e.target.value)}
                    placeholder={valorPrevistoStr}
                    className="w-full h-9 px-2.5 rounded-lg bg-background border border-input text-xs"
                  />
                </div>
              </div>
            )}
          </div>

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
              disabled={updateMut.isPending}
              className="h-10 px-5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold hover:opacity-95"
            >
              Salvar alterações
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// ============================================================================
// MODAL DE EXCLUSÃO INTELIGENTE NA TELA MÊS
// Se o lançamento veio de parcelamento ou recorrência, pergunta se é:
// - "Só este"
// - "Este e os próximos"
// - "O parcelamento inteiro"
// ============================================================================
function ExcluirLancamentoModal({
  lancamento,
  onClose,
}: {
  lancamento: Lancamento | null
  onClose: () => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()

  const deleteMut = useMutation({
    mutationFn: (escopo: 'so_este' | 'este_e_proximos' | 'tudo') =>
      deleteLancamentoComEscopo(user!.id, lancamento!, escopo),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
      qc.invalidateQueries({ queryKey: ['parcelamentos'] })
      qc.invalidateQueries({ queryKey: ['recorrencias'] })
      onClose()
    },
  })

  if (!lancamento) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="h-10 w-10 rounded-xl bg-destructive/15 text-destructive flex items-center justify-center shrink-0">
              <Trash2 className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 className="font-bold text-base">Excluir lançamento</h3>
              <p className="text-xs text-muted-foreground">
                <strong className="text-foreground">
                  {lancamento.descricao}
                </strong>{' '}
                — {formatCentsToBRL(lancamento.valor_previsto_centavos)} (
                {formatDateBR(lancamento.data_vencimento)})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {lancamento.origem === 'avulso' ? (
          <div className="space-y-3 pt-1">
            <p className="text-xs text-muted-foreground">
              Tem certeza que deseja excluir este lançamento avulso?
            </p>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="h-9 px-4 rounded-xl border border-border text-xs font-medium"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={deleteMut.isPending}
                onClick={() => deleteMut.mutate('so_este')}
                className="h-9 px-4 rounded-xl bg-destructive text-destructive-foreground text-xs font-semibold"
              >
                Excluir lançamento
              </button>
            </div>
          </div>
        ) : lancamento.origem === 'parcelamento' ? (
          <div className="space-y-2.5 pt-1">
            <p className="text-xs text-muted-foreground">
              Este lançamento faz parte de um{' '}
              <strong className="text-foreground">parcelamento</strong> (parcela{' '}
              {lancamento.numero_parcela}). O que você deseja excluir?
            </p>
            <button
              type="button"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate('so_este')}
              className="w-full p-3 rounded-xl border border-border hover:bg-muted text-left transition space-y-0.5"
            >
              <div className="text-xs font-bold text-foreground">
                Só esta parcela (#{lancamento.numero_parcela})
              </div>
              <div className="text-[11px] text-muted-foreground">
                Mantém as demais parcelas nos outros meses. Se for a última
                parcela existente, remove o parcelamento órfão.
              </div>
            </button>

            <button
              type="button"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate('este_e_proximos')}
              className="w-full p-3 rounded-xl border border-border hover:bg-muted text-left transition space-y-0.5"
            >
              <div className="text-xs font-bold text-amber-600 dark:text-amber-400">
                Esta e as próximas parcelas (#{lancamento.numero_parcela} em
                diante)
              </div>
              <div className="text-[11px] text-muted-foreground">
                Mantém as parcelas anteriores e remove da parcela #
                {lancamento.numero_parcela} até o final.
              </div>
            </button>

            <button
              type="button"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate('tudo')}
              className="w-full p-3 rounded-xl border border-destructive/40 bg-destructive/5 hover:bg-destructive/15 text-left transition space-y-0.5"
            >
              <div className="text-xs font-bold text-destructive">
                O parcelamento inteiro
              </div>
              <div className="text-[11px] text-muted-foreground">
                Remove todas as parcelas (passadas e futuras) e exclui o
                cadastro do parcelamento.
              </div>
            </button>
          </div>
        ) : (
          /* lancamento.origem === 'recorrencia' */
          <div className="space-y-2.5 pt-1">
            <p className="text-xs text-muted-foreground">
              Este lançamento veio de uma{' '}
              <strong className="text-foreground">recorrência fixa mensal</strong>
              . O que você deseja excluir?
            </p>
            <button
              type="button"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate('so_este')}
              className="w-full p-3 rounded-xl border border-border hover:bg-muted text-left transition space-y-0.5"
            >
              <div className="text-xs font-bold text-foreground">
                Só este lançamento ({formatDateBR(lancamento.data_vencimento)})
              </div>
              <div className="text-[11px] text-muted-foreground">
                Remove apenas o lançamento deste mês; os demais meses continuam
                ativos.
              </div>
            </button>

            <button
              type="button"
              disabled={deleteMut.isPending}
              onClick={() => deleteMut.mutate('este_e_proximos')}
              className="w-full p-3 rounded-xl border border-destructive/40 bg-destructive/5 hover:bg-destructive/15 text-left transition space-y-0.5"
            >
              <div className="text-xs font-bold text-destructive">
                Este e os próximos pendentes (Encerrar recorrência)
              </div>
              <div className="text-[11px] text-muted-foreground">
                Remove este lançamento e todos os futuros pendentes, mantendo o
                histórico dos meses já pagos/recebidos.
              </div>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================================
// TELA MÊS
// ============================================================================
export function MesPage({
  onOpenNewModal,
}: {
  onOpenNewModal: (ym: string) => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()
  const today = getTodaySaoPaulo()
  const currentYM = getCurrentYearMonthSaoPaulo()

  const selectedYM = searchParams.get('ym') || currentYM
  const setSelectedYM = (ym: string) => {
    setSearchParams({ ym })
  }

  // Filtros
  const [filtroTipo, setFiltroTipo] = useState<'todos' | 'despesa' | 'receita'>(
    'todos'
  )
  const [filtroStatus, setFiltroStatus] = useState<
    'todos' | 'pendente' | 'atrasado' | 'quitado'
  >('todos')
  const [filtroCategoria, setFiltroCategoria] = useState<string>('todas')

  const [editingLancamento, setEditingLancamento] = useState<Lancamento | null>(
    null
  )
  const [deletingLancamento, setDeletingLancamento] =
    useState<Lancamento | null>(null)
  const [quickDateEditId, setQuickDateEditId] = useState<string | null>(null)

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias', user?.id],
    queryFn: () => fetchCategorias(user!.id),
    enabled: Boolean(user),
  })

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

  // Mapa de quais meses (YYYY-MM) possuem lançamentos para indicação visual
  const countByMonth = useMemo(() => {
    const map = new Map<string, { total: number; hasOverdue: boolean }>()
    for (const l of lancamentos) {
      const ym = l.data_vencimento.slice(0, 7)
      const prev = map.get(ym) || { total: 0, hasOverdue: false }
      prev.total += 1
      if (isOverdue(l.status, l.data_vencimento, today)) {
        prev.hasOverdue = true
      }
      map.set(ym, prev)
    }
    return map
  }, [lancamentos, today])

  // Lançamentos do mês selecionado
  const lancamentosDoMes = useMemo(() => {
    return lancamentos
      .filter((l) => l.data_vencimento.slice(0, 7) === selectedYM)
      .sort(
        (a, b) =>
          a.data_vencimento.localeCompare(b.data_vencimento) ||
          a.descricao.localeCompare(b.descricao, 'pt-BR')
      )
  }, [lancamentos, selectedYM])

  // Cálculo dos 5 cartões de resumo do mês
  const resumoMes = useMemo(() => {
    let receitasPrevistas = 0
    let despesasPrevistas = 0
    let jaPago = 0
    let faltaPagar = 0

    for (const l of lancamentosDoMes) {
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
        despesasPrevistas += valEfetivo
        if (l.status === 'pago') {
          jaPago += valEfetivo
        } else {
          faltaPagar += l.valor_previsto_centavos
        }
      }
    }

    const saldoPrevisto = receitasPrevistas - despesasPrevistas
    return {
      receitasPrevistas,
      despesasPrevistas,
      saldoPrevisto,
      jaPago,
      faltaPagar,
    }
  }, [lancamentosDoMes])

  // Lista filtrada
  const lancamentosFiltrados = useMemo(() => {
    return lancamentosDoMes.filter((l) => {
      if (filtroTipo !== 'todos' && l.tipo !== filtroTipo) return false
      if (filtroCategoria !== 'todas' && l.categoria_id !== filtroCategoria)
        return false

      const atrasado = isOverdue(l.status, l.data_vencimento, today)
      if (filtroStatus === 'pendente' && l.status !== 'pendente') return false
      if (filtroStatus === 'atrasado' && !atrasado) return false
      if (filtroStatus === 'quitado' && l.status === 'pendente') return false

      return true
    })
  }, [lancamentosDoMes, filtroTipo, filtroCategoria, filtroStatus, today])

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

  const changePayDateMut = useMutation({
    mutationFn: async ({ id, date }: { id: string; date: string }) => {
      await updateLancamento(user!.id, id, { data_pagamento: date })
    },
    onSuccess: () => {
      setQuickDateEditId(null)
      qc.invalidateQueries({ queryKey: ['lancamentos'] })
    },
  })

  const [selectedYearStr, selectedMonthStr] = selectedYM.split('-')
  const selectedYear = Number(selectedYearStr)

  const availableYears = useMemo(() => {
    const years = new Set<number>([
      Number(currentYM.slice(0, 4)) - 1,
      Number(currentYM.slice(0, 4)),
      Number(currentYM.slice(0, 4)) + 1,
      Number(currentYM.slice(0, 4)) + 2,
      selectedYear,
    ])
    for (const ym of countByMonth.keys()) {
      years.add(Number(ym.slice(0, 4)))
    }
    return Array.from(years).sort((a, b) => a - b)
  }, [countByMonth, currentYM, selectedYear])

  return (
    <div className="space-y-6">
      {/* Cabeçalho e Seletor de Mês/Ano com Indicador Visual de Meses com Lançamentos */}
      <div className="bg-card border border-border rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center justify-between sm:justify-start gap-2">
            <button
              type="button"
              onClick={() => setSelectedYM(shiftYearMonth(selectedYM, -1))}
              className="h-10 w-10 rounded-xl border border-border flex items-center justify-center hover:bg-muted transition"
              title="Mês anterior"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>

            <div className="text-center sm:text-left px-2">
              <h1 className="text-lg sm:text-xl font-bold tracking-tight capitalize">
                {formatYearMonthLong(selectedYM)}
              </h1>
              <p className="text-xs text-muted-foreground">
                {lancamentosDoMes.length}{' '}
                {lancamentosDoMes.length === 1
                  ? 'lançamento neste mês'
                  : 'lançamentos neste mês'}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setSelectedYM(shiftYearMonth(selectedYM, 1))}
              className="h-10 w-10 rounded-xl border border-border flex items-center justify-center hover:bg-muted transition"
              title="Próximo mês"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <select
              value={selectedYearStr}
              onChange={(e) =>
                setSelectedYM(`${e.target.value}-${selectedMonthStr}`)
              }
              aria-label="Selecionar Ano"
              className="h-10 px-3 rounded-xl bg-background border border-input text-xs font-semibold"
            >
              {availableYears.map((y) => (
                <option key={y} value={String(y)}>
                  Ano {y}
                </option>
              ))}
            </select>

            {selectedYM !== currentYM && (
              <button
                type="button"
                onClick={() => setSelectedYM(currentYM)}
                className="h-10 px-3 rounded-xl bg-secondary text-secondary-foreground text-xs font-medium hover:opacity-90"
              >
                Mês atual
              </button>
            )}

            <button
              type="button"
              onClick={() => onOpenNewModal(selectedYM)}
              className="h-10 px-3.5 rounded-xl bg-primary text-primary-foreground text-xs font-semibold flex items-center gap-1.5 shadow-xs hover:opacity-95"
            >
              <Plus className="h-4 w-4" />
              Adicionar
            </button>
          </div>
        </div>

        {/* Barra de meses do ano selecionado com indicação visual de quais meses têm lançamentos */}
        <div className="grid grid-cols-6 sm:grid-cols-12 gap-1.5 pt-1">
          {MONTHS_SHORT.map((m) => {
            const ym = `${selectedYearStr}-${m.num}`
            const info = countByMonth.get(ym)
            const isSelected = ym === selectedYM
            const isCurrent = ym === currentYM

            return (
              <button
                key={m.num}
                type="button"
                onClick={() => setSelectedYM(ym)}
                className={`relative py-2 px-1 rounded-xl text-xs font-medium transition flex flex-col items-center justify-center gap-1 border ${
                  isSelected
                    ? 'bg-primary text-primary-foreground border-primary font-bold shadow-xs'
                    : isCurrent
                      ? 'bg-primary/10 text-primary border-primary/30'
                      : 'bg-background/60 hover:bg-muted border-border text-muted-foreground hover:text-foreground'
                }`}
              >
                <span>{m.label}</span>
                <span className="flex items-center gap-1 h-2">
                  {info && info.total > 0 ? (
                    <span
                      title={`${info.total} lançamento(s)`}
                      className={`h-1.5 w-1.5 rounded-full ${
                        isSelected
                          ? 'bg-primary-foreground'
                          : info.hasOverdue
                            ? 'bg-destructive'
                            : 'bg-emerald-500'
                      }`}
                    />
                  ) : (
                    <span className="h-1.5 w-1.5 rounded-full bg-transparent" />
                  )}
                </span>
              </button>
            )
          })}
        </div>
      </div>

      {/* 5 Cartões de Resumo do Mês */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Receitas previstas</span>
            <ArrowUpCircle className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCentsToBRL(resumoMes.receitasPrevistas)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Despesas previstas</span>
            <ArrowDownCircle className="h-4 w-4 text-rose-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-foreground">
            {formatCentsToBRL(resumoMes.despesasPrevistas)}
          </div>
        </div>

        <div
          className={`p-4 rounded-2xl border space-y-1 ${
            resumoMes.saldoPrevisto >= 0
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
              resumoMes.saldoPrevisto >= 0
                ? 'text-emerald-600 dark:text-emerald-400'
                : 'text-destructive'
            }`}
          >
            {formatCentsToBRL(resumoMes.saldoPrevisto)}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Já pago</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-emerald-600 dark:text-emerald-400">
            {formatCentsToBRL(resumoMes.jaPago)}
          </div>
        </div>

        <div className="col-span-2 sm:col-span-1 p-4 rounded-2xl bg-card border border-border space-y-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Falta pagar</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <div className="text-lg sm:text-xl font-bold text-amber-600 dark:text-amber-400">
            {formatCentsToBRL(resumoMes.faltaPagar)}
          </div>
        </div>
      </div>

      {/* Barra de Filtros: Tipo, Status e Categoria */}
      <div className="bg-card border border-border rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-xs font-medium text-muted-foreground flex items-center gap-1 pl-1">
            <Filter className="h-3.5 w-3.5" />
            Filtros:
          </span>

          <select
            value={filtroTipo}
            onChange={(e) =>
              setFiltroTipo(e.target.value as 'todos' | 'despesa' | 'receita')
            }
            className="h-9 px-3 rounded-xl bg-background border border-input text-xs font-medium"
          >
            <option value="todos">Todos os tipos</option>
            <option value="despesa">Apenas Despesas</option>
            <option value="receita">Apenas Receitas</option>
          </select>

          <select
            value={filtroStatus}
            onChange={(e) =>
              setFiltroStatus(
                e.target.value as
                  | 'todos'
                  | 'pendente'
                  | 'atrasado'
                  | 'quitado'
              )
            }
            className="h-9 px-3 rounded-xl bg-background border border-input text-xs font-medium"
          >
            <option value="todos">Todos os status</option>
            <option value="pendente">Pendentes</option>
            <option value="atrasado">Atrasados</option>
            <option value="quitado">Pagos / Recebidos</option>
          </select>

          <select
            value={filtroCategoria}
            onChange={(e) => setFiltroCategoria(e.target.value)}
            className="h-9 px-3 rounded-xl bg-background border border-input text-xs font-medium"
          >
            <option value="todas">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>

        {(filtroTipo !== 'todos' ||
          filtroStatus !== 'todos' ||
          filtroCategoria !== 'todas') && (
          <button
            type="button"
            onClick={() => {
              setFiltroTipo('todos')
              setFiltroStatus('todos')
              setFiltroCategoria('todas')
            }}
            className="text-xs font-medium text-primary hover:underline px-2"
          >
            Limpar filtros
          </button>
        )}
      </div>

      {/* Lista Ordenada por Vencimento */}
      <div className="space-y-2.5">
        {isLoading ? (
          <div className="p-10 rounded-2xl bg-card border border-border text-center text-sm text-muted-foreground">
            Carregando lançamentos do mês...
          </div>
        ) : lancamentosFiltrados.length === 0 ? (
          <div className="p-10 rounded-2xl bg-card border border-border text-center space-y-3">
            <div className="h-12 w-12 rounded-2xl bg-muted mx-auto flex items-center justify-center text-muted-foreground">
              <Wallet className="h-6 w-6" />
            </div>
            <div className="space-y-1">
              <h3 className="font-semibold text-base">
                Nenhum lançamento encontrado em {formatYearMonthLong(selectedYM)}
              </h3>
              <p className="text-xs text-muted-foreground max-w-md mx-auto">
                Toque no botão "+" para registrar uma despesa, receita (avulsa
                ou fixa) ou parcelamento para este mês.
              </p>
            </div>
            <button
              type="button"
              onClick={() => onOpenNewModal(selectedYM)}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold"
            >
              <Plus className="h-4 w-4" />
              Novo lançamento neste mês
            </button>
          </div>
        ) : (
          lancamentosFiltrados.map((l) => {
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
                className={`p-4 rounded-2xl border transition flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                  atrasado
                    ? 'bg-destructive/8 border-destructive/40'
                    : quitado
                      ? 'bg-card/60 border-border opacity-85'
                      : 'bg-card border-border hover:border-primary/40'
                }`}
              >
                <div className="flex items-start sm:items-center gap-3.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => quickToggleMut.mutate(l)}
                    disabled={quickToggleMut.isPending}
                    title={
                      quitado
                        ? 'Clique para reabrir como pendente'
                        : l.tipo === 'receita'
                          ? 'Marcar como recebido hoje (1 toque)'
                          : 'Marcar como pago hoje (1 toque)'
                    }
                    className={`mt-0.5 sm:mt-0 h-9 w-9 rounded-xl flex items-center justify-center shrink-0 border transition ${
                      quitado
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                        : atrasado
                          ? 'border-destructive text-destructive hover:bg-destructive hover:text-white'
                          : 'border-input bg-background text-muted-foreground hover:border-emerald-500 hover:text-emerald-600'
                    }`}
                  >
                    <Check className="h-4 w-4 stroke-[2.5]" />
                  </button>

                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center flex-wrap gap-2">
                      <span
                        className={`font-semibold text-sm sm:text-base truncate ${
                          atrasado
                            ? 'text-destructive font-bold'
                            : quitado
                              ? 'line-through text-muted-foreground'
                              : 'text-foreground'
                        }`}
                      >
                        {l.descricao}
                      </span>

                      {l.origem === 'parcelamento' && l.numero_parcela && (
                        <span className="px-2 py-0.5 rounded-md bg-primary/15 text-primary text-[11px] font-bold">
                          parcela {l.numero_parcela}/
                          {parc ? parc.total_parcelas : '?'}
                        </span>
                      )}

                      {l.origem === 'recorrencia' && (
                        <span className="px-2 py-0.5 rounded-md bg-secondary text-secondary-foreground text-[11px] font-medium">
                          Fixo mensal
                        </span>
                      )}

                      {cat && (
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[11px] font-medium border border-border bg-background">
                          <span
                            className="h-2 w-2 rounded-full"
                            style={{ backgroundColor: cat.cor }}
                          />
                          {cat.nome}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center flex-wrap gap-3 text-xs text-muted-foreground">
                      <span
                        className={
                          atrasado ? 'text-destructive font-semibold' : ''
                        }
                      >
                        Vence em {formatDateBR(l.data_vencimento)}
                      </span>

                      {atrasado ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-destructive text-destructive-foreground text-[11px] font-bold">
                          <AlertTriangle className="h-3 w-3" />
                          Atrasado
                        </span>
                      ) : quitado ? (
                        <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          {l.tipo === 'receita' ? 'Recebido' : 'Pago'} em{' '}
                          {quickDateEditId === l.id ? (
                            <input
                              type="date"
                              defaultValue={l.data_pagamento || today}
                              onBlur={(e) => {
                                if (e.target.value) {
                                  changePayDateMut.mutate({
                                    id: l.id,
                                    date: e.target.value,
                                  })
                                } else {
                                  setQuickDateEditId(null)
                                }
                              }}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  changePayDateMut.mutate({
                                    id: l.id,
                                    date: (e.target as HTMLInputElement).value,
                                  })
                                } else if (e.key === 'Escape') {
                                  setQuickDateEditId(null)
                                }
                              }}
                              autoFocus
                              className="h-6 px-1.5 rounded border border-input bg-background text-foreground text-xs"
                            />
                          ) : (
                            <button
                              type="button"
                              onClick={() => setQuickDateEditId(l.id)}
                              title="Clique para editar a data de pagamento"
                              className="underline decoration-dotted hover:text-foreground inline-flex items-center gap-1"
                            >
                              {formatDateBR(l.data_pagamento || today)}
                              <CalendarIcon className="h-3 w-3" />
                            </button>
                          )}
                        </span>
                      ) : (
                        <span className="text-amber-600 dark:text-amber-400 font-medium">
                          Pendente
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Valor em destaque (Previsto e Realizado) + Ações */}
                <div className="flex items-center justify-between sm:justify-end gap-4 pt-2 sm:pt-0 border-t sm:border-t-0 border-border/60">
                  <div className="text-left sm:text-right">
                    <div
                      className={`text-base sm:text-lg font-extrabold whitespace-nowrap ${
                        l.tipo === 'receita'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : atrasado
                            ? 'text-destructive'
                            : 'text-foreground'
                      }`}
                    >
                      {l.tipo === 'receita' ? '+ ' : '- '}
                      {formatCentsToBRL(valorExibido)}
                    </div>
                    {quitado && (
                      <div className="text-[11px] text-muted-foreground">
                        Previsto: {formatCentsToBRL(l.valor_previsto_centavos)}{' '}
                        • Realizado: {formatCentsToBRL(valorExibido)}
                      </div>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    {!quitado ? (
                      <button
                        type="button"
                        onClick={() => quickToggleMut.mutate(l)}
                        className="h-8 px-2.5 rounded-lg bg-emerald-600/15 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-600 hover:text-white text-xs font-semibold transition"
                      >
                        {l.tipo === 'receita' ? 'Receber' : 'Pagar'}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => quickToggleMut.mutate(l)}
                        title="Voltar para pendente"
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                      >
                        <RotateCcw className="h-4 w-4" />
                      </button>
                    )}

                    <button
                      type="button"
                      onClick={() => setEditingLancamento(l)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                      title="Editar lançamento"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setDeletingLancamento(l)}
                      className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                      title="Excluir lançamento"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )
          })
        )}
      </div>

      <EditarLancamentoModal
        lancamento={editingLancamento}
        categorias={categorias}
        onClose={() => setEditingLancamento(null)}
      />

      <ExcluirLancamentoModal
        lancamento={deletingLancamento}
        onClose={() => setDeletingLancamento(null)}
      />
    </div>
  )
}
