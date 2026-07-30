import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { applyPaletteVars } from './map/palette';
import 'flag-icons/css/flag-icons.min.css';
import './index.css';

// Mirror the map palette onto CSS custom properties so the chrome (legend,
// chips, toolbar) uses the exact same values the WebGL map paints with.
applyPaletteVars();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
