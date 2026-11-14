import React, { createContext, useContext, useEffect, useState } from 'react'
import {
  BrowserRouter,
  Link,
  Navigate,
  Route,
  Routes,
  useLocation,
  useSearchParams,
} from 'react-router-dom'
import {
  QueryClient,
  QueryClientProvider,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import {
  AlertCircle,
  Calendar,
  Check,
  CreditCard,
  FolderKanban,
  LayoutDashboard,
  LogOut,
  Moon,
  Pencil,
  Plus,
  Repeat,
  Sun,
  Trash2,
  TrendingUp,
  Wallet,
  X,
} from 'lucide-react'
import {
  type Categoria,
  createCategoria,
  deleteCategoria,
  ensureDefaultCategorias,
  fetchCategorias,
  isSupabaseConfigured,
  supabase,
  syncRecorrencias24Meses,
  updateCategoria,
} from './lib/supabase'
import { getCurrentYearMonthSaoPaulo } from './lib/utils'
import { MesPage, NovoLancamentoModal } from './pages/MesPage'
import { ParcelamentosPage } from './pages/ParcelamentosPage'
import { RecorrenciasPage } from './pages/RecorrenciasPage'
import {
  CalendarioPage,
  DashboardPage,
  ProjecaoPage,
} from './pages/Fase5Pages'

// ============================================================================
// CONTEXTO DE AUTENTICAÇÃO E TEMA
// ============================================================================
export interface AppUser {
  id: string
  email: string
}

interface AuthContextValue {
  user: AppUser | null
  loading: boolean
  signInDemo: (email?: string) => void
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue>({
  user: null,
  loading: true,
  signInDemo: () => {},
  signOut: async () => {},
})

export const useAuth = () => useContext(AuthContext)

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 30,
      refetchOnWindowFocus: false,
    },
  },
})

