// Consultation hors connexion : enregistre le service worker du site (sw.js, à la racine, généré par
// tools/build_site.py) une fois la page chargée, pour ne pas ralentir le premier affichage. Sans
// service worker (navigateur ancien, page dans un cadre restreint), le site marche comme avant.

import { siteRoot } from './data.js';

export function registerOffline() {
  if (!('serviceWorker' in navigator) || !window.isSecureContext) return;
  const go = () => { navigator.serviceWorker.register(`${siteRoot()}sw.js`).catch(() => {}); };
  if (document.readyState === 'complete') go(); else window.addEventListener('load', go, { once: true });
}
