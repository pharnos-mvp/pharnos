import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/app-shell'
// CataloguePage importée en statique (peint dès le 1er rendu sans 2ᵉ chunk = gain LCP sur la
// surface produit, cœur de l'app). L'atterrissage « / » est désormais le Dashboard (resté lazy :
// le squelette d'app-shell couvre son chargement). Les autres pages restent en code-splitting.
import { CataloguePage } from '@/features/catalogue/CataloguePage'

// Code-splitting par route : l'app-shell reste léger, chaque page charge son chunk à la demande.
const ProductFormPage = lazy(() =>
  import('@/features/catalogue/ProductFormPage').then((m) => ({ default: m.ProductFormPage })),
)
const ProductCockpit = lazy(() =>
  import('@/features/catalogue/ProductCockpit').then((m) => ({ default: m.ProductCockpit })),
)
const OrganisationsPage = lazy(() =>
  import('@/features/catalogue/OrganisationsPage').then((m) => ({ default: m.OrganisationsPage })),
)
const OrganisationCockpit = lazy(() =>
  import('@/features/catalogue/OrganisationCockpit').then((m) => ({
    default: m.OrganisationCockpit,
  })),
)
const AutoritesPage = lazy(() =>
  import('@/features/catalogue/AutoritesPage').then((m) => ({ default: m.AutoritesPage })),
)
const AutoriteCockpit = lazy(() =>
  import('@/features/catalogue/AutoriteCockpit').then((m) => ({ default: m.AutoriteCockpit })),
)
const WorkspacePage = lazy(() =>
  import('@/features/workspace/WorkspacePage').then((m) => ({ default: m.WorkspacePage })),
)
const NewDossierPage = lazy(() =>
  import('@/features/workspace/NewDossierPage').then((m) => ({ default: m.NewDossierPage })),
)
const DossierWorkspacePage = lazy(() =>
  import('@/features/workspace/DossierWorkspacePage').then((m) => ({
    default: m.DossierWorkspacePage,
  })),
)
const RoadmapPage = lazy(() =>
  import('@/features/workspace/RoadmapPage').then((m) => ({ default: m.RoadmapPage })),
)
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
)
const TemplatesPage = lazy(() =>
  import('@/features/templates/TemplatesPage').then((m) => ({ default: m.TemplatesPage })),
)
const VariationsPage = lazy(() =>
  import('@/features/variations/VariationsPage').then((m) => ({ default: m.VariationsPage })),
)
const AccountPage = lazy(() =>
  import('@/features/account/AccountPage').then((m) => ({ default: m.AccountPage })),
)

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/dashboard" replace />} />
        <Route path="/catalogue" element={<CataloguePage />} />
        <Route path="/catalogue/nouveau" element={<ProductFormPage />} />
        <Route path="/catalogue/organisations" element={<OrganisationsPage />} />
        <Route path="/catalogue/organisations/:partyId" element={<OrganisationCockpit />} />
        <Route path="/catalogue/autorites" element={<AutoritesPage />} />
        <Route path="/catalogue/autorites/:code" element={<AutoriteCockpit />} />
        <Route path="/catalogue/:productId" element={<ProductCockpit />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/workspace/nouveau" element={<NewDossierPage />} />
        <Route path="/workspace/:dossierId" element={<DossierWorkspacePage />} />
        <Route path="/workspace/:dossierId/roadmap" element={<RoadmapPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/variations" element={<VariationsPage />} />
        <Route path="/compte" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Route>
    </Routes>
  )
}
