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
import { activityLabel, countryLabel, formatLabel } from './dossier-constants'
import { getDossier } from './dossier-repository'
import { agencyFor } from './roadmap-data'
import type { ReactNode } from 'react'

export function RoadmapPage() {
  const { dossierId } = useParams()
  const navigate = useNavigate()
  const dossier = useLiveQuery(
    async () => (dossierId ? ((await getDossier(dossierId)) ?? null) : null),
    [dossierId],
  )

  if (dossier === undefined) {
    return <p className="text-muted-foreground p-4 text-sm">Chargement…</p>
  }
  if (dossier === null) {
    return (
      <div className="p-4">
        <p className="text-muted-foreground text-sm">Dossier introuvable.</p>
        <Button variant="ghost" className="mt-2 -ml-2" onClick={() => navigate('/workspace')}>
          <ArrowLeft /> Retour aux dossiers
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
        <ArrowLeft /> Dossiers
      </Button>

      <h1 className="text-2xl font-semibold tracking-tight">Roadmap réglementaire</h1>
      <p className="text-muted-foreground mt-1 text-sm">
        {dossier.productName} · {activityLabel(dossier.activity)} · {countryLabel(dossier.country)}{' '}
        · {formatLabel(dossier.format)}
      </p>

      <div className="mt-6 grid gap-3 sm:grid-cols-2">
        <Card icon={<Building2 className="size-4" />} title="Agence nationale">
          <div className="font-medium">{agency.name}</div>
          <div className="text-muted-foreground text-xs">{agency.full}</div>
        </Card>
        <Card icon={<FileCheck2 className="size-4" />} title="Dossier requis">
          <ul className="text-muted-foreground list-inside list-disc text-xs">
            <li>Format {formatLabel(dossier.format)}</li>
            <li>Module 1 (renseignements administratifs)</li>
            <li>Modules 2 à 5 (Qualité, Non-clinique, Clinique)</li>
          </ul>
        </Card>
        <Card icon={<Coins className="size-4" />} title="Frais">
          <div className="text-muted-foreground text-xs">
            Selon le barème de l'{agency.name} — à confirmer.
          </div>
        </Card>
        <Card icon={<FlaskConical className="size-4" />} title="Échantillons">
          <div className="text-muted-foreground text-xs">
            Modèles-vente + certificats d'analyse de lots (nombre fixé par l'{agency.name}).
          </div>
        </Card>
        <Card icon={<Clock className="size-4" />} title="Délais">
          <div className="text-muted-foreground text-xs">
            Délai d'évaluation indicatif — à confirmer auprès de l'{agency.name}.
          </div>
        </Card>
      </div>

      <p className="text-muted-foreground mt-4 text-xs italic">
        Informations de référence — à valider et compléter par votre expert RA selon le pays et
        l'activité.
      </p>

      <Button className="mt-6" onClick={() => navigate(`/workspace/${dossier.id}`)}>
        Accéder à l'espace de montage <ArrowRight />
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
