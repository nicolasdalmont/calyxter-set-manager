import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { initAutoUpdate } from './versionCheck.js';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);

initAutoUpdate();
