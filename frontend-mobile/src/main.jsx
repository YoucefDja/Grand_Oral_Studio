import React from 'react';
import ReactDOM from 'react-dom/client';
import { AuthProvider } from './auth.jsx';
import { SettingsProvider, applyStoredTheme } from './settings.jsx';
import App from './App.jsx';
import './index.css';

// Applique le thème mémorisé avant le premier rendu (évite le flash clair/sombre).
applyStoredTheme();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AuthProvider>
      <SettingsProvider>
        <App />
      </SettingsProvider>
    </AuthProvider>
  </React.StrictMode>
);

// Enregistrement du service worker PWA (production uniquement).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch((err) => {
      console.warn('Service worker non enregistré :', err);
    });
  });
}
