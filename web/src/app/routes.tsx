import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/app-shell'
// Page d'atterrissage (cible de la redirection « / » → « /catalogue ») importée en statique :
// elle peint dès le 1er rendu sans aller chercher un second chunk (gain LCP). Les autres pages
// restent en code-splitting paresseux.
import { CataloguePage } from '@/features/catalogue/CataloguePage'

// Code-splitting par route : l'app-shell reste léger, chaque page charge son chunk à la demande.
const ProductFormPage = lazy(() =>
  import('@/features/catalogue/ProductFormPage').then((m) => ({ default: m.ProductFormPage })),
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
        <Route index element={<Navigate to="/catalogue" replace />} />
        <Route path="/catalogue" element={<CataloguePage />} />
        <Route path="/catalogue/nouveau" element={<ProductFormPage />} />
        <Route path="/catalogue/:productId" element={<ProductFormPage />} />
        <Route path="/workspace" element={<WorkspacePage />} />
        <Route path="/workspace/nouveau" element={<NewDossierPage />} />
        <Route path="/workspace/:dossierId" element={<DossierWorkspacePage />} />
        <Route path="/workspace/:dossierId/roadmap" element={<RoadmapPage />} />
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="/templates" element={<TemplatesPage />} />
        <Route path="/variations" element={<VariationsPage />} />
        <Route path="/compte" element={<AccountPage />} />
        <Route path="*" element={<Navigate to="/catalogue" replace />} />
      </Route>
    </Routes>
  )
}
