import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, HashRouter } from 'react-router-dom';
import { ApiConnectionBanner } from './components/ApiConnectionBanner';
import { AuthProvider } from './context/AuthContext';
import { loadRuntimeConfig } from './lib/config';
import App from './App';
import './index.css';

const base = import.meta.env.BASE_URL || '/';
// GitHub project Pages has no SPA rewrite for deep links — HashRouter is reliable there.
const useHash = base !== '/' || import.meta.env.GITHUB_PAGES === 'true';
const basename = base.replace(/\/$/, '') || undefined;

/** AVICHIAN is dark-mode only — ignore system theme and any legacy light preference. */
function forceDarkTheme() {
  try {
    document.documentElement.classList.add('dark');
    document.documentElement.style.colorScheme = 'dark';
    localStorage.removeItem('student-theme');
    localStorage.setItem('student-theme', 'dark');
  } catch {
    /* ignore */
  }
}
forceDarkTheme();

async function bootstrap() {
  await loadRuntimeConfig();
  forceDarkTheme();
  const Router = useHash ? HashRouter : BrowserRouter;
  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      <Router {...(useHash ? {} : { basename: basename || '/' })}>
        <ApiConnectionBanner />
        <AuthProvider>
          <App />
        </AuthProvider>
      </Router>
    </StrictMode>,
  );
}

void bootstrap();
