import { createHashRouter } from 'react-router-dom';
import { RootLayout } from './layouts/RootLayout';
import { DashboardPage } from '@/features/dashboard/DashboardPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { ContainerPage } from '@/features/navigator/ContainerPage';
import { WorkspacesPage } from '@/features/workspaces/WorkspacesPage';

/* HashRouter e non BrowserRouter: il protocollo custom di Tauri non serve
   la history API, e con l'hash i deep-link interni restano validi in produzione. */
export const router = createHashRouter([
  {
    path: '/',
    element: <RootLayout />,
    children: [
      { index: true, element: <DashboardPage /> },
      // Un'unica rotta per ogni nodo della gerarchia: progetti, ambienti,
      // contesti e gruppi sono tutti contenitori.
      { path: 'c/:id', element: <ContainerPage /> },
      { path: 'quick', element: <WorkspacesPage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
