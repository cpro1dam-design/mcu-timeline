// Panneaux modaux de l'interface « appli » (panneau Réglages, recherche plein écran, liste des
// personnages) : un <dialog> natif (focus piégé, Échap, fond inerte) et une entrée d'historique tant
// qu'il est ouvert. Le geste ou le bouton « Retour » du téléphone ferme donc le panneau au lieu de
// quitter la page ; la fermeture par l'interface revient en arrière dans l'historique.
//
//   const ov = createOverlay(dialog, { onClose });
//   ov.show();                 // ouvre (pushState)
//   await ov.close();          // ferme ; la promesse est tenue une fois l'historique revenu
//
// Pendant ce retour, overlayPop() vaut true : les autres écouteurs de popstate (coquille, Archives)
// ignorent l'évènement, et l'adresse modifiée pendant que le panneau était ouvert (filtre, personnage)
// est conservée.

let inflight = null; // { url, resolve } : history.back() lancé par la fermeture d'un panneau
const stack = [];

export const overlayPop = () => !!inflight;
export const anyOverlayOpen = () => stack.some((o) => o.isOpen());

window.addEventListener('popstate', () => {
  if (inflight) {
    const f = inflight;
    history.replaceState(history.state, '', f.url); // garde l'adresse mise à jour dans le panneau
    setTimeout(() => { if (inflight === f) inflight = null; f.resolve(); }, 0); // après les autres écouteurs
    return;
  }
  const top = stack[stack.length - 1];
  if (top) top.closeFromHistory();
});

export function createOverlay(dialog, { onClose = () => {}, onOpen = () => {}, closeOnBackdrop = true } = {}) {
  let pushed = false;
  function drop() { const i = stack.indexOf(api); if (i >= 0) stack.splice(i, 1); }
  function back() {
    drop();
    if (!pushed) return Promise.resolve();
    pushed = false;
    return new Promise((resolve) => {
      const f = { url: location.href, resolve };
      inflight = f;
      history.back();
      // filet de sécurité : si le retour n'a pas lieu (historique absent), on n'attend pas
      setTimeout(() => { if (inflight === f) { inflight = null; resolve(); } }, 1000);
    });
  }
  const api = {
    isOpen: () => dialog.open,
    show() {
      if (dialog.open) return;
      dialog.showModal();
      history.pushState({ ...(history.state || {}), overlay: true }, '', location.href);
      pushed = true;
      stack.push(api);
      onOpen();
    },
    close() {
      if (!dialog.open) return Promise.resolve();
      const p = back();
      dialog.close();
      return p;
    },
    closeFromHistory() {
      pushed = false;
      drop();
      if (dialog.open) dialog.close();
    },
  };
  dialog.addEventListener('cancel', (e) => { e.preventDefault(); api.close(); }); // Échap
  dialog.addEventListener('close', () => { if (pushed) back(); onClose(); });
  // toucher le voile (hors du contenu) ferme le panneau (le contenu remplit tout le <dialog>)
  if (closeOnBackdrop) dialog.addEventListener('click', (e) => { if (e.target === dialog) api.close(); });
  return api;
}
