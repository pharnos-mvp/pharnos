import { useState } from 'react'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useI18n } from '@/lib/i18n-context'

import {
  adminApi,
  bytesToGbInput,
  formatBytes,
  formatInt,
  gbToBytes,
  type AdminOrg,
  type PlanTier,
} from './admin-api'
import { useAsync } from './use-async'

const PLAN_TIERS: PlanTier[] = ['free', 'pro', 'team', 'business', 'enterprise']

function capText(override: number | null | undefined, planCap: number | null): string {
  const eff = override ?? planCap
  return eff === null || eff === undefined ? '∞' : formatInt(eff)
}

function storageCapText(override: number | null | undefined, planCap: number | null): string {
  const eff = override ?? planCap
  return eff === null || eff === undefined ? '∞' : formatBytes(eff)
}

export function AdminOrgs() {
  const { t } = useI18n()
  const { data, error, loading, reload } = useAsync(adminApi.orgs)
  const [busy, setBusy] = useState<string | null>(null)
  const [editing, setEditing] = useState<AdminOrg | null>(null)

  async function run(orgId: string, fn: () => Promise<unknown>) {
    setBusy(orgId)
    try {
      await fn()
      reload()
    } catch (e) {
      toast.error((e as Error).message || t({ fr: 'Action échouée', en: 'Action failed' }))
    } finally {
      setBusy(null)
    }
  }

  if (loading && !data) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        {t({ fr: 'Chargement…', en: 'Loading…' })}
      </p>
    )
  }
  if (error || !data) {
    return (
      <div className="flex items-center gap-3 p-4 text-sm">
        <span className="text-muted-foreground">
          {t({ fr: 'Erreur de chargement.', en: 'Failed to load.' })}
        </span>
        <Button size="sm" variant="outline" onClick={reload}>
          {t({ fr: 'Réessayer', en: 'Retry' })}
        </Button>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t({ fr: 'Organisation', en: 'Organization' })}</TableHead>
              <TableHead>{t({ fr: 'Plan', en: 'Plan' })}</TableHead>
              <TableHead className="text-right">
                {t({ fr: 'Tokens IA / mois', en: 'AI tokens / mo' })}
              </TableHead>
              <TableHead className="text-right">{t({ fr: 'Dossiers', en: 'Dossiers' })}</TableHead>
              <TableHead className="text-right">{t({ fr: 'Stockage', en: 'Storage' })}</TableHead>
              <TableHead className="text-right">{t({ fr: 'Membres', en: 'Members' })}</TableHead>
              <TableHead>{t({ fr: 'État', en: 'State' })}</TableHead>
              <TableHead className="text-right">{t({ fr: 'Actions', en: 'Actions' })}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.map((org) => {
              const disabled = org.disabled_at !== null
              return (
                <TableRow key={org.id} className={disabled ? 'opacity-60' : undefined}>
                  <TableCell className="font-medium">{org.name}</TableCell>
                  <TableCell>
                    <Select
                      value={org.plan}
                      onValueChange={(v) =>
                        run(org.id, () => adminApi.setPlan(org.id, v as PlanTier))
                      }
                    >
                      <SelectTrigger size="sm" className="w-32" disabled={busy === org.id}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PLAN_TIERS.map((p) => (
                          <SelectItem key={p} value={p}>
                            {p}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInt(org.ai_tokens_month)}{' '}
                    <span className="text-muted-foreground">
                      / {capText(org.override?.monthly_ai_tokens, org.limits.monthly_ai_tokens)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatInt(org.dossiers)}{' '}
                    <span className="text-muted-foreground">
                      / {capText(org.override?.max_dossiers, org.limits.max_dossiers)}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatBytes(org.storage_bytes)}{' '}
                    <span className="text-muted-foreground">
                      /{' '}
                      {storageCapText(
                        org.override?.max_storage_bytes,
                        org.limits.max_storage_bytes,
                      )}
                    </span>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{formatInt(org.users)}</TableCell>
                  <TableCell>
                    {disabled ? (
                      <Badge variant="destructive">{t({ fr: 'Désactivée', en: 'Disabled' })}</Badge>
                    ) : (
                      <Badge variant="secondary">{t({ fr: 'Active', en: 'Active' })}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditing(org)}
                        disabled={busy === org.id}
                      >
                        {t({ fr: 'Quota', en: 'Quota' })}
                      </Button>
                      {disabled ? (
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={busy === org.id}
                          onClick={() => run(org.id, () => adminApi.setDisabled(org.id, false))}
                        >
                          {t({ fr: 'Réactiver', en: 'Enable' })}
                        </Button>
                      ) : (
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              disabled={busy === org.id}
                            >
                              {t({ fr: 'Désactiver', en: 'Disable' })}
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t({
                                  fr: 'Désactiver cette organisation ?',
                                  en: 'Disable this organization?',
                                })}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t({
                                  fr: `« ${org.name} » et ses membres perdront immédiatement l'accès à toutes leurs données (coupe-circuit). Réversible.`,
                                  en: `“${org.name}” and its members will immediately lose access to all their data (kill-switch). Reversible.`,
                                })}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t({ fr: 'Annuler', en: 'Cancel' })}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() =>
                                  run(org.id, () => adminApi.setDisabled(org.id, true))
                                }
                              >
                                {t({ fr: 'Désactiver', en: 'Disable' })}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>

      {editing ? (
        <QuotaEditor
          org={editing}
          busy={busy === editing.id}
          onClose={() => setEditing(null)}
          onSave={(maxDossiers, tokens, maxStorageBytes) =>
            run(editing.id, async () => {
              await adminApi.setQuota(editing.id, maxDossiers, tokens, maxStorageBytes)
              setEditing(null)
            })
          }
        />
      ) : null}
    </div>
  )
}

function QuotaEditor({
  org,
  busy,
  onClose,
  onSave,
}: {
  org: AdminOrg
  busy: boolean
  onClose: () => void
  onSave: (
    maxDossiers: number | null,
    tokens: number | null,
    maxStorageBytes: number | null,
  ) => void
}) {
  const { t } = useI18n()
  const [dossiers, setDossiers] = useState(org.override?.max_dossiers?.toString() ?? '')
  const [tokens, setTokens] = useState(org.override?.monthly_ai_tokens?.toString() ?? '')
  const [storageGb, setStorageGb] = useState(bytesToGbInput(org.override?.max_storage_bytes))
  const parse = (s: string): number | null => {
    const v = s.trim()
    if (v === '') return null
    const n = Math.floor(Number(v))
    return Number.isFinite(n) && n >= 0 ? n : null
  }
  const parseStorage = (s: string): number | null => {
    const v = s.trim()
    if (v === '') return null
    const n = Number(v)
    return Number.isFinite(n) && n >= 0 ? gbToBytes(n) : null
  }
  return (
    <div className="bg-card space-y-3 rounded-lg border p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">
          {t({ fr: 'Dérogation de quota', en: 'Quota override' })} — {org.name}
        </h3>
        <Button size="sm" variant="ghost" onClick={onClose}>
          ✕
        </Button>
      </div>
      <p className="text-muted-foreground text-xs">
        {t({
          fr: `Laisser vide = défaut du plan « ${org.plan} » (dossiers ${capDefault(org.limits.max_dossiers)}, tokens ${capDefault(org.limits.monthly_ai_tokens)}).`,
          en: `Leave empty = plan “${org.plan}” default (dossiers ${capDefault(org.limits.max_dossiers)}, tokens ${capDefault(org.limits.monthly_ai_tokens)}).`,
        })}
      </p>
      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground text-xs">
            {t({ fr: 'Max dossiers', en: 'Max dossiers' })}
          </span>
          <Input
            inputMode="numeric"
            value={dossiers}
            onChange={(e) => setDossiers(e.target.value)}
            placeholder={t({ fr: 'défaut', en: 'default' })}
            className="w-36"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground text-xs">
            {t({ fr: 'Tokens IA / mois', en: 'AI tokens / mo' })}
          </span>
          <Input
            inputMode="numeric"
            value={tokens}
            onChange={(e) => setTokens(e.target.value)}
            placeholder={t({ fr: 'défaut', en: 'default' })}
            className="w-44"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground text-xs">
            {t({ fr: 'Stockage (Go)', en: 'Storage (GB)' })}
          </span>
          <Input
            inputMode="decimal"
            value={storageGb}
            onChange={(e) => setStorageGb(e.target.value)}
            placeholder={t({ fr: 'défaut', en: 'default' })}
            className="w-32"
          />
        </label>
        <Button
          size="sm"
          disabled={busy}
          onClick={() => onSave(parse(dossiers), parse(tokens), parseStorage(storageGb))}
        >
          {busy
            ? t({ fr: 'Enregistrement…', en: 'Saving…' })
            : t({ fr: 'Enregistrer', en: 'Save' })}
        </Button>
      </div>
    </div>
  )
}

function capDefault(n: number | null): string {
  return n === null ? '∞' : formatInt(n)
}
