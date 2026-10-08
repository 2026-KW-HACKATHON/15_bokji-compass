import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './app/App.jsx';
import { I18nProvider } from './shared/i18n/I18nProvider.jsx';
import '@fontsource-variable/noto-sans-kr';
import './app/styles.css';
import './app/easy-mode.css';
import './features/auth/auth.css';
import './app/portal.css';
import './app/portal-navigation.css';
import './app/easy-shell.css';
import './app/easy-features.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <I18nProvider>
      <App />
    </I18nProvider>
  </React.StrictMode>,
);
