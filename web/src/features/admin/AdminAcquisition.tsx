import { useMemo, useState } from 'react'
import { Ban, Copy, Inbox, Link2, Plus, TrendingUp } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { EmptyState } from '@/components/ui/empty-state'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Section } from '@/components/ui/section'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useI18n } from '@/lib/i18n-context'

import { adminApi, type DemoStatus } from './admin-api'
import { useAsync } from './use-async'

const STATUS_LABEL: Record<DemoStatus, { fr: string; en: string }> = {
  nouveau: { fr: 'Nouveau', en: 'New' },
  contacte: { fr: 'Contacté', en: 'Contacted' },
  demo_faite: { fr: 'Démo faite', en: 'Demo done' },
  converti: { fr: 'Converti', en: 'Converted' },
  sans_suite: { fr: 'Sans suite', en: 'Closed' },
}
const STATUSES = Object.keys(STATUS_LABEL) as DemoStatus[]

type AcqTab = 'demos' | 'invites' | 'report'

/** Console Acquisition — pipeline des demandes de démo, codes d'invitation des experts,
 * et apport par expert (base de la rémunération « au nombre d'inscrits »). */
export function AdminAcquisition() {
  const { t } = useI18n()
  const [tab, setTab] = useState<AcqTab>('demos')
  const tabs: { key: AcqTab; label: string; icon: typeof Inbox }[] = [
    { key: 'demos', label: t({ fr: 'Demandes de démo', en: 'Demo requests' }), icon: Inbox },
    { key: 'invites', label: t({ fr: 'Invitations', en: 'Invitations' }), icon: Link2 },
    {
      key: 'report',
      label: t({ fr: 'Apport par expert', en: 'Referral report' }),
      icon: TrendingUp,
    },
  ]
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map(({ key, label, icon: Icon }) => (
          <Button
            key={key}
            role="tab"
            aria-selected={tab === key}
            size="sm"
            variant={tab === key ? 'default' : 'outline'}
            onClick={() => setTab(key)}
          >
            <Icon className="size-4" /> {label}
          </Button>
        ))}
      </div>
      {tab === 'demos' ? <DemosTab /> : tab === 'invites' ? <InvitesTab /> : <ReportTab />}
    </div>
  )
}

function LoadingRows() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
      <Skeleton className="h-12 rounded-xl" />
    </div>
  )
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' })
}

