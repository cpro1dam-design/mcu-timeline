// Dates et statut « sorti / à venir », calculés dans le navigateur (heure de Paris),
// pour rester justes sans reconstruire le site.

const MONTHS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août',
  'septembre', 'octobre', 'novembre', 'décembre'];

export function todayParis() {
  // « en-CA » formate en AAAA-MM-JJ
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Paris' }).format(new Date());
}

export function formatDateFr(value, precision) {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  if (precision === 'year' || !m) return y;
  if (precision === 'month' || !d) return `${MONTHS[Number(m) - 1]} ${y}`;
  const day = Number(d);
  return `${day === 1 ? '1er' : day} ${MONTHS[Number(m) - 1]} ${y}`;
}

// Statut d'après la date principale et sa précision (comparaison de chaînes ISO).
export function statusOf(dateValue, precision, today = todayParis()) {
  if (!dateValue) return { key: 'tba', label: 'Date à confirmer' };
  if (precision !== 'day') {
    const prefix = today.slice(0, dateValue.length);
    if (dateValue > prefix) return { key: 'upcoming', label: `Sortie prévue en ${formatDateFr(dateValue, precision)}` };
    if (dateValue === prefix) return { key: 'tba', label: `Sortie prévue en ${formatDateFr(dateValue, precision)}, date exacte à confirmer` };
    return { key: 'released', label: 'Sorti' };
  }
  if (dateValue > today) return { key: 'upcoming', label: `À venir : sortie prévue le ${formatDateFr(dateValue, 'day')}` };
  return { key: 'released', label: 'Sorti' };
}
