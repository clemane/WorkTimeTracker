import { Router, Request, Response } from "express";
import puppeteer from "puppeteer";
import { getDb, mapRowToWorkSession } from "../db";
import { WorkSession } from "../types";

const router = Router();
const db = getDb();

function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T12:00:00");
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function formatHumanDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  return day.replace(/\\.$/, "");
}

function computeNetMinutes(s: WorkSession): number {
  const [ah, am] = s.arrival_time.split(":").map((x) => parseInt(x, 10));
  const [dh, dm] = s.departure_time.split(":").map((x) => parseInt(x, 10));
  const span = (dh * 60 + dm) - (ah * 60 + am);
  const breakMinutes = s.break_minutes ?? 0;
  const remoteMinutes = s.remote_minutes ?? 0;
  return span - breakMinutes + remoteMinutes;
}

function minutesToHHMM(total: number): string {
  const sign = total < 0 ? "-" : "";
  const abs = Math.abs(total);
  const h = Math.floor(abs / 60);
  const m = abs % 60;
  return `${sign}${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// GET /api/report?monday=YYYY-MM-DD
// Génère un PDF pour 2 semaines (lun–ven x2) à partir du lundi passé.
router.get("/", async (req: Request, res: Response) => {
  const { monday, userId } = req.query as { monday?: string; userId?: string };

  const userIdNum = Number(userId);

  if (!monday || !isValidDate(monday)) {
    return res
      .status(400)
      .json({ error: "Paramètre 'monday' requis au format YYYY-MM-DD" });
  }

  if (!userId || !Number.isInteger(userIdNum)) {
    return res.status(400).json({ error: "userId requis" });
  }

  const from = monday;
  const to = addDays(monday, 13); // couvre 2 semaines complètes

  const rows = db
    .prepare(
      "SELECT * FROM work_sessions WHERE date >= ? AND date <= ? AND user_id = ? ORDER BY date ASC"
    )
    .all(from, to, userIdNum)
    .map(mapRowToWorkSession);

  const sessions = rows as WorkSession[];

  const totalMinutes = sessions.reduce(
    (acc, s) => acc + computeNetMinutes(s),
    0
  );

  const week1From = from;
  const week1To = addDays(from, 4);
  const week2From = addDays(from, 7);
  const week2To = addDays(from, 11);

  const inRange = (dateStr: string, start: string, end: string) =>
    dateStr >= start && dateStr <= end;

  const week1Minutes = sessions
    .filter((s) => inRange(s.date, week1From, week1To))
    .reduce((acc, s) => acc + computeNetMinutes(s), 0);

  const week2Minutes = sessions
    .filter((s) => inRange(s.date, week2From, week2To))
    .reduce((acc, s) => acc + computeNetMinutes(s), 0);

  const htmlRows = sessions
    .map((s) => {
      const net = minutesToHHMM(computeNetMinutes(s));
      return `<tr>
        <td>${formatHumanDate(s.date)}</td>
        <td>${s.arrival_time}</td>
        <td>${s.departure_time}</td>
        <td>${s.break_minutes}</td>
        <td>${s.remote_minutes ?? 0}</td>
        <td>${net}</td>
        <td>${(s.notes ?? "").replace(/</g, "&lt;")}</td>
      </tr>`;
    })
    .join("\n");

  const html = `<!doctype html>
  <html lang="fr">
    <head>
      <meta charset="utf-8" />
      <title>Rapport d'heures</title>
      <style>
        * { box-sizing: border-box; }
        body {
          font-family: system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
          margin: 0;
          padding: 24px;
          color: #0f172a;
          background: #f9fafb;
        }
        h1 {
          font-size: 20px;
          margin: 0 0 4px;
        }
        .period {
          font-size: 12px;
          color: #6b7280;
          margin-bottom: 16px;
        }
        .summary {
          display: flex;
          gap: 12px;
          margin-bottom: 18px;
        }
        .summary-card {
          flex: 1;
          padding: 10px 12px;
          border-radius: 8px;
          border: 1px solid #e5e7eb;
          background: #eef2ff;
          font-size: 11px;
        }
        .summary-card.total {
          background: #e0f2fe;
          border-color: #bae6fd;
        }
        .summary-title {
          font-weight: 600;
          margin-bottom: 4px;
        }
        .summary-range {
          font-size: 10px;
          color: #6b7280;
          margin-bottom: 4px;
        }
        .summary-value {
          font-size: 15px;
          font-weight: 700;
          color: #0f172a;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          font-size: 11px;
        }
        th, td {
          padding: 6px 8px;
          border-bottom: 1px solid #e5e7eb;
          text-align: left;
        }
        th {
          font-size: 10px;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #6b7280;
          background: #f3f4f6;
        }
        tr:nth-child(even) td {
          background: #f9fafb;
        }
        .net {
          font-weight: 600;
          color: #0e7490;
        }
      </style>
    </head>
    <body>
      <h1>Rapport d'heures</h1>
      <div class="period">Salarié : Clément Lemane</div>
      <div class="period">Période : du ${from} au ${to}</div>
      <div class="summary">
        <div class="summary-card">
          <div class="summary-title">Semaine 1</div>
          <div class="summary-range">Du ${formatHumanDate(
            week1From
          )} au ${formatHumanDate(week1To)}</div>
          <div class="summary-value">${minutesToHHMM(week1Minutes)}</div>
        </div>
        <div class="summary-card">
          <div class="summary-title">Semaine 2</div>
          <div class="summary-range">Du ${formatHumanDate(
            week2From
          )} au ${formatHumanDate(week2To)}</div>
          <div class="summary-value">${minutesToHHMM(week2Minutes)}</div>
        </div>
        <div class="summary-card total">
          <div class="summary-title">Total 2 semaines</div>
          <div class="summary-value">${minutesToHHMM(totalMinutes)}</div>
        </div>
      </div>
      <table>
        <thead>
          <tr>
            <th>Jour</th>
            <th>Arrivée</th>
            <th>Départ</th>
            <th>Repas (min)</th>
            <th>Télétravail (min)</th>
            <th>Total net</th>
            <th>Notes</th>
          </tr>
        </thead>
        <tbody>
          ${htmlRows}
        </tbody>
      </table>
    </body>
  </html>`;

  try {
    const browser = await puppeteer.launch({
      headless: "new",
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    });
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: "networkidle0" });
    const pdfBuffer = await page.pdf({
      format: "A4",
      printBackground: true,
      margin: { top: "15mm", right: "15mm", bottom: "15mm", left: "15mm" },
    });
    await browser.close();

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=\"rapport-heures-${from}.pdf\"`
    );
    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Erreur génération PDF", err);
    return res
      .status(500)
      .json({ error: "Erreur lors de la génération du PDF" });
  }
});

export default router;

