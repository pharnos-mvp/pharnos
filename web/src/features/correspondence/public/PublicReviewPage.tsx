import { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react'
import {
  Check,
  CircleAlert,
  Download,
  FileText,
  Loader2,
  Lock,
  Paperclip,
  PauseCircle,
  RefreshCw,
  Send,
  X,
  XCircle,
} from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  STATUS_BADGE_CLASSES,
  statusBadgeClass,
  statusLabel,
} from '@/features/correspondence/correspondence-constants'
import { MessageThread } from '@/features/correspondence/MessageThread'
import { activityLabel, countryLabel } from '@/features/workspace/dossier-constants'
import { cn } from '@/lib/utils'
import {
  callShare,
  fileToBase64,
  SHARE_ERROR_MESSAGES,
  type OpenPayload,
  type ReviewAttachmentInput,
  type ShareErrorCode,
} from './review-api'

// PDF.js (lourd) chargé à la demande, uniquement quand le PDF est prêt à s'afficher.
const PdfViewer = lazy(() =>
  import('@/features/workspace/PdfViewer').then((m) => ({ default: m.PdfViewer })),
)

const MAX_FILES = 3
const MAX_FILE_BYTES = 4 * 1024 * 1024
const ACCEPT = '.pdf,.png,.jpg,.jpeg,.webp,.docx'
const REFRESH_MS = 90_000

type Phase = 'loading' | 'password' | 'error' | 'ready'
type Decision = 'accepted' | 'suspended' | 'rejected'

const DECISION_OPTIONS: { value: Decision; label: string; icon: typeof Check }[] = [
  { value: 'accepted', label: 'Accepter', icon: Check },
  { value: 'suspended', label: 'Mettre en suspens', icon: PauseCircle },
  { value: 'rejected', label: 'Rejeter', icon: XCircle },
]

