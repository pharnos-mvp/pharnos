import { lazy } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { AppShell } from '@/components/layout/app-shell'

// Code-splitting par route : l'app-shell reste léger, chaque page charge son chunk à la demande.
const CataloguePage = lazy(() =>
  import('@/features/catalogue/CataloguePage').then((m) => ({ default: m.CataloguePage })),
)
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
const DashboardPage = lazy(() =>
  import('@/features/dashboard/DashboardPage').then((m) => ({ default: m.DashboardPage })),
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
        <Route path="/dashboard" element={<DashboardPage />} />
        <Route path="*" element={<Navigate to="/catalogue" replace />} />
      </Route>
    </Routes>
  )
}
