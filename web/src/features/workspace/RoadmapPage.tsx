import { useLiveQuery } from 'dexie-react-hooks'
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Clock,
  Coins,
  FileCheck2,
  FlaskConical,
} from 'lucide-react'
import { useNavigate, useParams } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import { useI18n } from '@/lib/i18n-context'
import { activityLabel, countryLabel, formatLabel } from './dossier-constants'
import { getDossier } from './dossier-repository'
import { agencyFor } from './roadmap-data'
import type { ReactNode } from 'react'

export function RoadmapPage() {
  const { t, lang } = useI18n()
  const { dossierId } = useParams()
  const navigate = useNavigate()
  const dossier = useLiveQuery(
    async () => (dossierId ? ((await getDossier(dossierId)) ?? null) : null),
    [dossierId],
  )

  if (dossier === undefined) {
    return (
      <p className="text-muted-foreground p-4 text-sm">
        {t({ fr: 'Chargement…', en: 'Loading…' })}
      </p>
    )
  }
  if (dossier === null) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground text-sm">
          {t({ fr: 'Dossier introuvable.', en: 'Dossier not found.' })}
        </p>
        <Button variant="ghost" className="mt-2 -ml-2" onClick={() => navigate('/workspace')}>
          <ArrowLeft /> {t({ fr: 'Retour aux dossiers', en: 'Back to dossiers' })}
        </Button>
      </div>
    )
  }

  const agency = agencyFor(dossier.country)

  return (
    <section className="mx-auto max-w-3xl">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4 -ml-2"
        onClick={() => navigate('/workspace')}
      >
        <ArrowLeft /> {t({ fr: 'Dossiers', en: 'Dossiers' })}
      </Button>

      <h1 className="text-2xl font-semibold tracking-tight">
        {t({ fr: 'Roadmap réglementaire', en: 'Regulatory roadmap' })}
      </h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {dossier.productName} · {activityLabel(dossier.activity, lang)} ·{' '}
        {countryLabel(dossier.country, lang)} · {formatLabel(dossier.format)}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card
          icon={<Building2 className="size-4" />}
          title={t({ fr: 'Agence nationale', en: 'National agency' })}
        >
          <div className="font-medium">{agency.name}</div>
          <div className="text-muted-foreground text-xs">{agency.full}</div>
        </Card>
        <Card
          icon={<FileCheck2 className="size-4" />}
          title={t({ fr: 'Dossier requis', en: 'Required dossier' })}
        >
          <ul className="text-muted-foreground list-inside list-disc text-xs">
            <li>
              {t({
                fr: `Format ${formatLabel(dossier.format)}`,
                en: `Format ${formatLabel(dossier.format)}`,
              })}
            </li>
            <li>
              {t({
                fr: 'Module 1 (renseignements administratifs)',
                en: 'Module 1 (administrative information)',
              })}
            </li>
            <li>
              {t({
                fr: 'Modules 2 à 5 (Qualité, Non-clinique, Clinique)',
                en: 'Modules 2 to 5 (Quality, Non-clinical, Clinical)',
              })}
            </li>
          </ul>
        </Card>
        <Card icon={<Coins className="size-4" />} title={t({ fr: 'Frais', en: 'Fees' })}>
          <div className="text-muted-foreground text-xs">
            {t({
              fr: `Selon le barème de l'${agency.name} — à confirmer.`,
              en: `According to ${agency.name}'s fee schedule — to be confirmed.`,
            })}
          </div>
        </Card>
        <Card
          icon={<FlaskConical className="size-4" />}
          title={t({ fr: 'Échantillons', en: 'Samples' })}
        >
          <div className="text-muted-foreground text-xs">
            {t({
              fr:
                "Modèles-vente + certificats d'analyse de lots (nombre fixé par l'" +
                agency.name +
                ').',
              en: `Sales samples + batch certificates of analysis (number set by ${agency.name}).`,
            })}
          </div>
        </Card>
        <Card icon={<Clock className="size-4" />} title={t({ fr: 'Délais', en: 'Timelines' })}>
          <div className="text-muted-foreground text-xs">
            {t({
              fr: `Délai d'évaluation indicatif — à confirmer auprès de l'${agency.name}.`,
              en: `Indicative assessment time — to be confirmed with ${agency.name}.`,
            })}
          </div>
        </Card>
      </div>

      <p className="text-muted-foreground mt-4 text-xs italic">
        {t({
          fr: "Informations de référence — à valider et compléter par votre expert RA selon le pays et l'activité.",
          en: 'Reference information — to be validated and completed by your RA expert depending on the country and activity.',
        })}
      </p>

      <Button className="mt-6" onClick={() => navigate(`/workspace/${dossier.id}`)}>
        {t({ fr: "Accéder à l'espace de montage", en: 'Go to the workspace' })} <ArrowRight />
      </Button>
    </section>
  )
}

function Card({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border p-4">
      <div className="flex items-center gap-2 text-sm font-medium">
        <span className="text-muted-foreground">{icon}</span>
        {title}
      </div>
      <div className="mt-2">{children}</div>
    </div>
  )
}
