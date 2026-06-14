import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  ChevronRight,
  CircleAlert,
  Download,
  FileText,
  Loader2,
  Lock,
  Maximize2,
  MessagesSquare,
  Minimize2,
  Paperclip,
  PauseCircle,
  RefreshCw,
  Send,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { LangSwitch } from '@/components/layout/LangSwitch'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  STATUS_BADGE_CLASSES,
  statusBadgeClass,
  statusLabel,
} from '@/features/correspondence/correspondence-constants'
import { autoGrow } from '@/features/correspondence/auto-grow'
import { ConversationAvatar } from '@/features/correspondence/correspondence-avatar'
import { MessageThread } from '@/features/correspondence/MessageThread'
import '@/features/correspondence/correspondence-chat.css'
import { activityLabel, countryLabel } from '@/features/workspace/dossier-constants'
import { useI18n, type Lang } from '@/lib/i18n-context'
import { cn } from '@/lib/utils'
import {
  callShare,
  fileToBase64,
  shareErrorMessage,
  type OpenPayload,
  type ReviewAttachmentInput,
  type ShareErrorCode,
} from './review-api'

// PDF.js (lourd) chargé à la demande, uniquement quand l'aperçu est prêt à s'afficher.
const PdfViewer = lazy(() =>
  import('@/features/workspace/PdfViewer').then((m) => ({ default: m.PdfViewer })),
)

const MAX_FILES = 3
const MAX_FILE_BYTES = 4 * 1024 * 1024
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.docx'
const REFRESH_MS = 90_000
// URL signée TTL 1 h → rotation de l'URL d'aperçu à 40 min (marge avant expiration).
const VIEWER_URL_MAX_AGE_MS = 40 * 60_000

type Phase = 'loading' | 'password' | 'error' | 'ready' | 'done'
type Decision = 'accepted' | 'suspended' | 'rejected'

const DECISION_OPTIONS: {
  value: Decision
  label: { fr: string; en: string }
  icon: typeof Check
}[] = [
  { value: 'accepted', label: { fr: 'Accepter', en: 'Accept' }, icon: Check },
  { value: 'suspended', label: { fr: 'Suspendre', en: 'Suspend' }, icon: PauseCircle },
  { value: 'rejected', label: { fr: 'Rejeter', en: 'Reject' }, icon: XCircle },
]

// Pills de décision toujours colorées (mockup) ; remplies quand sélectionnées (STATUS_BADGE).
const DECISION_PILL: Record<Decision, string> = {
  accepted:
    'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-300 dark:hover:bg-emerald-950',
  suspended:
    'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-300 dark:hover:bg-amber-950',
  rejected:
    'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-300 dark:hover:bg-red-950',
}

