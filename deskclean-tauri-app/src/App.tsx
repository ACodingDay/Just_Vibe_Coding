import { useEffect } from 'react';
import { createHashRouter, RouterProvider } from 'react-router-dom';
import { getLanguage } from '@/services/ipc';
import i18n from '@/i18n/index';

import HomePage from '@/pages/home/HomePage';
import OrganizePage from '@/pages/organize/OrganizePage';
import SettingsPage from '@/pages/settings/SettingsPage';
import MembershipPage from '@/pages/membership/MembershipPage';
import AboutPage from '@/pages/about/AboutPage';

const router = createHashRouter([
  { path: '/', element: <HomePage /> },
  { path: '/organize', element: <OrganizePage /> },
  { path: '/settings', element: <SettingsPage /> },
  { path: '/membership', element: <MembershipPage /> },
  { path: '/about', element: <AboutPage /> },
]);

export default function App() {
  useEffect(() => {
    // Load persisted language setting from Tauri backend
    getLanguage()
      .then((lang) => { if (lang) i18n.changeLanguage(lang); })
      .catch(() => {});
  }, []);

  return <RouterProvider router={router} />;
}