// ── Onglet 1 : demandes de démo (pipeline de suivi) ─────────────────────────────────────────
function DemosTab() {
  const { t } = useI18n()
  const { data, error, loading, reload } = useAsync(adminApi.acqDemos)
  const [saving, setSaving] = useState<string | null>(null)

  async function setStatus(id: string, status: DemoStatus) {
    setSaving(id)
    try {
      await adminApi.acqDemoStatus(id, status)
      await reload()
    } catch {
      toast.error(t({ fr: 'Statut non enregistré', en: 'Status not saved' }))
    } finally {
      setSaving(null)
    }
  }

  if (loading && !data) return <LoadingRows />
  if (error || !data) {
    return (
      <ErrorState
        title={t({ fr: 'Demandes indisponibles', en: 'Requests unavailable' })}
        reason={t({
          fr: 'Le serveur est injoignable ou la requête a échoué.',
          en: 'The server is unreachable or the request failed.',
        })}
        action={
          <Button size="sm" variant="outline" onClick={reload}>
            {t({ fr: 'Réessayer', en: 'Retry' })}
          </Button>
        }
      />
    )
  }
  if (data.length === 0) {
    return (
      <EmptyState
        icon={<Inbox />}
        title={t({ fr: 'Aucune demande de démo', en: 'No demo requests' })}
        description={t({
          fr: 'Les demandes du formulaire pharnos.com arrivent ici.',
          en: 'Requests from the pharnos.com form land here.',
        })}
      />
    )
  }
  return (
    <Section
      title={t({ fr: 'Demandes de démo', en: 'Demo requests' })}
      description={t({
        fr: `${data.length} demande(s) — répondez par e-mail, suivez le statut ici.`,
        en: `${data.length} request(s) — reply by email, track status here.`,
      })}
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t({ fr: 'Reçue', en: 'Received' })}</TableHead>
              <TableHead>{t({ fr: 'Contact', en: 'Contact' })}</TableHead>
              <TableHead>{t({ fr: 'Organisation', en: 'Organization' })}</TableHead>
              <TableHead>{t({ fr: 'Pays', en: 'Country' })}</TableHead>
              <TableHead>{t({ fr: 'Statut', en: 'Status' })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((d) => (
              <TableRow key={d.id}>
                <TableCell className="text-muted-foreground whitespace-nowrap">
                  {fmtDate(d.created_at)}
                </TableCell>
                <TableCell>
                  <div className="font-medium">{d.full_name}</div>
                  <a
                    className="text-primary text-xs underline-offset-2 hover:underline"
                    href={`mailto:${d.email}`}
                  >
                    {d.email}
                  </a>
                  <div className="text-muted-foreground text-xs">{d.job_title}</div>
                </TableCell>
                <TableCell>
                  <div>{d.company}</div>
                  <div className="text-muted-foreground text-xs">
                    {d.org_type === 'Autre' && d.org_type_other ? d.org_type_other : d.org_type}
                  </div>
                </TableCell>
                <TableCell className="whitespace-nowrap">{d.country}</TableCell>
                <TableCell>
                  <Select
                    value={d.status}
                    disabled={saving === d.id}
                    onValueChange={(v) => void setStatus(d.id, v as DemoStatus)}
                  >
                    <SelectTrigger
                      className="w-36"
                      size="sm"
                      aria-label={t({ fr: 'Statut', en: 'Status' })}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {t(STATUS_LABEL[s])}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Section>
  )
}

// ── Onglet 2 : codes d'invitation des experts ───────────────────────────────────────────────
function InvitesTab() {
  const { t } = useI18n()
  const { data, error, loading, reload } = useAsync(adminApi.acqInvites)
  const [label, setLabel] = useState('')
  const [maxUses, setMaxUses] = useState('50')
  const [creating, setCreating] = useState(false)

  async function create() {
    const uses = Number(maxUses)
    if (label.trim().length < 1 || !Number.isInteger(uses) || uses < 1 || uses > 10000) {
      toast.error(
        t({ fr: 'Nom requis et quota entre 1 et 10 000', en: 'Name required, quota 1–10,000' }),
      )
      return
    }
    setCreating(true)
    try {
      const row = await adminApi.acqInviteCreate({ label: label.trim(), maxUses: uses })
      toast.success(t({ fr: `Code créé : ${row.code}`, en: `Code created: ${row.code}` }))
      setLabel('')
      await reload()
    } catch (e) {
      toast.error(
        e instanceof Error && e.message.includes('409')
          ? t({ fr: 'Ce code existe déjà', en: 'Code already exists' })
          : t({ fr: 'Création échouée', en: 'Creation failed' }),
      )
    } finally {
      setCreating(false)
    }
  }

  async function revoke(id: string, code: string) {
    try {
      await adminApi.acqInviteRevoke(id)
      toast.success(t({ fr: `${code} révoqué`, en: `${code} revoked` }))
      await reload()
    } catch {
      toast.error(t({ fr: 'Révocation échouée', en: 'Revocation failed' }))
    }
  }

  function copyLink(code: string) {
    void navigator.clipboard.writeText(`https://pharnos.com/i/${code}`).then(
      () => toast.success(t({ fr: 'Lien copié', en: 'Link copied' })),
      () => toast.error(t({ fr: 'Copie impossible', en: 'Copy failed' })),
    )
  }

  if (loading && !data) return <LoadingRows />
  if (error || !data) {
    return (
      <ErrorState
        title={t({ fr: 'Invitations indisponibles', en: 'Invitations unavailable' })}
        reason={t({
          fr: 'Le serveur est injoignable ou la requête a échoué.',
          en: 'The server is unreachable or the request failed.',
        })}
        action={
          <Button size="sm" variant="outline" onClick={reload}>
            {t({ fr: 'Réessayer', en: 'Retry' })}
          </Button>
        }
      />
    )
  }
  return (
    <div className="space-y-4">
      <Section
        title={t({ fr: 'Nouveau code d’expert', en: 'New expert code' })}
        description={t({
          fr: 'Le code est généré depuis le nom (suffixe aléatoire anti-devinette) — lien à partager : pharnos.com/i/CODE.',
          en: 'The code is generated from the name (random anti-guess suffix) — share pharnos.com/i/CODE.',
        })}
      >
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-56 flex-1 space-y-1.5">
            <Label htmlFor="acq-label">
              {t({ fr: 'Nom public de l’expert', en: 'Expert public name' })}
            </Label>
            <Input
              id="acq-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t({ fr: 'Ex. Dr Kouamé', en: 'E.g. Dr Kouame' })}
              maxLength={120}
            />
          </div>
          <div className="w-32 space-y-1.5">
            <Label htmlFor="acq-uses">{t({ fr: 'Utilisations max', en: 'Max uses' })}</Label>
            <Input
              id="acq-uses"
              inputMode="numeric"
              value={maxUses}
              onChange={(e) => setMaxUses(e.target.value)}
            />
          </div>
          <Button onClick={() => void create()} disabled={creating}>
            <Plus className="size-4" /> {t({ fr: 'Créer le code', en: 'Create code' })}
          </Button>
        </div>
      </Section>

      {data.length === 0 ? (
        <EmptyState
          icon={<Link2 />}
          title={t({ fr: 'Aucun code d’invitation', en: 'No invitation codes' })}
          description={t({
            fr: 'Créez un code par expert-ambassadeur — sans code, personne ne peut s’inscrire.',
            en: 'Create one code per ambassador — without a code, nobody can sign up.',
          })}
        />
      ) : (
        <Section title={t({ fr: 'Codes actifs et révoqués', en: 'Active and revoked codes' })}>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t({ fr: 'Code', en: 'Code' })}</TableHead>
                  <TableHead>{t({ fr: 'Expert', en: 'Expert' })}</TableHead>
                  <TableHead>{t({ fr: 'Utilisations', en: 'Uses' })}</TableHead>
                  <TableHead>{t({ fr: 'État', en: 'State' })}</TableHead>
                  <TableHead className="text-right">
                    {t({ fr: 'Actions', en: 'Actions' })}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.map((inv) => {
                  const expired = inv.expires_at !== null && new Date(inv.expires_at) < new Date()
                  const exhausted = inv.used_count >= inv.max_uses
                  const state = inv.revoked_at
                    ? {
                        label: t({ fr: 'Révoqué', en: 'Revoked' }),
                        variant: 'destructive' as const,
                      }
                    : expired
                      ? { label: t({ fr: 'Expiré', en: 'Expired' }), variant: 'secondary' as const }
                      : exhausted
                        ? {
                            label: t({ fr: 'Épuisé', en: 'Exhausted' }),
                            variant: 'secondary' as const,
                          }
                        : { label: t({ fr: 'Actif', en: 'Active' }), variant: 'default' as const }
                  return (
                    <TableRow key={inv.id}>
                      <TableCell className="font-mono text-xs font-semibold">{inv.code}</TableCell>
                      <TableCell>{inv.label}</TableCell>
                      <TableCell className="whitespace-nowrap">
                        {inv.used_count} / {inv.max_uses}
                      </TableCell>
                      <TableCell>
                        <Badge variant={state.variant}>{state.label}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => copyLink(inv.code)}
                          aria-label={t({ fr: 'Copier le lien', en: 'Copy link' })}
                        >
                          <Copy className="size-4" /> {t({ fr: 'Lien', en: 'Link' })}
                        </Button>
                        {inv.revoked_at === null ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="text-destructive"
                            onClick={() => void revoke(inv.id, inv.code)}
                          >
                            <Ban className="size-4" /> {t({ fr: 'Révoquer', en: 'Revoke' })}
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          </div>
        </Section>
      )}
    </div>
  )
}

// ── Onglet 3 : apport par expert (base de rémunération) ─────────────────────────────────────
function ReportTab() {
  const { t } = useI18n()
  const { data, error, loading, reload } = useAsync(adminApi.acqReport)
  const rows = useMemo(() => data?.invites ?? [], [data])

  if (loading && !data) return <LoadingRows />
  if (error || !data) {
    return (
      <ErrorState
        title={t({ fr: 'Rapport indisponible', en: 'Report unavailable' })}
        reason={t({
          fr: 'Le serveur est injoignable ou la requête a échoué.',
          en: 'The server is unreachable or the request failed.',
        })}
        action={
          <Button size="sm" variant="outline" onClick={reload}>
            {t({ fr: 'Réessayer', en: 'Retry' })}
          </Button>
        }
      />
    )
  }
  if (rows.length === 0) {
    return (
      <EmptyState
        icon={<TrendingUp />}
        title={t({ fr: 'Aucun apport à afficher', en: 'Nothing to report yet' })}
        description={t({
          fr: 'Les inscriptions via les codes des experts apparaîtront ici.',
          en: 'Signups via expert codes will appear here.',
        })}
      />
    )
  }
  return (
    <Section
      title={t({ fr: 'Apport par expert', en: 'Referral by expert' })}
      description={t({
        fr: 'Inscriptions = organisations créées avec le code. Actives = au moins un dossier créé (anti-comptes fantômes) — la base recommandée pour la rémunération.',
        en: 'Signups = organizations created with the code. Active = at least one dossier created (anti ghost accounts) — the recommended compensation basis.',
      })}
    >
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t({ fr: 'Expert', en: 'Expert' })}</TableHead>
              <TableHead>{t({ fr: 'Code', en: 'Code' })}</TableHead>
              <TableHead className="text-right">
                {t({ fr: 'Inscriptions', en: 'Signups' })}
              </TableHead>
              <TableHead className="text-right">
                {t({ fr: 'Utilisateurs distincts', en: 'Distinct users' })}
              </TableHead>
              <TableHead className="text-right">
                {t({ fr: 'Orgs actives', en: 'Active orgs' })}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id}>
                <TableCell className="font-medium">
                  {r.label}
                  {r.revoked ? (
                    <Badge className="ml-2" variant="destructive">
                      {t({ fr: 'Révoqué', en: 'Revoked' })}
                    </Badge>
                  ) : null}
                </TableCell>
                <TableCell className="font-mono text-xs">{r.code}</TableCell>
                <TableCell className="text-right tabular-nums">{r.signups}</TableCell>
                <TableCell className="text-right tabular-nums">{r.distinct_users}</TableCell>
                <TableCell className="text-right font-semibold tabular-nums">
                  {r.orgs_active}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </Section>
  )
}