const formatSize = (bytes: number, lang: Lang) => {
  const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  const mb = lang === 'en' ? 'MB' : 'Mo'
  const kb = lang === 'en' ? 'KB' : 'Ko'
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} ${mb}` : `${Math.ceil(b / 1024)} ${kb}`
}

const dtLocale = (lang: Lang) => (lang === 'en' ? 'en-GB' : 'fr')

/** Texte du filigrane reviewer (aperçu canvas + PDF téléchargé) — traçabilité L1. */
const watermarkText = (c: { recipientEmail: string }, at: Date, lang: Lang) =>
  `${c.recipientEmail} · ${new Intl.DateTimeFormat(dtLocale(lang), { dateStyle: 'short', timeStyle: 'short' }).format(at)}`

/**
 * Page publique de review (jalon H, layout v2) — `/r/{token}`, AUCUN compte requis.
 * L'aperçu PDF occupe l'écran (streaming HTTP Range : première page en ~centaines de Ko) ;
 * le panneau review (contexte, décision, fil) est un TIROIR collé au bord droit, repliable
 * via une languette (même geste que les panneaux du montage CTD), overlay plein écran en mobile.
 * Bilingue : le reviewer (anonyme) choisit sa langue via le sélecteur de l'en-tête (défaut FR).
 */
export function PublicReviewPage({ token }: { token: string }) {
  const { t, lang } = useI18n()
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorCode, setErrorCode] = useState<ShareErrorCode>('server_error')
  const [data, setData] = useState<OpenPayload | null>(null)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  // Mot de passe validé — rejoué sur chaque action (decide/reply/refresh).
  const grantedPassword = useRef<string | undefined>(undefined)

  // URL d'aperçu STABLE : chaque `open` renvoie une nouvelle URL signée — la passer telle
  // quelle remonterait le viewer (perte du scroll) à chaque refresh silencieux (90 s). On ne
  // la fait tourner qu'à l'approche de l'expiration (TTL 1 h → rotation à 40 min).
  const [viewerUrl, setViewerUrl] = useState<string | null>(null)
  const viewerUrlAt = useRef(0)
  // Horodatage du filigrane FIGÉ à l'ouverture de la session : une string stable — un texte
  // recalculé à chaque rendu (wall-clock) changerait la prop `watermark` du viewer et
  // déclencherait un re-téléchargement complet + perte du scroll à chaque poll.
  const [openedAt] = useState(() => new Date())

  // Vue du panneau correspondance (mockup CEO) : fermé (PDF plein + bouton « Correspondance »),
  // docké (à droite du PDF), plein écran (recouvre le PDF, monté derrière → streaming préservé).
  const [panelView, setPanelView] = useState<'closed' | 'half' | 'full'>('closed')
  const panelOpen = panelView !== 'closed'
  const reviewBoxRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<HTMLTextAreaElement>(null)

  const [downloading, setDownloading] = useState(false)

  const [decisionPick, setDecisionPick] = useState<Decision | null>(null)
  const [comment, setComment] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  // Après décision : le lien a-t-il été auto-révoqué (écran terminal véridique) ?
  const [linkClosed, setLinkClosed] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  const open = useCallback(
    async (pwd: string | undefined, opts: { silent?: boolean } = {}) => {
      const res = await callShare({ action: 'open', token, password: pwd, silent: opts.silent })
      if (res.ok) {
        grantedPassword.current = pwd
        setData(res.data)
        setViewerUrl((current) => {
          if (current && Date.now() - viewerUrlAt.current < VIEWER_URL_MAX_AGE_MS) return current
          viewerUrlAt.current = Date.now()
          return res.data.pdfUrl
        })
        setPhase('ready')
        return true
      }
      if (opts.silent) return false
      if (res.error === 'password_required') {
        setPhase('password')
      } else if (res.error === 'wrong_password' || res.error === 'rate_limited') {
        setPhase('password')
        setPasswordError(shareErrorMessage(res.error, lang))
      } else {
        setErrorCode(res.error)
        setPhase('error')
      }
      return false
    },
    [token, lang],
  )

  useEffect(() => {
    // Chargement initial (fetch on mount) : tous les setState d'`open` surviennent APRÈS un
    // await (jamais synchrones dans le corps de l'effet) — exception légitime à la règle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void open(undefined)
  }, [open])

  // Auto-scroll en bas du fil (WhatsApp) à l'ouverture et à chaque nouveau message.
  const messageCount = data?.messages?.length ?? 0
  useEffect(() => {
    const el = threadRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [phase, messageCount])

  // Composeur auto-extensible : hauteur max = moitié de la boîte (recalcul si la taille change).
  useEffect(() => {
    autoGrow(composerRef.current, (reviewBoxRef.current?.clientHeight ?? 480) / 2)
  }, [comment, panelView, phase])

  // Échap : plein écran → docké, docké → fermé (pas de dropdown Radix ici → aucun conflit).
  useEffect(() => {
    if (!panelOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPanelView((v) => (v === 'full' ? 'half' : 'closed'))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [panelOpen])

  // Rafraîchissement périodique discret (réponses du labo) — pause quand l'onglet est masqué.
  useEffect(() => {
    if (phase !== 'ready') return
    const tick = () => {
      if (document.visibilityState === 'visible') {
        void open(grantedPassword.current, { silent: true })
      }
    }
    const id = setInterval(tick, REFRESH_MS)
    return () => clearInterval(id)
  }, [phase, open])

  async function handleUnlock() {
    if (!password.trim()) return
    setUnlocking(true)
    setPasswordError(null)
    const ok = await open(password)
    if (ok) setPassword('')
    setUnlocking(false)
  }

  function handlePickFiles(picked: FileList | null) {
    if (!picked) return
    const next = [...files]
    for (const f of picked) {
      if (next.length >= MAX_FILES) {
        toast.error(
          t({
            fr: `Maximum ${MAX_FILES} pièces par message.`,
            en: `Maximum ${MAX_FILES} files per message.`,
          }),
        )
        break
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(t({ fr: `« ${f.name} » dépasse 4 Mo.`, en: `“${f.name}” exceeds 4 MB.` }))
        continue
      }
      next.push(f)
    }
    setFiles(next)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function handleSubmit() {
    const body = comment.trim()
    if (!decisionPick && !body && files.length === 0) {
      toast.error(
        t({
          fr: 'Choisissez une décision ou écrivez un message.',
          en: 'Choose a decision or write a message.',
        }),
      )
      return
    }
    setSubmitting(true)
    try {
      let attachments: ReviewAttachmentInput[] | undefined
      if (files.length > 0) {
        attachments = await Promise.all(
          files.map(async (f) => ({
            name: f.name,
            mime: f.type,
            dataBase64: await fileToBase64(f),
          })),
        )
      }
      const res = await callShare({
        action: decisionPick ? 'decide' : 'reply',
        token,
        password: grantedPassword.current,
        decision: decisionPick ?? undefined,
        body,
        attachments,
      })
      if (!res.ok) {
        toast.error(shareErrorMessage(res.error, lang))
        return
      }
      setData(res.data)
      const wasDecision = decisionPick !== null
      setDecisionPick(null)
      setComment('')
      setFiles([])
      if (wasDecision) {
        // Une DÉCISION clôt le tour de review : écran terminal. Selon l'option de
        // l'expéditeur, le lien reste valide (retour à l'échange) ou vient d'être
        // auto-révoqué — l'écran dit la vérité. Un simple message de chat ne ferme
        // pas la page (aller-retour type WhatsApp).
        setLinkClosed(res.data.linkRevoked === true)
        setPhase('done')
      } else {
        toast.success(t({ fr: 'Message envoyé.', en: 'Message sent.' }))
      }
    } finally {
      setSubmitting(false)
    }
  }

  /** Téléchargement à la demande (l'aperçu streame par Range — on ne télécharge le fichier
   *  complet QUE sur ce clic), filigrané au nom du reviewer (L1 — traçabilité). */
  async function downloadPdf() {
    if (!data) return
    setDownloading(true)
    try {
      const r = await fetch(data.pdfUrl)
      if (!r.ok) throw new Error(String(r.status))
      const { watermarkPdfBlob } = await import('./watermark')
      // Le fichier téléchargé porte l'heure RÉELLE du téléchargement (pas une prop de rendu).
      const blob = await watermarkPdfBlob(
        await r.blob(),
        watermarkText(data.correspondence, new Date(), lang),
      )
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${data.correspondence.productName.replace(/[^\p{L}\p{N}]+/gu, '-')}-module-1.pdf`
      a.click()
      setTimeout(() => URL.revokeObjectURL(url), 30_000)
    } catch {
      toast.error(
        t({
          fr: 'Téléchargement impossible — réessayez (le lien d’aperçu expire après 1 h).',
          en: 'Download failed — try again (the preview link expires after 1 h).',
        }),
      )
    } finally {
      setDownloading(false)
    }
  }

  const c = data?.correspondence

  // Pills de décision (réutilisées : sidebar desktop + repli mobile au-dessus du composeur).
  const decisionPills = (
    <div className="grid grid-cols-3 gap-1.5 md:grid-cols-1">
      {DECISION_OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={decisionPick === value}
          onClick={() => setDecisionPick(decisionPick === value ? null : value)}
          className={cn(
            'flex cursor-pointer items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors md:justify-start',
            decisionPick === value ? STATUS_BADGE_CLASSES[value] : DECISION_PILL[value],
          )}
        >
          <Icon className="size-3.5" /> {t(label)}
        </button>
      ))}
    </div>
  )

  const reviewPanel = c ? (
    <div ref={reviewBoxRef} className="bg-card flex h-full flex-col">
      {/* Bandeau de contrôles fenêtre (mockup) : réduire/agrandir + fermer. */}
      <div className="flex h-10 shrink-0 items-center justify-end gap-1 border-b px-2">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t({ fr: 'Actualiser le fil', en: 'Refresh the thread' })}
          onClick={() => void open(grantedPassword.current, { silent: true })}
        >
          <RefreshCw className="size-4" />
        </Button>
        {panelView === 'full' ? (
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden lg:inline-flex"
            aria-label={t({ fr: 'Réduire la fenêtre', en: 'Minimize window' })}
            onClick={() => setPanelView('half')}
          >
            <Minimize2 className="size-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon-sm"
            className="hidden lg:inline-flex"
            aria-label={t({ fr: 'Agrandir la fenêtre', en: 'Maximize window' })}
            onClick={() => setPanelView('full')}
          >
            <Maximize2 className="size-4" />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t({ fr: 'Fermer la correspondance', en: 'Close correspondence' })}
          onClick={() => setPanelView('closed')}
        >
          <X className="size-4" />
        </Button>
      </div>

      {/* DEUX VOLETS : sidebar (contexte + décision) | chat (en-tête + fil + composeur) */}
      <div className="flex min-h-0 flex-1">
        {/* SIDEBAR (desktop) — infos dossier + décision (mockup) */}
        <aside className="hidden w-[270px] shrink-0 flex-col overflow-auto border-r md:flex">
          <div className="border-b p-4">
            <h1 className="text-base font-semibold">{c.productName}</h1>
            <dl className="text-muted-foreground mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-xs">
              <dt>{t({ fr: 'Pays cible', en: 'Target country' })}</dt>
              <dd className="text-foreground">{countryLabel(c.country, lang)}</dd>
              <dt>{t({ fr: 'Activité', en: 'Activity' })}</dt>
              <dd className="text-foreground">{activityLabel(c.activity, lang)}</dd>
              <dt>{t({ fr: 'Expéditeur', en: 'Sender' })}</dt>
              <dd className="text-foreground break-all">{c.senderEmail}</dd>
              <dt>{t({ fr: 'Envoyé le', en: 'Sent on' })}</dt>
              <dd className="text-foreground">
                {new Intl.DateTimeFormat(dtLocale(lang), { dateStyle: 'long' }).format(
                  new Date(c.createdAt),
                )}
              </dd>
              {c.expiresAt ? (
                <>
                  <dt>{t({ fr: 'Valable', en: 'Valid' })}</dt>
                  <dd className="text-foreground">
                    {t({ fr: 'jusqu’au', en: 'until' })}{' '}
                    {new Intl.DateTimeFormat(dtLocale(lang), { dateStyle: 'medium' }).format(
                      new Date(c.expiresAt),
                    )}
                  </dd>
                </>
              ) : null}
            </dl>
          </div>
          <div className="p-4">
            <div className="text-muted-foreground mb-2 text-xs font-semibold">
              {c.status === 'in_review'
                ? t({ fr: 'Votre décision', en: 'Your decision' })
                : t({ fr: 'Réviser la décision', en: 'Review the decision' })}
            </div>
            {decisionPills}
          </div>
        </aside>

        {/* CHAT — en-tête correspondant + fil + composeur */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="bg-card flex h-14 shrink-0 items-center gap-2.5 border-b px-3">
            <ConversationAvatar email={c.senderEmail} />
            <div className="min-w-0">
              <div className="truncate text-sm font-semibold">{c.senderEmail}</div>
              <div className="text-muted-foreground truncate text-xs">
                {statusLabel(c.status, lang)}
              </div>
            </div>
          </div>

          <div ref={threadRef} className="wa-pane flex-1 overflow-auto p-3">
            {/* Pas de handler : pièces signées via « Ouvrir » (pas de bouton mort côté reviewer). */}
            <MessageThread messages={data?.messages ?? []} viewpoint="recipient" />
          </div>

          {/* Composeur (et, en mobile, les pills de décision repliées au-dessus). */}
          <div className="bg-card space-y-2 border-t p-2.5">
            <div className="md:hidden">{decisionPills}</div>

            {files.length > 0 ? (
              <ul className="space-y-1">
                {files.map((f, i) => (
                  <li
                    key={i}
                    className="bg-muted/40 flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs"
                  >
                    <span className="flex min-w-0 items-center gap-1">
                      <Paperclip className="size-3 shrink-0" />
                      <span className="truncate">{f.name}</span>
                      <span className="text-muted-foreground shrink-0">
                        · {formatSize(f.size, lang)}
                      </span>
                    </span>
                    <button
                      type="button"
                      aria-label={t({ fr: `Retirer ${f.name}`, en: `Remove ${f.name}` })}
                      className="cursor-pointer"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                    >
                      <X className="size-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}

            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept={ACCEPT}
                className="hidden"
                onChange={(e) => handlePickFiles(e.target.files)}
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-10 shrink-0 rounded-full"
                aria-label={t({ fr: 'Joindre une pièce', en: 'Attach a file' })}
                disabled={files.length >= MAX_FILES}
                onClick={() => fileInputRef.current?.click()}
              >
                <Paperclip className="size-4" />
              </Button>
              <textarea
                ref={composerRef}
                rows={1}
                className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 min-h-10 flex-1 resize-none rounded-2xl border bg-transparent px-4 py-2.5 text-sm outline-none focus-visible:ring-[3px]"
                placeholder={
                  decisionPick
                    ? t({ fr: 'Commentaire (recommandé)…', en: 'Comment (recommended)…' })
                    : t({ fr: 'Écrivez un message…', en: 'Write a message…' })
                }
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
              <Button
                size="icon"
                className="size-10 shrink-0 rounded-full"
                disabled={submitting}
                aria-label={
                  decisionPick
                    ? t({ fr: 'Envoyer la décision', en: 'Send the decision' })
                    : t({ fr: 'Envoyer', en: 'Send' })
                }
                onClick={() => void handleSubmit()}
              >
                {submitting ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Send className="size-4" />
                )}
              </Button>
            </div>
            <p className="text-muted-foreground text-[11px]">
              {decisionPick
                ? t({
                    fr: 'Décision sélectionnée — ajoutez un commentaire (optionnel) puis Envoyer.',
                    en: 'Decision selected — add a comment (optional) then Send.',
                  })
                : t({
                    fr: `PDF, PNG, JPG, WebP, DOCX — 4 Mo max par pièce, ${MAX_FILES} pièces.`,
                    en: `PDF, PNG, JPG, WebP, DOCX — 4 MB max per file, ${MAX_FILES} files.`,
                  })}
            </p>
          </div>
        </section>
      </div>
    </div>
  ) : null

  return (
    <div className="bg-background flex h-svh flex-col">
      <header className="bg-card/80 z-20 border-b backdrop-blur">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-6" />
            <span className="text-base font-semibold tracking-tight">Pharnos</span>
            <span className="text-muted-foreground hidden text-sm sm:inline">
              · {t({ fr: 'Review de dossier réglementaire', en: 'Regulatory dossier review' })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {c ? (
              <Badge className={cn('px-2.5 py-0.5', statusBadgeClass(c.status))}>
                {statusLabel(c.status, lang)}
              </Badge>
            ) : null}
            <LangSwitch />
          </div>
        </div>
      </header>

      {phase === 'loading' ? (
        <div className="text-muted-foreground flex flex-1 items-center justify-center gap-2 text-sm">
          <Loader2 className="size-4 animate-spin" />{' '}
          {t({ fr: 'Ouverture du dossier…', en: 'Opening the dossier…' })}
        </div>
      ) : phase === 'password' ? (
        <main className="flex-1 overflow-auto px-4">
          <div className="mx-auto mt-16 max-w-sm rounded-lg border p-6">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Lock className="size-4" />{' '}
              {t({ fr: 'Lien protégé par mot de passe', en: 'Password-protected link' })}
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              {t({
                fr: 'Saisissez le mot de passe communiqué par l’expéditeur.',
                en: 'Enter the password provided by the sender.',
              })}
            </p>
            <form
              className="mt-4 space-y-3"
              onSubmit={(e) => {
                e.preventDefault()
                void handleUnlock()
              }}
            >
              <Input
                type="password"
                autoFocus
                aria-label={t({ fr: 'Mot de passe', en: 'Password' })}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {passwordError ? <p className="text-destructive text-sm">{passwordError}</p> : null}
              <Button type="submit" className="w-full" disabled={unlocking || !password.trim()}>
                {unlocking ? <Loader2 className="size-4 animate-spin" /> : null}{' '}
                {t({ fr: 'Accéder au dossier', en: 'Access the dossier' })}
              </Button>
            </form>
          </div>
        </main>
      ) : phase === 'error' ? (
        <main className="flex-1 overflow-auto px-4">
          <div className="mx-auto mt-16 max-w-md rounded-lg border p-6 text-center">
            <CircleAlert className="text-muted-foreground mx-auto size-8" />
            <p className="mt-3 text-sm font-medium">{shareErrorMessage(errorCode, lang)}</p>
            {errorCode !== 'invalid' && errorCode !== 'revoked' ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-4"
                onClick={() => {
                  setPhase('loading')
                  void open(grantedPassword.current)
                }}
              >
                <RefreshCw className="size-4" /> {t({ fr: 'Réessayer', en: 'Retry' })}
              </Button>
            ) : null}
          </div>
        </main>
      ) : phase === 'done' && c ? (
        <main className="flex flex-1 items-center justify-center overflow-auto px-4">
          <div className="max-w-md py-10 text-center">
            <div className="bg-muted mx-auto grid size-14 place-items-center rounded-full">
              <Check className="size-7 text-emerald-600 dark:text-emerald-400" />
            </div>
            <h1 className="mt-4 text-lg font-semibold">
              {t({ fr: 'Merci d’avoir répondu.', en: 'Thank you for your response.' })}
            </h1>
            <p className="text-muted-foreground mt-2 text-sm">
              {t({ fr: 'Votre décision —', en: 'Your decision —' })}{' '}
              <Badge className={cn('align-middle', statusBadgeClass(c.status))}>
                {statusLabel(c.status, lang)}
              </Badge>{' '}
              {t({ fr: '— a été transmise à', en: '— has been sent to' })}{' '}
              <span className="font-medium">{c.senderEmail}</span>.
            </p>
            <p className="text-muted-foreground mt-3 text-sm">
              {linkClosed
                ? t({
                    fr: 'Vous pouvez fermer cette page. Ce lien est maintenant clôturé — si l’expéditeur souhaite poursuivre l’échange, il vous transmettra un nouveau lien par e-mail.',
                    en: 'You can close this page. This link is now closed — if the sender wishes to continue the exchange, they will send you a new link by e-mail.',
                  })
                : t({
                    fr: 'Vous pouvez fermer cette page. Si l’expéditeur vous répond ou met le dossier à jour, vous serez prévenu par e-mail — ce même lien vous ramènera à l’échange complet.',
                    en: 'You can close this page. If the sender replies or updates the dossier, you will be notified by e-mail — this same link will bring you back to the full exchange.',
                  })}
            </p>
          </div>
        </main>
      ) : c ? (
        <main className="relative flex min-h-0 flex-1">
          {/* Visionneuse plein écran — barre d'en-tête FIGÉE (hors zone de scroll) */}
          <section className="flex min-w-0 flex-1 flex-col">
            <div className="bg-card flex shrink-0 items-center justify-between gap-2 border-b p-2.5">
              <div className="flex min-w-0 items-center gap-2 text-sm">
                <FileText className="size-4 shrink-0" />
                <span className="truncate font-medium">
                  Module 1 — {c.productName} ({countryLabel(c.country, lang)})
                </span>
                <span className="text-muted-foreground shrink-0 text-xs">
                  {formatSize(c.pdfSize, lang)}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={downloading}
                  onClick={() => void downloadPdf()}
                >
                  {downloading ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Download className="size-4" />
                  )}
                  {t({ fr: 'Télécharger', en: 'Download' })}
                </Button>
                {/* État FERMÉ (mockup) : bouton « Correspondance » + nombre d'échanges. */}
                {!panelOpen ? (
                  <Button size="sm" className="relative" onClick={() => setPanelView('half')}>
                    <MessagesSquare className="size-4" />{' '}
                    {t({ fr: 'Correspondance', en: 'Correspondence' })}
                    {messageCount > 0 ? (
                      <span className="bg-primary-foreground text-primary absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full text-[11px] font-bold">
                        {messageCount > 99 ? '99+' : messageCount}
                      </span>
                    ) : null}
                  </Button>
                ) : null}
              </div>
            </div>
            <div className="flex min-h-0 flex-1 flex-col">
              <Suspense
                fallback={
                  <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm">
                    <Loader2 className="size-4 animate-spin" />{' '}
                    {t({ fr: 'Préparation de l’aperçu…', en: 'Preparing the preview…' })}
                  </div>
                }
              >
                {/* Streaming par Range : la 1re page s'affiche sans télécharger le fichier entier. */}
                {viewerUrl ? (
                  <PdfViewer
                    url={viewerUrl}
                    size={c.pdfSize}
                    watermark={watermarkText(c, openedAt, lang)}
                  />
                ) : null}
              </Suspense>
            </div>
          </section>

          {/* Tiroir review (desktop ≥ lg) : DOCKÉ (half, large : min(840px,47%)/560px) ou
              PLEIN ÉCRAN (full, recouvre le PDF monté derrière → streaming préservé). */}
          {panelOpen ? (
            <aside
              className={cn(
                'bg-card hidden overflow-hidden lg:block',
                panelView === 'full'
                  ? 'fixed inset-0 z-40'
                  : 'relative w-[min(840px,47%)] min-w-[560px] shrink-0 border-l shadow-[-12px_0_34px_rgba(0,0,0,.18)]',
              )}
              aria-label={t({ fr: 'Panneau de review', en: 'Review panel' })}
              role={panelView === 'full' ? 'dialog' : undefined}
              aria-modal={panelView === 'full' ? true : undefined}
            >
              {/* Languette de repli (half) — sur le bord intérieur, ferme le panneau. */}
              {panelView === 'half' ? (
                <button
                  type="button"
                  aria-label={t({ fr: 'Fermer la correspondance', en: 'Close correspondence' })}
                  onClick={() => setPanelView('closed')}
                  className="bg-card text-muted-foreground hover:bg-accent absolute top-1/2 -left-3 z-20 grid h-12 w-6 -translate-y-1/2 cursor-pointer place-items-center rounded-lg border shadow-md"
                >
                  <ChevronRight className="size-4" />
                </button>
              ) : null}
              <div className="h-full w-full">{reviewPanel}</div>
            </aside>
          ) : null}

          {/* Mobile (< lg) : overlay plein écran quand ouvert. */}
          {panelOpen ? <div className="fixed inset-0 z-40 lg:hidden">{reviewPanel}</div> : null}
        </main>
      ) : null}

      <footer className="text-muted-foreground shrink-0 border-t py-2.5 text-center text-xs">
        {t({ fr: 'Propulsé par', en: 'Powered by' })} <span className="font-medium">Pharnos</span> —{' '}
        {t({
          fr: 'l’OS des affaires réglementaires pharmaceutiques UEMOA/CEDEAO.',
          en: 'the OS for pharmaceutical regulatory affairs in UEMOA/ECOWAS.',
        })}
      </footer>
    </div>
  )
}