function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const savedDemo = localStorage.getItem('finances_demo_session')
    if (savedDemo) {
      try {
        setUser(JSON.parse(savedDemo))
      } catch {
        localStorage.removeItem('finances_demo_session')
      }
    }

    if (!isSupabaseConfigured || !supabase) {
      setLoading(false)
      return
    }

    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.user) {
        setUser({
          id: data.session.user.id,
          email: data.session.user.email || 'usuario@financas.app',
        })
      }
      setLoading(false)
    })

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) {
        setUser({
          id: session.user.id,
          email: session.user.email || 'usuario@financas.app',
        })
      } else if (!localStorage.getItem('finances_demo_session')) {
        setUser(null)
      }
    })

    return () => {
      sub.subscription.unsubscribe()
    }
  }, [])

  // Seed inicial de categorias + extensão automática das recorrências para 24 meses ao abrir o app
  useEffect(() => {
    if (!user) return
    ensureDefaultCategorias(user.id)
      .then(() => syncRecorrencias24Meses(user.id))
      .then(() => {
        queryClient.invalidateQueries()
      })
      .catch(console.error)
  }, [user])

  const signInDemo = (email = 'voce@financas.com.br') => {
    const demoUser: AppUser = { id: 'demo-user-local', email }
    localStorage.setItem('finances_demo_session', JSON.stringify(demoUser))
    setUser(demoUser)
  }

  const signOut = async () => {
    localStorage.removeItem('finances_demo_session')
    if (supabase) {
      await supabase.auth.signOut()
    }
    setUser(null)
    queryClient.clear()
  }

  return (
    <AuthContext.Provider value={{ user, loading, signInDemo, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

// ============================================================================
// TELA DE LOGIN / CADASTRO (SUPABASE AUTH + MODO LOCAL)
// ============================================================================
function AuthScreen() {
  const { signInDemo } = useAuth()
  const [mode, setMode] = useState<'login' | 'signup'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [infoMsg, setInfoMsg] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setInfoMsg(null)

    if (!isSupabaseConfigured || !supabase) {
      signInDemo(email.trim() || 'voce@financas.com.br')
      return
    }

    setSubmitting(true)
    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        })
        if (error) throw error
      } else {
        const { data, error } = await supabase.auth.signUp({
          email: email.trim(),
          password,
        })
        if (error) throw error
        if (!data.session) {
          setInfoMsg(
            'Cadastro realizado! Verifique seu e-mail para confirmar a conta ou faça login.'
          )
          setMode('login')
        }
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : 'Erro ao autenticar no Supabase.'
      setErrorMsg(msg)
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md bg-card border border-border rounded-2xl shadow-xl p-6 sm:p-8 space-y-6">
        <div className="flex items-center gap-3">
          <div className="h-11 w-11 rounded-xl bg-primary flex items-center justify-center text-primary-foreground shadow-md">
            <Wallet className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">FinançasPro</h1>
            <p className="text-xs text-muted-foreground">
              Controle de débitos, parcelas e projeção mensal
            </p>
          </div>
        </div>

        {!isSupabaseConfigured && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/30 p-3.5 text-xs text-amber-700 dark:text-amber-300 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <AlertCircle className="h-4 w-4 shrink-0" />
              Supabase ainda não configurado no .env.local
            </div>
            <p>
              Você pode entrar agora mesmo usando o armazenamento local do navegador e
              conectar ao Supabase quando desejar.
            </p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-1 p-1 bg-muted rounded-xl text-sm font-medium">
          <button
            type="button"
            onClick={() => setMode('login')}
            className={`py-2 rounded-lg transition ${
              mode === 'login'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Entrar
          </button>
          <button
            type="button"
            onClick={() => setMode('signup')}
            className={`py-2 rounded-lg transition ${
              mode === 'signup'
                ? 'bg-card text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            Criar conta
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              E-mail
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="seu@email.com.br"
              className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Senha
            </label>
            <input
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres"
              className="w-full h-11 px-3.5 rounded-xl bg-background border border-input text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          {errorMsg && (
            <div className="p-3 rounded-xl bg-destructive/10 border border-destructive/30 text-xs text-destructive font-medium">
              {errorMsg}
            </div>
          )}

          {infoMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-600 dark:text-emerald-400 font-medium">
              {infoMsg}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm hover:opacity-95 transition disabled:opacity-50"
          >
            {submitting
              ? 'Processando...'
              : mode === 'login'
                ? 'Entrar na minha conta'
                : 'Cadastrar conta'}
          </button>
        </form>

        <div className="pt-2 border-t border-border">
          <button
            type="button"
            onClick={() => signInDemo(email || 'usuario@financas.com.br')}
            className="w-full h-10 rounded-xl bg-secondary text-secondary-foreground text-xs font-medium hover:bg-secondary/80 transition"
          >
            Acessar Modo Local Instantâneo (Sem configurar banco)
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// MODAL DE GERENCIAMENTO DE CATEGORIAS (EDITÁVEIS)
// ============================================================================
export function CategoriasModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { user } = useAuth()
  const qc = useQueryClient()
  const [novoNome, setNovoNome] = useState('')
  const [novaCor, setNovaCor] = useState('#2563eb')
  const [editId, setEditId] = useState<string | null>(null)
  const [editNome, setEditNome] = useState('')
  const [editCor, setEditCor] = useState('#2563eb')

  const { data: categorias = [] } = useQuery({
    queryKey: ['categorias', user?.id],
    queryFn: () => fetchCategorias(user!.id),
    enabled: Boolean(user && open),
  })

  const createMut = useMutation({
    mutationFn: () =>
      createCategoria(user!.id, { nome: novoNome, cor: novaCor }),
    onSuccess: () => {
      setNovoNome('')
      qc.invalidateQueries({ queryKey: ['categorias'] })
    },
  })

  const updateMut = useMutation({
    mutationFn: (cat: { id: string; nome: string; cor: string }) =>
      updateCategoria(user!.id, cat.id, { nome: cat.nome, cor: cat.cor }),
    onSuccess: () => {
      setEditId(null)
      qc.invalidateQueries({ queryKey: ['categorias'] })
    },
  })

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteCategoria(user!.id, id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['categorias'] })
    },
  })

  if (!open) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div className="bg-card border border-border rounded-2xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <h2 className="font-bold text-base">Categorias</h2>
            <p className="text-xs text-muted-foreground">
              Categorias padrão criadas automaticamente e 100% editáveis
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4 border-b border-border bg-muted/30">
          <form
            onSubmit={(e) => {
              e.preventDefault()
              if (!novoNome.trim()) return
              createMut.mutate()
            }}
            className="flex items-center gap-2"
          >
            <input
              type="color"
              value={novaCor}
              onChange={(e) => setNovaCor(e.target.value)}
              className="h-10 w-12 rounded-lg border border-input bg-background cursor-pointer p-1"
            />
            <input
              type="text"
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Nova categoria (ex: Pets, Investimentos...)"
              className="flex-1 h-10 px-3 rounded-xl bg-background border border-input text-sm"
            />
            <button
              type="submit"
              disabled={!novoNome.trim() || createMut.isPending}
              className="h-10 px-4 rounded-xl bg-primary text-primary-foreground text-xs font-semibold disabled:opacity-50"
            >
              Adicionar
            </button>
          </form>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-2">
          {categorias.map((c: Categoria) => {
            const isEditing = editId === c.id
            return (
              <div
                key={c.id}
                className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-border bg-background/60"
              >
                {isEditing ? (
                  <div className="flex items-center gap-2 flex-1">
                    <input
                      type="color"
                      value={editCor}
                      onChange={(e) => setEditCor(e.target.value)}
                      className="h-8 w-10 rounded cursor-pointer"
                    />
                    <input
                      type="text"
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      className="flex-1 h-8 px-2.5 rounded-lg bg-card border border-input text-sm"
                    />
                    <button
                      onClick={() =>
                        updateMut.mutate({
                          id: c.id,
                          nome: editNome,
                          cor: editCor,
                        })
                      }
                      className="p-1.5 rounded-lg bg-emerald-600 text-white"
                      title="Salvar"
                    >
                      <Check className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => setEditId(null)}
                      className="p-1.5 rounded-lg bg-muted text-muted-foreground"
                      title="Cancelar"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-2.5">
                      <span
                        className="h-3.5 w-3.5 rounded-full shrink-0"
                        style={{ backgroundColor: c.cor }}
                      />
                      <span className="text-sm font-medium">{c.nome}</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => {
                          setEditId(c.id)
                          setEditNome(c.nome)
                          setEditCor(c.cor)
                        }}
                        className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground"
                        title="Editar categoria"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          if (
                            window.confirm(
                              `Excluir a categoria "${c.nome}"? Os lançamentos continuarão existindo sem categoria.`
                            )
                          ) {
                            deleteMut.mutate(c.id)
                          }
                        }}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                        title="Excluir categoria"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================================
// LAYOUT PRINCIPAL (SIDEBAR DESKTOP + BOTTOM NAV MOBILE + MODO ESCURO)
// ============================================================================
const NAV_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/mes', label: 'Mês', icon: Wallet },
  { to: '/projecao', label: 'Projeção', icon: TrendingUp },
  { to: '/parcelamentos', label: 'Parcelamentos', icon: CreditCard },
  { to: '/recorrencias', label: 'Recorrências', icon: Repeat },
  { to: '/calendario', label: 'Calendário', icon: Calendar },
]

const MOBILE_BOTTOM_ITEMS = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard },
  { to: '/mes', label: 'Mês', icon: Wallet },
  { to: '/projecao', label: 'Projeção', icon: TrendingUp },
  { to: '/parcelamentos', label: 'Parcelas', icon: CreditCard },
  { to: '/calendario', label: 'Calendário', icon: Calendar },
]

