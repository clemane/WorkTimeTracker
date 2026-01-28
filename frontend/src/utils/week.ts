/** Retourne le lundi de la semaine contenant la date (YYYY-MM-DD). */
export function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

/** Ajoute n jours à une date YYYY-MM-DD. */
export function addDays(dateStr: string, n: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Les 5 dates (lun–ven) pour un lundi donné. */
export function getWeekDates(mondayStr: string): string[] {
  return [0, 1, 2, 3, 4].map((i) => addDays(mondayStr, i));
}

/** Les 10 dates (2 semaines lun–ven) pour un lundi donné. */
export function getTwoWeekDates(mondayStr: string): string[] {
  const first = getWeekDates(mondayStr);
  const secondMonday = addDays(mondayStr, 7);
  const second = getWeekDates(secondMonday);
  return [...first, ...second];
}

/** Libellé court jour (lun, mar, …). */
const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven"];

export function getDayLabel(index: number): string {
  return DAY_LABELS[index] ?? "";
}

/** Formate une date YYYY-MM-DD en "lun. 27 janv." */
export function formatDayShort(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const labels = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  const months = "janv._févr._mars_avr._mai_juin_juil._août_sept._oct._nov._déc.".split("_");
  return `${labels[day]} ${d.getDate()} ${months[d.getMonth()]}`;
}
