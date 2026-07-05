import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { ErrorState } from '@/components/ui/error-state'
import { Input } from '@/components/ui/input'
import { Section } from '@/components/ui/section'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useI18n } from '@/lib/i18n-context'
import {
  featureState,
  FEATURE_STATE_LABEL,
  FEATURE_STATES,
  FEATURES,
  type FeatureMap,
  type FeatureState,
} from '@/features/org/feature-state'
import { PLAN_LABEL } from '@/features/org/use-org-plan'

import {
  adminApi,
  bytesToGbInput,
  parseCapInput,
  parseStorageGbInput,
  type PlanLimits,
} from './admin-api'
import { useAsync } from './use-async'

export function AdminPlans() {
  const { t } = useI18n()
  const { data, error, loading, reload } = useAsync(adminApi.plans)

  if (loading && !data) {
    return (
      <div className="grid gap-4 md:grid-cols-2">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
    )
  }
  if (error || !data) {
    return (
      <ErrorState
        title={t({ fr: 'Plans indisponibles', en: 'Plans unavailable' })}
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
    <div className="grid items-start gap-4 md:grid-cols-2">
      {data.map((plan) => (
        <PlanEditor key={plan.plan} plan={plan} onSaved={reload} />
      ))}
    </div>
  )
}

function PlanEditor({ plan, onSaved }: { plan: PlanLimits; onSaved: () => void }) {
  const { t } = useI18n()
  const [dossiers, setDossiers] = useState(plan.max_dossiers?.toString() ?? '')
  const [period, setPeriod] = useState<'lifetime' | 'month'>(plan.dossiers_period ?? 'month')
  const [tokens, setTokens] = useState(plan.monthly_ai_tokens?.toString() ?? '')
  const [seats, setSeats] = useState(plan.max_seats?.toString() ?? '')
  const [storageGb, setStorageGb] = useState(bytesToGbInput(plan.max_storage_bytes))
  const [features, setFeatures] = useState<FeatureMap>({ ...plan.features })
  const [busy, setBusy] = useState(false)

  // Nom marketing (barème) + enum technique — le mapping est un piège connu (recette LOT 7).
  const marketing = PLAN_LABEL[plan.plan]

  async function save() {
    const d = parseCapInput(dossiers)
    const tk = parseCapInput(tokens)
    const st = parseCapInput(seats)
    const sto = parseStorageGbInput(storageGb)
    if (d === undefined || tk === undefined || st === undefined || sto === undefined) {
      toast.error(
        t({
          fr: 'Saisie invalide — nombre ≥ 0, ou vide pour illimité.',
          en: 'Invalid input — number ≥ 0, or empty for unlimited.',
        }),
      )
      return
    }
    setBusy(true)
    try {
      await adminApi.setPlanLimits(plan.plan, d, period, tk, st, sto, features)
      toast.success(
        t({ fr: `Plan « ${plan.plan} » mis à jour`, en: `Plan “${plan.plan}” updated` }),
      )
      onSaved()
    } catch (e) {
      toast.error((e as Error).message || t({ fr: 'Échec', en: 'Failed' }))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Section
      title={
        <span className="flex items-center gap-2">
          {marketing ? t(marketing) : <span className="capitalize">{plan.plan}</span>}
          <code className="text-muted-foreground text-xs font-normal">{plan.plan}</code>
        </span>
      }
      description={t({
        fr: 'Vide = illimité. S’applique à toutes les organisations du plan (hors dérogations).',
        en: 'Empty = unlimited. Applies to every organization on the plan (overrides excepted).',
      })}
      actions={
        <Button size="sm" disabled={busy} onClick={() => void save()}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          {busy
            ? t({ fr: 'Enregistrement…', en: 'Saving…' })
            : t({ fr: 'Enregistrer', en: 'Save' })}
        </Button>
      }
    >
      <div className="flex flex-wrap gap-3">
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground text-xs">
            {t({ fr: 'Max dossiers', en: 'Max dossiers' })}
          </span>
          <Input
            inputMode="numeric"
            value={dossiers}
            onChange={(e) => setDossiers(e.target.value)}
            placeholder="∞"
            className="w-28"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground text-xs">
            {t({ fr: 'Période', en: 'Period' })}
          </span>
          <Select value={period} onValueChange={(v) => setPeriod(v as 'lifetime' | 'month')}>
            <SelectTrigger size="sm" className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="month">{t({ fr: 'Par mois', en: 'Per month' })}</SelectItem>
              <SelectItem value="lifetime">{t({ fr: 'À vie', en: 'Lifetime' })}</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground text-xs">
            {t({ fr: 'Tokens IA / mois', en: 'AI tokens / mo' })}
          </span>
          <Input
            inputMode="numeric"
            value={tokens}
            onChange={(e) => setTokens(e.target.value)}
            placeholder="∞"
            className="w-36"
          />
        </label>
        <label className="space-y-1 text-sm">
          <span className="text-muted-foreground text-xs">{t({ fr: 'Sièges', en: 'Seats' })}</span>
          <Input
            inputMode="numeric"
            value={seats}
            onChange={(e) => setSeats(e.target.value)}
            placeholder="∞"
            className="w-24"
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
            placeholder="∞"
            className="w-28"
          />
        </label>
      </div>
      <div className="space-y-1.5">
        <span className="text-muted-foreground text-xs">
          {t({
            fr: 'Fonctionnalités (Masquée / Vitrine / Activée)',
            en: 'Features (Hidden / Preview / Enabled)',
          })}
        </span>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
          {FEATURES.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-2 text-sm">
              <span className="truncate">{t(f.label)}</span>
              <Select
                value={featureState(features, f.key)}
                onValueChange={(v) => setFeatures((s) => ({ ...s, [f.key]: v as FeatureState }))}
              >
                <SelectTrigger size="sm" className="w-28 shrink-0">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {FEATURE_STATES.map((st) => (
                    <SelectItem key={st} value={st}>
                      {t(FEATURE_STATE_LABEL[st])}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>
          ))}
        </div>
      </div>
    </Section>
  )
}
