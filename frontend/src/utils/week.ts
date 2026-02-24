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

/** Les 7 dates (lun–dim) pour un lundi donné. */
export function getWeekDates(mondayStr: string): string[] {
  return [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(mondayStr, i));
}

/** Les 14 dates (2 semaines lun–dim) pour un lundi donné. */
export function getTwoWeekDates(mondayStr: string): string[] {
  const first = getWeekDates(mondayStr);
  const secondMonday = addDays(mondayStr, 7);
  const second = getWeekDates(secondMonday);
  return [...first, ...second];
}

/** Libellé court jour (lun, mar, …). */
const DAY_LABELS = ["Lun", "Mar", "Mer", "Jeu", "Ven", "Sam", "Dim"];

export function getDayLabel(index: number): string {
  // index is 0-based from Monday in our loops
  return DAY_LABELS[index % 7] ?? "";
}

/** Formate une date YYYY-MM-DD en "lun. 27 janv." */
export function formatDayShort(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const labels = ["dim.", "lun.", "mar.", "mer.", "jeu.", "ven.", "sam."];
  const months = "janv._févr._mars_avr._mai_juin_juil._août_sept._oct._nov._déc.".split("_");
  return `${labels[day]} ${d.getDate()} ${months[d.getMonth()]}`;
}

export function getPeriodRange(monday: string, mode: string = "bi-weekly"): { from: string; to: string } {
  let from = monday;
  let to = "";
  if (mode === "weekly") {
    to = addDays(monday, 6); // lun -> dim
  } else if (mode === "monthly") {
    const d = new Date(monday + "T12:00:00");
    const year = d.getFullYear();
    const month = d.getMonth();
    
    const firstDayOfMonth = new Date(year, month, 1, 12);
    from = getMondayOfWeek(firstDayOfMonth.toISOString().slice(0, 10));
    
    const lastDayOfMonth = new Date(year, month + 1, 0, 12);
    const endMonday = getMondayOfWeek(lastDayOfMonth.toISOString().slice(0, 10));
    to = addDays(endMonday, 6);
  } else {
    // bi-weekly - align to a fixed reference Monday (2024-01-08)
    // Using Jan 8th ensures Week 1 of most years is a period start.
    const reference = new Date("2024-01-08T12:00:00");
    const d = new Date(monday + "T12:00:00");
    const diffTime = d.getTime() - reference.getTime();
    const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const bucketIndex = Math.floor(diffDays / 14);
    
    const start = new Date(reference.getTime());
    start.setDate(start.getDate() + bucketIndex * 14);
    from = start.toISOString().slice(0, 10);
    to = addDays(from, 13);
  }
  return { from, to };
}

export function getBiWeeklyStart(dateStr: string): string {
  const reference = new Date("2024-01-08T12:00:00");
  const d = new Date(dateStr + "T12:00:00");
  const diffTime = d.getTime() - reference.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const bucketIndex = Math.floor(diffDays / 14);
  const start = new Date(reference.getTime());
  start.setDate(start.getDate() + bucketIndex * 14);
  return start.toISOString().slice(0, 10);
}
