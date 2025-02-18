import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx' // App Komponente auskommentiert, da wir DatabasePersistenceTest testen
//import DatabasePersistenceTest from './DatabasePersistenceTest.jsx'; // Testkomponente importieren

// **Korrektur: Verwende den importierten 'createRoot' direkt, nicht 'ReactDOM.createRoot'**
const root = createRoot(document.getElementById('root')); // Korrigiert!

root.render(
<App /> // Testkomponente rendern
);
