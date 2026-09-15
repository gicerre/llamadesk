import { createHashRouter } from 'react-router-dom';
import { FavoritesPage } from '@/features/library/FavoritesPage';
import { RecentsPage } from '@/features/library/RecentsPage';
import { NotFoundPage } from '@/features/library/NotFoundPage';
import { ProjectPage } from '@/features/project/ProjectPage';
import { SectionPage } from '@/features/project/SectionPage';
import { SettingsPage } from '@/features/settings/SettingsPage';
import { WelcomePage } from '@/features/welcome/WelcomePage';
import { RootRedirect } from '@/features/workspace/RootRedirect';
import { WorkspacePage } from '@/features/workspace/WorkspacePage';
import { RootLayout } from './RootLayout';
import { AppShell } from './shell/AppShell';

/* HashRouter: il protocollo di Tauri non serve la history API, e con l'hash
   gli indirizzi interni restano validi anche nell'app installata. */
export const router = createHashRouter([
  {
    element: <RootLayout />,
    children: [
      { path: '/', element: <RootRedirect /> },
      { path: '/benvenuto', element: <WelcomePage /> },
      {
        element: <AppShell />,
        children: [
          { path: '/w/:workspaceId', element: <WorkspacePage /> },
          { path: '/w/:workspaceId/preferiti', element: <FavoritesPage /> },
          { path: '/w/:workspaceId/recenti', element: <RecentsPage /> },
          { path: '/w/:workspaceId/n/:sectionId', element: <SectionPage /> },
          { path: '/w/:workspaceId/p/:projectId', element: <ProjectPage /> },
          { path: '/w/:workspaceId/p/:projectId/n/:sectionId', element: <ProjectPage /> },
          { path: '/w/:workspaceId/p/:projectId/s/:subprojectId', element: <ProjectPage /> },
          {
            path: '/w/:workspaceId/p/:projectId/s/:subprojectId/n/:sectionId',
            element: <ProjectPage />,
          },
          { path: '/impostazioni', element: <SettingsPage /> },
          { path: '*', element: <NotFoundPage /> },
        ],
      },
    ],
  },
]);
