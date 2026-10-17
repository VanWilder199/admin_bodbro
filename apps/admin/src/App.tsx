import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { SessionProvider } from '@/auth/SessionProvider';
import { appRoutes } from './routes';

// Роутер создаётся один раз на модуль: `createBrowserRouter` сразу подписывается на popstate,
// и второй экземпляр (например, от двойного рендера StrictMode) обрабатывал бы переходы дважды.
const router = createBrowserRouter(appRoutes);

// SessionProvider снаружи роутера: ему не нужны хуки роутера, а редиректы на /login делают guard'ы (RequireAuth, GuestOnly).
export default function App() {
  return (
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>
  );
}
