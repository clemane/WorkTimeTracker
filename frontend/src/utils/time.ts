export function toMinutes(time: string): number {
  const [h, m] = time.split(":").map((x) => parseInt(x, 10));
  return h * 60 + m;
}

export function minutesToHHMM(total: number): string {
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
  return span - breakMinutes + remoteMinutes;
}

