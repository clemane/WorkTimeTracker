export function toMinutes(time: string): number {
  if (!time) return 0;
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  if (isNaN(h) || isNaN(m)) return 0;
  return h * 60 + m;
}

export function minutesToHHMM(total: number): string {
  if (isNaN(total)) return "00:00";
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(total);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// durée nette = (departure - arrival) - break + remote
export function computeNetMinutes(
  arrival: string,
  departure: string,
  breakMinutes: number,
  remoteMinutes: number
): number {
  const span = toMinutes(departure) - toMinutes(arrival);
  // Ensure we treat null/undefined/NaN as 0 for arithmetic
  const safeBreak = isNaN(breakMinutes) ? 0 : breakMinutes;
  const safeRemote = isNaN(remoteMinutes) ? 0 : remoteMinutes;
  
  return span - safeBreak + safeRemote;
}

