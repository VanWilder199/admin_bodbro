/* Шрифт Onest: self-hosted, импорт в entry приложения (CSP default-src 'self'). */
import '@fontsource-variable/onest';
import { Toaster } from '@podbor/ui/components/ui/sonner';
import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { createQueryClient } from './queryClient';
import './index.css';

const queryClient = createQueryClient();

/** `VITE_API_MOCKS=1` — без бэкенда: запросы `/api/*` перехватывает MSW (см. `mocks/handlers.ts`). */
async function enableMocks() {
  if (import.meta.env.VITE_API_MOCKS !== '1') return;
  const { worker } = await import('./mocks/browser');
  await worker.start({ onUnhandledRequest: 'bypass' });
}

enableMocks().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <QueryClientProvider client={queryClient}>
        <App />
        <Toaster />
      </QueryClientProvider>
    </StrictMode>,
  );
});
