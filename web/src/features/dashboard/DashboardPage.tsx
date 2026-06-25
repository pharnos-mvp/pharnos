import { useMemo } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'

import { Page } from '@/components/ui/page'
import { PageHeader } from '@/components/ui/page-header'
import { useAuditSync } from '@/features/audit/use-audit-sync'
import { useCatalogueSync } from '@/features/catalogue/use-catalogue-sync'
import { useCorrespondenceSync } from '@/features/correspondence/use-correspondence-sync'
import { useOrgId } from '@/features/org/org-context'
import { useDossierSync } from '@/features/workspace/use-dossier-sync'
import { db } from '@/lib/db'
import { useI18n } from '@/lib/i18n-context'
import { ActionsRequises } from './components/ActionsRequises'
import { ActiviteRecente } from './components/ActiviteRecente'
import { ConformiteCard } from './components/ConformiteCard'
import { CorrespondanceEnCours } from './components/CorrespondanceEnCours'
import { EcheancesTimeline } from './components/EcheancesTimeline'
import { PipelineCard } from './components/PipelineCard'
import { PortefeuilleCard } from './components/PortefeuilleCard'
import { VeilleCard } from './components/VeilleCard'
import {
  buildActions,
  conformitySummary,
  expiringDocs,
  openCorrespondences,
  pipelineCounts,
  portfolio,
  recentActivity,
} from './dashboard-data'

export function DashboardPage() {
  const orgId = useOrgId()
  const { t } = useI18n()
  // Synchros (best-effort) pour un poste de pilotage frais — hors-ligne : on lit le cache Dexie.
  useCatalogueSync(orgId)
  useDossierSync(orgId)
  useCorrespondenceSync(orgId)
  useAuditSync(orgId)

  // Une requête batchée par domaine (perf) ; tout dérive ensuite via des sélecteurs PURS.
  const data = useLiveQuery(async () => {
    const [products, documents, dossiers, correspondences, messages, reads, docAnalysis, auditLog] =
      await Promise.all([
        db.products.where('orgId').equals(orgId).toArray(),
        db.documents.where('orgId').equals(orgId).toArray(),
        db.dossiers.where('orgId').equals(orgId).toArray(),
        db.correspondences.where('orgId').equals(orgId).toArray(),
        db.correspondenceMessages.where('orgId').equals(orgId).toArray(),
        db.correspondenceReads.toArray(),
        db.docAnalysis.toArray(),
        db.auditLog.where('orgId').equals(orgId).toArray(),
      ])
    return {
      products,
      documents,
      dossiers,
      correspondences,
      messages,
      reads,
      docAnalysis,
      auditLog,
    }
  }, [orgId])

  const {
    products = [],
    documents = [],
    dossiers = [],
    correspondences = [],
    messages = [],
    reads = [],
    docAnalysis = [],
    auditLog = [],
  } = data ?? {}

  const vm = useMemo(() => {
    const now = new Date()
    return {
      actions: buildActions(
        { products, documents, dossiers, correspondences, messages, reads, docAnalysis },
        now,
      ),
      pipeline: pipelineCounts(dossiers, correspondences),
      corrItems: openCorrespondences(correspondences, messages, reads),
      activity: recentActivity(auditLog),
      echeances: expiringDocs(documents, products, now),
      portfolio: portfolio(products, dossiers),
      conformity: conformitySummary(documents, docAnalysis),
    }
  }, [products, documents, dossiers, correspondences, messages, reads, docAnalysis, auditLog])

  return (
    <Page>
      <PageHeader
        title={t({ fr: 'Tableau de bord', en: 'Dashboard' })}
        description={t({
          fr: 'Poste de pilotage RA — vos actions, dossiers, échéances & veille (UEMOA/CEDEAO).',
          en: 'RA control center — your actions, dossiers, deadlines & watch (UEMOA/CEDEAO).',
        })}
      />

      {/* Cœur : ce qui requiert une action. */}
      <ActionsRequises items={vm.actions} />

      {/* Pipeline des dossiers par état (dérivé). */}
      <PipelineCard counts={vm.pipeline} />

      <div className="grid gap-4 lg:grid-cols-2">
        <CorrespondanceEnCours items={vm.corrItems} />
        <ConformiteCard data={vm.conformity} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <EcheancesTimeline items={vm.echeances} />
        <PortefeuilleCard data={vm.portfolio} />
      </div>

      <ActiviteRecente items={vm.activity} />
      <VeilleCard />
    </Page>
  )
}
