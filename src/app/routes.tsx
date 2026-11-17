import { createBrowserRouter, Navigate } from 'react-router-dom';
import { Shell } from '@/components/layout/Shell';
import { HomePage } from '@/pages/HomePage';
import { ExplorePage } from '@/pages/ExplorePage';
import { RoomPage } from '@/pages/RoomPage';
import { NotFoundPage } from '@/pages/NotFoundPage';

export const router = createBrowserRouter([
  {
    path: '/',
    element: (
      <Shell>
        <HomePage />
      </Shell>
    ),
  },
  {
    path: '/explore',
    element: (
      <Shell>
        <ExplorePage />
      </Shell>
    ),
  },
  {
    path: '/rooms/:slugOrId',
    element: (
      <Shell showFooter={false}>
        <RoomPage />
      </Shell>
    ),
  },
  {
    path: '/404',
    element: (
      <Shell>
        <NotFoundPage />
      </Shell>
    ),
  },
  {
    path: '*',
    element: <Navigate to="/404" replace />,
  },
]);
