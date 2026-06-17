import { useState } from 'react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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

import { adminApi, bytesToGbInput, gbToBytes, type PlanLimits } from './admin-api'
import { useAsync } from './use-async'

export function AdminPlans() {
  const { t } = useI18n()
  const { data, error, loading, reload } = useAsync(adminApi.plans)

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
    <div className="grid gap-4 md:grid-cols-2">
      {data.map((plan) => (
        <PlanCard key={plan.plan} plan={plan} onSaved={reload} />
      ))}
    </div>
  )
}

function PlanCard({ plan, onSaved }: { plan: PlanLimits; onSaved: () => void }) {
  const { t } = useI18n()
  const [dossiers, setDossiers] = useState(plan.max_dossiers?.toString() ?? '')
  const [period, setPeriod] = useState<'lifetime' | 'month'>(plan.dossiers_period ?? 'month')
  const [tokens, setTokens] = useState(plan.monthly_ai_tokens?.toString() ?? '')
  const [seats, setSeats] = useState(plan.max_seats?.toString() ?? '')
  const [storageGb, setStorageGb] = useState(bytesToGbInput(plan.max_storage_bytes))
  const [features, setFeatures] = useState<FeatureMap>({ ...plan.features })
  const [busy, setBusy] = useState(false)

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

  async function save() {
    setBusy(true)
    try {
      await adminApi.setPlanLimits(
        plan.plan,
        parse(dossiers),
        period,
        parse(tokens),
        parse(seats),
        parseStorage(storageGb),
        features,
      )
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
    <Card>
      <CardHeader>
        <CardTitle className="capitalize">{plan.plan}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
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
            <span className="text-muted-foreground text-xs">
              {t({ fr: 'Sièges', en: 'Seats' })}
            </span>
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
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground text-xs">
            {t({ fr: 'Vide = illimité', en: 'Empty = unlimited' })}
          </span>
          <Button size="sm" disabled={busy} onClick={save}>
            {busy
              ? t({ fr: 'Enregistrement…', en: 'Saving…' })
              : t({ fr: 'Enregistrer', en: 'Save' })}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