export function MainShell({
  children,
  onOpenQuickAdd,
}: {
  children: React.ReactNode
  onOpenQuickAdd: () => void
}) {
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [dark, setDark] = useState<boolean>(() => {
    const saved = localStorage.getItem('finances_theme')
    return saved ? saved === 'dark' : true
  })
  const [catModalOpen, setCatModalOpen] = useState(false)

  useEffect(() => {
    const root = document.documentElement
    if (dark) {
      root.classList.add('dark')
      localStorage.setItem('finances_theme', 'dark')
    } else {
      root.classList.remove('dark')
      localStorage.setItem('finances_theme', 'light')
    }
  }, [dark])

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      {/* Menu Lateral no Desktop */}
      <aside className="hidden md:flex md:w-64 lg:w-68 flex-col border-r border-border bg-card/60 shrink-0 select-none">
        <div className="p-5 flex items-center justify-between border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-primary flex items-center justify-center text-primary-foreground font-bold shadow-xs">
              <Wallet className="h-5 w-5" />
            </div>
            <div>
              <span className="font-bold text-base tracking-tight block leading-none">
                FinançasPro
              </span>
              <span className="text-[11px] text-muted-foreground">
                Controle Pessoal R$
              </span>
            </div>
          </div>
          <button
            onClick={() => setDark((d) => !d)}
            className="p-2 rounded-xl hover:bg-muted text-muted-foreground hover:text-foreground transition"
            title={dark ? 'Modo Claro' : 'Modo Escuro'}
          >
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        <div className="p-4 pb-2">
          <button
            onClick={onOpenQuickAdd}
            className="w-full h-11 rounded-xl bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 shadow-md hover:opacity-95 transition"
          >
            <Plus className="h-4 w-4 stroke-[2.5]" />
            Novo Lançamento
          </button>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon
            const active =
              item.to === '/'
                ? location.pathname === '/'
                : location.pathname.startsWith(item.to)
            return (
              <Link
                key={item.to}
                to={item.to}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium transition ${
                  active
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            )
          })}

          <button
            type="button"
            onClick={() => setCatModalOpen(true)}
            className="w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground transition"
          >
            <FolderKanban className="h-4 w-4" />
            Categorias
          </button>
        </nav>

        <div className="p-4 border-t border-border space-y-2">
          <div className="text-xs truncate text-muted-foreground">
            Conectado como{' '}
            <strong className="text-foreground block truncate">
              {user?.email}
            </strong>
          </div>
          <button
            onClick={signOut}
            className="w-full flex items-center justify-center gap-2 h-9 rounded-xl border border-border text-xs font-medium text-muted-foreground hover:text-destructive hover:border-destructive/40 transition"
          >
            <LogOut className="h-3.5 w-3.5" />
            Sair da conta
          </button>
        </div>
      </aside>

      {/* Conteúdo Principal */}
      <div className="flex-1 flex flex-col min-w-0 pb-20 md:pb-0">
        {/* Topbar no Mobile */}
        <header className="md:hidden sticky top-0 z-30 flex items-center justify-between px-4 py-3 bg-card/90 backdrop-blur-md border-b border-border">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-primary flex items-center justify-center text-primary-foreground">
              <Wallet className="h-4 w-4" />
            </div>
            <span className="font-bold text-sm">FinançasPro</span>
          </div>
          <div className="flex items-center gap-1">
            <Link
              to="/recorrencias"
              className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1 ${
                location.pathname.startsWith('/recorrencias')
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              <Repeat className="h-3.5 w-3.5" />
              Fixos
            </Link>
            <button
              onClick={() => setCatModalOpen(true)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
              title="Categorias"
            >
              <FolderKanban className="h-4 w-4" />
            </button>
            <button
              onClick={() => setDark((d) => !d)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
              title="Alternar tema"
            >
              {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              onClick={signOut}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-6xl w-full mx-auto">
          {children}
        </main>
      </div>

      {/* Botão Flutuante "+" Global */}
      <button
        onClick={onOpenQuickAdd}
        aria-label="Novo Lançamento"
        className="fixed right-4 bottom-20 md:right-8 md:bottom-8 z-40 h-14 w-14 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition"
      >
        <Plus className="h-7 w-7 stroke-[2.5]" />
      </button>

      {/* Navegação Inferior no Mobile (Dashboard, Mês, Projeção, Parcelamentos, Calendário) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur-md border-t border-border grid grid-cols-5 h-16 px-1">
        {MOBILE_BOTTOM_ITEMS.map((item) => {
          const Icon = item.icon
          const active =
            item.to === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.to)
          return (
            <Link
              key={item.to}
              to={item.to}
              className={`flex flex-col items-center justify-center gap-1 text-[11px] font-medium transition ${
                active ? 'text-primary font-semibold' : 'text-muted-foreground'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="truncate">{item.label}</span>
            </Link>
          )
        })}
      </nav>

      <CategoriasModal
        open={catModalOpen}
        onClose={() => setCatModalOpen(false)}
      />
    </div>
  )
}

function ProtectedApp() {
  const { user, loading } = useAuth()
  const [searchParams] = useSearchParams()
  const [newModalOpen, setNewModalOpen] = useState(false)
  const [modalYM, setModalYM] = useState<string>(getCurrentYearMonthSaoPaulo())
  const [modalTab, setModalTab] = useState<
    'despesa' | 'receita' | 'parcelamento'
  >('despesa')

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
        Carregando FinançasPro...
      </div>
    )
  }
  if (!user) {
    return <AuthScreen />
  }

  const activeYM = searchParams.get('ym') || getCurrentYearMonthSaoPaulo()

  return (
    <MainShell
      onOpenQuickAdd={() => {
        setModalYM(activeYM)
        setModalTab('despesa')
        setNewModalOpen(true)
      }}
    >
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route
          path="/mes"
          element={
            <MesPage
              onOpenNewModal={(ym) => {
                setModalYM(ym)
                setModalTab('despesa')
                setNewModalOpen(true)
              }}
            />
          }
        />
        <Route path="/projecao" element={<ProjecaoPage />} />
        <Route
          path="/parcelamentos"
          element={
            <ParcelamentosPage
              onOpenNewParcelamento={() => {
                setModalYM(activeYM)
                setModalTab('parcelamento')
                setNewModalOpen(true)
              }}
            />
          }
        />
        <Route path="/recorrencias" element={<RecorrenciasPage />} />
        <Route
          path="/calendario"
          element={
            <CalendarioPage
              onOpenNewModal={(ym) => {
                setModalYM(ym)
                setModalTab('despesa')
                setNewModalOpen(true)
              }}
            />
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <NovoLancamentoModal
        open={newModalOpen}
        onClose={() => setNewModalOpen(false)}
        defaultYearMonth={modalYM}
        defaultTab={modalTab}
      />
    </MainShell>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <ProtectedApp />
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  )
}
