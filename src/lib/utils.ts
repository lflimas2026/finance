import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export const TIMEZONE_SP = 'America/Sao_Paulo'

/**
 * Formata valor em centavos (inteiro) para Real brasileiro (R$ 1.234,56)
 */
export function formatCentsToBRL(centavos: number): string {
  const reais = (centavos || 0) / 100
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(reais)
}

/**
 * Converte string digitada pelo usuário (ex: "1.234,56" ou "289.90" ou "289") em centavos (inteiro)
 */
export function parseBRLInputToCents(raw: string): number {
  if (!raw) return 0
  const cleaned = raw.replace(/[R$\s]/g, '').trim()
  if (!cleaned) return 0

  // Se possui vírgula, trata ponto como separador de milhar e vírgula como decimal
  if (cleaned.includes(',')) {
    const normalized = cleaned.replace(/\./g, '').replace(',', '.')
    const num = Number(normalized)
    return Number.isFinite(num) ? Math.round(num * 100) : 0
  }

  const num = Number(cleaned)
  return Number.isFinite(num) ? Math.round(num * 100) : 0
}

/**
 * Converte centavos para string de edição numérica (ex: 28990 -> "289,90")
 */
export function centsToDecimalInput(centavos: number | null | undefined): string {
  if (centavos === null || centavos === undefined) return ''
  return (centavos / 100).toFixed(2).replace('.', ',')
}

/**
 * Retorna a data de hoje no fuso America/Sao_Paulo no formato YYYY-MM-DD
 */
export function getTodaySaoPaulo(): string {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE_SP,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })
  return formatter.format(new Date())
}

/**
 * Retorna o ano-mês atual no fuso America/Sao_Paulo no formato YYYY-MM
 */
export function getCurrentYearMonthSaoPaulo(): string {
  return getTodaySaoPaulo().slice(0, 7)
}

/**
 * Formata YYYY-MM-DD para dd/mm/aaaa sem problemas de fuso horário
 */
export function formatDateBR(isoDate: string | null | undefined): string {
  if (!isoDate) return '—'
  const parts = isoDate.slice(0, 10).split('-')
  if (parts.length !== 3) return isoDate
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

/**
 * Retorna a quantidade de dias em um determinado mês (month1Based: 1 = Jan .. 12 = Dez)
 */
export function getDaysInMonth(year: number, month1Based: number): number {
  return new Date(Date.UTC(year, month1Based, 0)).getUTCDate()
}

/**
 * Constrói uma data YYYY-MM-DD ajustando o dia para o último dia do mês caso não exista
 * (ex: dia 31 em fevereiro vira 28 ou 29; em abril vira 30)
 */
export function buildMonthlyDateClamped(
  year: number,
  month1Based: number,
  desiredDay: number
): string {
  const maxDay = getDaysInMonth(year, month1Based)
  const clampedDay = Math.min(Math.max(1, desiredDay), maxDay)
  const y = String(year).padStart(4, '0')
  const m = String(month1Based).padStart(2, '0')
  const d = String(clampedDay).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/**
 * Soma N meses a uma data base (YYYY-MM-DD), preservando o dia original da data base
 * e limitando ao último dia do mês alvo se não existir (ex: 31/01 + 1 mês -> 28/02)
 */
export function addMonthsClamped(baseIsoDate: string, monthsToAdd: number): string {
  const [yStr, mStr, dStr] = baseIsoDate.slice(0, 10).split('-')
  const baseYear = Number(yStr)
  const baseMonth = Number(mStr) // 1..12
  const desiredDay = Number(dStr) // 1..31

  const totalMonthsZeroBased = baseYear * 12 + (baseMonth - 1) + monthsToAdd
  const targetYear = Math.floor(totalMonthsZeroBased / 12)
  const targetMonth = (totalMonthsZeroBased % 12) + 1

  return buildMonthlyDateClamped(targetYear, targetMonth, desiredDay)
}

/**
 * Desloca uma string YYYY-MM em N meses (positivos ou negativos)
 */
export function shiftYearMonth(yearMonth: string, deltaMonths: number): string {
  const [yStr, mStr] = yearMonth.split('-')
  const year = Number(yStr)
  const month = Number(mStr)
  const total = year * 12 + (month - 1) + deltaMonths
  const targetYear = Math.floor(total / 12)
  const targetMonth = ((total % 12) + 12) % 12 + 1
  return `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}`
}

/**
 * Retorna a diferença em meses entre dois YYYY-MM (b - a)
 */
export function diffYearMonths(ymStart: string, ymEnd: string): number {
  const [y1, m1] = ymStart.split('-').map(Number)
  const [y2, m2] = ymEnd.split('-').map(Number)
  return (y2 * 12 + (m2 - 1)) - (y1 * 12 + (m1 - 1))
}

const MONTH_NAMES_PT = [
  'Janeiro',
  'Fevereiro',
  'Março',
  'Abril',
  'Maio',
  'Junho',
  'Julho',
  'Agosto',
  'Setembro',
  'Outubro',
  'Novembro',
  'Dezembro',
]

const MONTH_SHORT_PT = [
  'Jan',
  'Fev',
  'Mar',
  'Abr',
  'Mai',
  'Jun',
  'Jul',
  'Ago',
  'Set',
  'Out',
  'Nov',
  'Dez',
]

export function formatYearMonthLong(yearMonth: string): string {
  const [yStr, mStr] = yearMonth.split('-')
  const mIdx = Number(mStr) - 1
  return `${MONTH_NAMES_PT[mIdx] || mStr} de ${yStr}`
}

export function formatYearMonthShort(yearMonth: string): string {
  const [yStr, mStr] = yearMonth.split('-')
  const mIdx = Number(mStr) - 1
  return `${MONTH_SHORT_PT[mIdx] || mStr}/${yStr.slice(2)}`
}

/**
 * Regra central: Atrasado = pendente com data_vencimento anterior a hoje (calculado, sem salvar como status)
 */
export function isOverdue(status: string, dataVencimento: string, todayIso?: string): boolean {
  if (status !== 'pendente') return false
  const today = todayIso || getTodaySaoPaulo()
  return dataVencimento < today
}

/**
 * Adiciona N dias a uma data YYYY-MM-DD
 */
export function addDaysIso(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d + days))
  const ry = dt.getUTCFullYear()
  const rm = String(dt.getUTCMonth() + 1).padStart(2, '0')
  const rd = String(dt.getUTCDate()).padStart(2, '0')
  return `${ry}-${rm}-${rd}`
}
