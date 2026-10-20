// Chargé en tête, avant tout le reste (script classique, quelques octets) : la page sait que JavaScript
// tourne et affiche le squelette de la frise jusqu'à l'arrivée des données (shell.js pose is-loaded).
document.documentElement.classList.add('is-loading');
