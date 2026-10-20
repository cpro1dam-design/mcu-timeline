// Page « Les deux frises » : aperçu mobile dans UNE seule iframe, créée à l'ouverture et détruite à la
// fermeture (libère le contexte WebGL). Flèche « Revenir en haut » comme sur les autres pages.

import { initToTop } from '../shared/js/totop.js';
import { registerOffline } from '../shared/js/offline.js';

initToTop(window);

const dialog = document.getElementById('apercu');
const frameBox = document.getElementById('apercu-cadre');
const titleEl = document.getElementById('apercu-titre');
let opener = null;
document.querySelectorAll('[data-preview]').forEach((btn) => btn.addEventListener('click', () => {
  opener = btn;
  titleEl.textContent = `Aperçu mobile : ${btn.dataset.name}`;
  const iframe = document.createElement('iframe');
  iframe.src = btn.dataset.preview;
  iframe.title = `Aperçu mobile de la frise ${btn.dataset.name}`;
  iframe.width = '390';
  iframe.height = '844';
  frameBox.replaceChildren(iframe);
  dialog.showModal();
}));
function closePreview() {
  frameBox.replaceChildren();
  if (dialog.open) dialog.close();
  if (opener) opener.focus();
}
document.getElementById('apercu-fermer').addEventListener('click', closePreview);
dialog.addEventListener('close', () => { frameBox.replaceChildren(); if (opener) opener.focus(); });
registerOffline(); // consultation hors connexion (sw.js)
