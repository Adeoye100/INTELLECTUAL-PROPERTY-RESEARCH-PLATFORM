import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import { getApiConfig, shouldEnableMocking } from './lib/api/config';

async function enableMocking() {
  const config = getApiConfig();
  if (!shouldEnableMocking(config)) return;

  const { worker } = await import('./lib/mocks/browser');
  return worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: {
      url: '/mockServiceWorker.js',
    },
  });
}

enableMocking().then(() => {
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <App />
    </StrictMode>,
  );
}).catch((error: unknown) => {
  const root = document.getElementById('root');
  if (root) {
    root.textContent = error instanceof Error
      ? `Application configuration error: ${error.message}`
      : 'Application configuration error.';
  }
});