const formatSize = (bytes: number) => {
  const b = Number.isFinite(bytes) && bytes > 0 ? bytes : 0
  return b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} Mo` : `${Math.ceil(b / 1024)} Ko`
}

/**
 * Page publique de review (jalon H) — `/r/{token}`, AUCUN compte requis. Brandée Pharnos.
 * Le reviewer prévisualise/télécharge le Module 1 compilé, rend sa décision
 * (Accepter / Suspendre / Rejeter) avec commentaire et pièces, et dialogue avec l'expéditeur.
 */
export function PublicReviewPage({ token }: { token: string }) {
  const [phase, setPhase] = useState<Phase>('loading')
  const [errorCode, setErrorCode] = useState<ShareErrorCode>('server_error')
  const [data, setData] = useState<OpenPayload | null>(null)
  const [password, setPassword] = useState('')
  const [passwordError, setPasswordError] = useState<string | null>(null)
  const [unlocking, setUnlocking] = useState(false)
  // Mot de passe validé — rejoué sur chaque action (decide/reply/refresh).
  const grantedPassword = useRef<string | undefined>(undefined)

  const [pdfBlob, setPdfBlob] = useState<Blob | null>(null)
  const [pdfFailed, setPdfFailed] = useState(false)
  const pdfObjectUrl = useRef<string | null>(null)

  const [decisionPick, setDecisionPick] = useState<Decision | null>(null)
  const [comment, setComment] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [submitting, setSubmitting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const open = useCallback(
    async (pwd: string | undefined, opts: { silent?: boolean } = {}) => {
      const res = await callShare({ action: 'open', token, password: pwd })
      if (res.ok) {
        grantedPassword.current = pwd
        setData(res.data)
        setPhase('ready')
        return true
      }
      if (opts.silent) return false
      if (res.error === 'password_required') {
        setPhase('password')
      } else if (res.error === 'wrong_password' || res.error === 'rate_limited') {
        setPhase('password')
        setPasswordError(SHARE_ERROR_MESSAGES[res.error])
      } else {
        setErrorCode(res.error)
        setPhase('error')
      }
      return false
    },
    [token],
  )

  useEffect(() => {
    // Chargement initial (fetch on mount) : tous les setState d'`open` surviennent APRÈS un
    // await (jamais synchrones dans le corps de l'effet) — exception légitime à la règle.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void open(undefined)
  }, [open])

  // Récupère le PDF compilé (aperçu + téléchargement) dès que l'URL signée est connue.
  // setState uniquement dans les callbacks async (jamais synchrone dans l'effet) ; en cas de
  // re-signature (refresh), l'aperçu précédent reste affiché jusqu'au nouveau blob.
  useEffect(() => {
    if (!data?.pdfUrl) return
    let cancelled = false
    void fetch(data.pdfUrl)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((blob) => {
        if (cancelled) return
        setPdfBlob(blob)
        setPdfFailed(false)
      })
      .catch(() => {
        if (!cancelled) setPdfFailed(true)
      })
    return () => {
      cancelled = true
    }
  }, [data?.pdfUrl])

  useEffect(
    () => () => {
      if (pdfObjectUrl.current) URL.revokeObjectURL(pdfObjectUrl.current)
    },
    [],
  )

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
        toast.error(`Maximum ${MAX_FILES} pièces par message.`)
        break
      }
      if (f.size > MAX_FILE_BYTES) {
        toast.error(`« ${f.name} » dépasse 4 Mo.`)
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
      toast.error('Choisissez une décision ou écrivez un message.')
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
        toast.error(SHARE_ERROR_MESSAGES[res.error])
        return
      }
      setData(res.data)
      setDecisionPick(null)
      setComment('')
      setFiles([])
      toast.success(decisionPick ? 'Décision transmise à l’expéditeur.' : 'Message envoyé.')
    } finally {
      setSubmitting(false)
    }
  }

  function downloadPdf() {
    if (!pdfBlob || !data) return
    if (pdfObjectUrl.current) URL.revokeObjectURL(pdfObjectUrl.current)
    const url = URL.createObjectURL(pdfBlob)
    pdfObjectUrl.current = url
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.correspondence.productName.replace(/[^\p{L}\p{N}]+/gu, '-')}-module-1.pdf`
    a.click()
  }

  const c = data?.correspondence

  return (
    <div className="bg-background flex min-h-svh flex-col">
      <header className="bg-card/80 sticky top-0 z-10 border-b backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-2">
            <img src="/favicon.svg" alt="" className="size-6" />
            <span className="text-base font-semibold tracking-tight">Pharnos</span>
            <span className="text-muted-foreground hidden text-sm sm:inline">
              · Review de dossier réglementaire
            </span>
          </div>
          {c ? (
            <Badge className={cn('px-2.5 py-0.5', statusBadgeClass(c.status))}>
              {statusLabel(c.status)}
            </Badge>
          ) : null}
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">
        {phase === 'loading' ? (
          <div className="text-muted-foreground flex items-center justify-center gap-2 py-24 text-sm">
            <Loader2 className="size-4 animate-spin" /> Ouverture du dossier…
          </div>
        ) : phase === 'password' ? (
          <div className="mx-auto mt-16 max-w-sm rounded-lg border p-6">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Lock className="size-4" /> Lien protégé par mot de passe
            </div>
            <p className="text-muted-foreground mt-1 text-sm">
              Saisissez le mot de passe communiqué par l’expéditeur.
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
                aria-label="Mot de passe"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {passwordError ? <p className="text-destructive text-sm">{passwordError}</p> : null}
              <Button type="submit" className="w-full" disabled={unlocking || !password.trim()}>
                {unlocking ? <Loader2 className="size-4 animate-spin" /> : null} Accéder au dossier
              </Button>
            </form>
          </div>
        ) : phase === 'error' ? (
          <div className="mx-auto mt-16 max-w-md rounded-lg border p-6 text-center">
            <CircleAlert className="text-muted-foreground mx-auto size-8" />
            <p className="mt-3 text-sm font-medium">{SHARE_ERROR_MESSAGES[errorCode]}</p>
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
                <RefreshCw className="size-4" /> Réessayer
              </Button>
            ) : null}
          </div>
        ) : c ? (
          <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
            {/* Visionneuse du Module 1 compilé */}
            <section className="flex min-h-[60svh] flex-col overflow-hidden rounded-lg border lg:min-h-[calc(100svh-8rem)]">
              <div className="bg-card flex items-center justify-between gap-2 border-b p-2.5">
                <div className="flex min-w-0 items-center gap-2 text-sm">
                  <FileText className="size-4 shrink-0" />
                  <span className="truncate font-medium">
                    Module 1 — {c.productName} ({countryLabel(c.country)})
                  </span>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {formatSize(c.pdfSize)}
                  </span>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="shrink-0"
                  disabled={!pdfBlob}
                  onClick={downloadPdf}
                >
                  <Download className="size-4" /> Télécharger
                </Button>
              </div>
              <div className="bg-muted/30 flex-1 overflow-auto">
                {pdfBlob ? (
                  <Suspense
                    fallback={
                      <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm">
                        <Loader2 className="size-4 animate-spin" /> Préparation de l’aperçu…
                      </div>
                    }
                  >
                    <PdfViewer blob={pdfBlob} />
                  </Suspense>
                ) : pdfFailed ? (
                  <div className="py-16 text-center">
                    <p className="text-muted-foreground text-sm">
                      Aperçu indisponible — le lien de téléchargement reste valable.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => window.open(data?.pdfUrl, '_blank', 'noopener')}
                    >
                      <Download className="size-4" /> Ouvrir le PDF
                    </Button>
                  </div>
                ) : (
                  <div className="text-muted-foreground flex items-center justify-center gap-2 py-16 text-sm">
                    <Loader2 className="size-4 animate-spin" /> Chargement du PDF…
                  </div>
                )}
              </div>
            </section>

            {/* Panneau review : contexte, décision, fil */}
            <aside className="space-y-4">
              <section className="rounded-lg border p-4">
                <h1 className="text-base font-semibold">{c.productName}</h1>
                <dl className="text-muted-foreground mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                  <dt>Pays cible</dt>
                  <dd className="text-foreground">{countryLabel(c.country)}</dd>
                  <dt>Activité</dt>
                  <dd className="text-foreground">{activityLabel(c.activity)}</dd>
                  <dt>Expéditeur</dt>
                  <dd className="text-foreground break-all">{c.senderEmail}</dd>
                  <dt>Envoyé le</dt>
                  <dd className="text-foreground">
                    {new Intl.DateTimeFormat('fr', { dateStyle: 'long' }).format(
                      new Date(c.createdAt),
                    )}
                  </dd>
                </dl>
              </section>

              <section className="rounded-lg border p-4">
                <h2 className="text-sm font-semibold">
                  {c.status === 'in_review' ? 'Votre décision' : 'Réviser la décision / répondre'}
                </h2>
                <div className="mt-3 grid gap-2">
                  {DECISION_OPTIONS.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={decisionPick === value}
                      onClick={() => setDecisionPick(decisionPick === value ? null : value)}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors',
                        decisionPick === value ? STATUS_BADGE_CLASSES[value] : 'hover:bg-muted/60',
                      )}
                    >
                      <Icon className="size-4" /> {label}
                    </button>
                  ))}
                </div>

                <textarea
                  rows={3}
                  className="border-input placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-ring/50 mt-3 w-full rounded-md border bg-transparent px-3 py-2 text-sm shadow-xs outline-none focus-visible:ring-[3px]"
                  placeholder={
                    decisionPick
                      ? 'Commentaire (recommandé)…'
                      : 'Message à l’expéditeur (ou choisissez une décision)…'
                  }
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                />

                {files.length > 0 ? (
                  <ul className="mt-2 space-y-1">
                    {files.map((f, i) => (
                      <li
                        key={i}
                        className="bg-muted/40 flex items-center justify-between gap-2 rounded-md border px-2 py-1 text-xs"
                      >
                        <span className="flex min-w-0 items-center gap-1">
                          <Paperclip className="size-3 shrink-0" />
                          <span className="truncate">{f.name}</span>
                          <span className="text-muted-foreground shrink-0">
                            · {formatSize(f.size)}
                          </span>
                        </span>
                        <button
                          type="button"
                          aria-label={`Retirer ${f.name}`}
                          className="cursor-pointer"
                          onClick={() => setFiles(files.filter((_, j) => j !== i))}
                        >
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}

                <div className="mt-3 flex items-center justify-between gap-2">
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
                    variant="outline"
                    size="sm"
                    disabled={files.length >= MAX_FILES}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    <Paperclip className="size-4" /> Joindre
                  </Button>
                  <Button size="sm" disabled={submitting} onClick={() => void handleSubmit()}>
                    {submitting ? (
                      <Loader2 className="size-4 animate-spin" />
                    ) : (
                      <Send className="size-4" />
                    )}
                    {decisionPick ? 'Envoyer la décision' : 'Envoyer'}
                  </Button>
                </div>
                <p className="text-muted-foreground mt-2 text-xs">
                  PDF, PNG, JPG, WebP, DOCX — 4 Mo max par pièce, {MAX_FILES} pièces.
                </p>
              </section>

              <section className="rounded-lg border p-4">
                <div className="flex items-center justify-between">
                  <h2 className="text-sm font-semibold">Échanges</h2>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label="Actualiser le fil"
                    onClick={() => void open(grantedPassword.current, { silent: true })}
                  >
                    <RefreshCw className="size-4" />
                  </Button>
                </div>
                <div className="mt-3">
                  <MessageThread messages={data?.messages ?? []} viewpoint="recipient" />
                </div>
              </section>
            </aside>
          </div>
        ) : null}
      </main>

      <footer className="text-muted-foreground border-t py-4 text-center text-xs">
        Propulsé par <span className="font-medium">Pharnos</span> — l’OS des affaires réglementaires
        pharmaceutiques UEMOA/CEDEAO.
      </footer>
    </div>
  )
}
