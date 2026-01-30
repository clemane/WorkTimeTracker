import { Router, Request, Response } from "express";
import puppeteer from "puppeteer";
import ExcelJS from "exceljs";
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

function getMondayOfWeek(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return d.toISOString().slice(0, 10);
}

function formatHumanDate(dateStr: string): string {
  const d = new Date(dateStr + "T12:00:00");
  const day = d.toLocaleDateString("fr-FR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  });
  return day.replace(/\.$/, "");
}

function getBiWeeklyStart(dateStr: string): string {
  const reference = new Date("2024-01-08T12:00:00");
  const d = new Date(dateStr + "T12:00:00");
  const diffTime = d.getTime() - reference.getTime();
  const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
  const bucketIndex = Math.floor(diffDays / 14);
  const start = new Date(reference.getTime());
  start.setDate(start.getDate() + bucketIndex * 14);
  return start.toISOString().slice(0, 10);
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

// Helper to fetch periods for bulk export
function getPeriodsInRange(start: string, end: string, mode: string): { start: string, end: string }[] {
  const periods = [];
  let current = start; // Should be a Monday ideally
  
  // Align start to Monday if needed
  current = getMondayOfWeek(current);
  
  while (current <= end) {
    let periodEnd = "";
    if (mode === "weekly") {
      periodEnd = addDays(current, 6);
    } else if (mode === "monthly") {
      const d = new Date(current + "T12:00:00");
      const year = d.getFullYear();
      const month = d.getMonth();
      const startOfMonth = new Date(year, month, 1, 12).toISOString().slice(0, 10);
      current = getMondayOfWeek(startOfMonth);
      
      const lastDayOfMonth = new Date(year, month + 1, 0, 12);
      const endMonday = getMondayOfWeek(lastDayOfMonth.toISOString().slice(0, 10));
      periodEnd = addDays(endMonday, 6);
    } else {
      // bi-weekly
      current = getBiWeeklyStart(current);
      periodEnd = addDays(current, 13);
    }
    
    periods.push({ start: current, end: periodEnd });
    
    // Next start is periodEnd + 1 day
    current = addDays(periodEnd, 1);
  }
  return periods;
}

// GET /api/report/bulk?from=...&to=...&mode=...&userId=...&format=...
router.get("/bulk", async (req: Request, res: Response) => {
  const { from, to, userId, mode, format } = req.query as { from?: string; to?: string; userId?: string; mode?: string; format?: string };
  const userIdNum = Number(userId);

  if (!from || !to || !userId || !Number.isInteger(userIdNum)) {
    return res.status(400).json({ error: "Paramètres manquants (from, to, userId)" });
  }

  const effectiveMode = mode || "bi-weekly";
  const periods = getPeriodsInRange(from, to, effectiveMode);

  // If format is excel, generate workbook with multiple sheets
  if (format === "excel") {
    try {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = "Antigravity";
      workbook.created = new Date();

      for (const period of periods) {
        const rows = db
          .prepare(
            "SELECT * FROM work_sessions WHERE date >= ? AND date <= ? AND user_id = ? ORDER BY date ASC"
          )
          .all(period.start, period.end, userIdNum)
          .map(mapRowToWorkSession);
        
        const sessions = rows as WorkSession[];
        if (sessions.length === 0) continue; // Skip empty periods? Or keep empty sheet? Let's skip for now or keep to show missing.
        
        // Sheet name: "26 janv - 08 fev"
        const sheetName = `${formatHumanDate(period.start)} - ${formatHumanDate(period.end)}`.replace(/[\/\\?*\[\]]/g, "-").slice(0, 30);
        const worksheet = workbook.addWorksheet(sheetName);

        worksheet.columns = [
          { header: 'Date', key: 'date', width: 15 },
          { header: 'Arrivée', key: 'arrival', width: 10 },
          { header: 'Départ', key: 'departure', width: 10 },
          { header: 'Pause (min)', key: 'break', width: 12 },
          { header: 'Distant (min)', key: 'remote', width: 12 },
          { header: 'Total Net', key: 'net', width: 12 },
          { header: 'Notes', key: 'notes', width: 30 },
        ];

        // Style header
        worksheet.getRow(1).font = { bold: true };
        
        let totalPeriodMinutes = 0;

        sessions.forEach(s => {
          const net = computeNetMinutes(s);
          totalPeriodMinutes += net;
          worksheet.addRow({
            date: formatHumanDate(s.date),
            arrival: s.arrival_time,
            departure: s.departure_time,
            break: s.break_minutes,
            remote: s.remote_minutes ?? 0,
            net: minutesToHHMM(net),
            notes: s.notes
          });
        });

        // Add Total Row
        worksheet.addRow({});
        const totalRow = worksheet.addRow({
          date: 'TOTAL PÉRIODE',
          net: minutesToHHMM(totalPeriodMinutes)
        });
        totalRow.font = { bold: true };
      }

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="export-heures-${from}-au-${to}.xlsx"`
      );

      await workbook.xlsx.write(res);
      return res.end();

    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: "Erreur Excel" });
    }
  }

  return res.status(400).json({ error: "Format non supporté pour l'export de masse (utilisez format=excel)" });
});

// GET /api/report?monday=YYYY-MM-DD
// Génère un PDF ou Excel pour la période demandée.
router.get("/", async (req: Request, res: Response) => {
  const { monday, userId, mode, format } = req.query as { monday?: string; userId?: string; mode?: string; format?: string };

  const userIdNum = Number(userId);

  if (!monday || !isValidDate(monday)) {
    return res
      .status(400)
      .json({ error: "Paramètre 'monday' requis au format YYYY-MM-DD" });
  }

  if (!userId || !Number.isInteger(userIdNum)) {
    return res.status(400).json({ error: "userId requis" });
  }

  // Fetch user details
  const user = db.prepare("SELECT username FROM users WHERE id = ?").get(userIdNum) as { username: string } | undefined;
  const userName = user ? user.username : "Inconnu";

  let from = monday;
  let to = "";
  let periodLabel = "";

  if (mode === "monthly") {
    // Mode mensuel : du 1er au dernier jour du mois de la date donnée
    const d = new Date(monday + "T12:00:00");
    const year = d.getFullYear();
    const month = d.getMonth();
    const startOfMonth = new Date(year, month, 1, 12);
    const endOfMonth = new Date(year, month + 1, 0, 12);
    from = startOfMonth.toISOString().slice(0, 10);
    to = endOfMonth.toISOString().slice(0, 10);
    periodLabel = "Mois complet";
  } else if (mode === "weekly") {
    // Mode hebdomadaire : 1 semaine
    to = addDays(from, 6); // lun -> dim
    periodLabel = "Hebdomadaire";
  } else {
    // bi-weekly : On fait confiance au lundi fourni pour l'export individuel
    // pour éviter les décalages si l'utilisateur a une période personnalisée.
    to = addDays(from, 13);
    periodLabel = "2 semaines";
  }

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

  // EXCEL GENERATION FOR SINGLE PERIOD
  if (format === "excel") {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Feuille de temps");

      worksheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Arrivée', key: 'arrival', width: 10 },
        { header: 'Départ', key: 'departure', width: 10 },
        { header: 'Pause', key: 'break', width: 10 },
        { header: 'Distant', key: 'remote', width: 10 },
        { header: 'Total', key: 'net', width: 10 },
        { header: 'Notes', key: 'notes', width: 30 },
      ];

      worksheet.getRow(1).font = { bold: true };

      sessions.forEach(s => {
        worksheet.addRow({
          date: formatHumanDate(s.date),
          arrival: s.arrival_time,
          departure: s.departure_time,
          break: s.break_minutes,
          remote: s.remote_minutes ?? 0,
          net: minutesToHHMM(computeNetMinutes(s)),
          notes: s.notes
        });
      });

      worksheet.addRow({});
      const totalRow = worksheet.addRow({
        date: 'TOTAL',
        net: minutesToHHMM(totalMinutes)
      });
      totalRow.font = { bold: true };

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="rapport-${from}.xlsx"`
      );

      await workbook.xlsx.write(res);
      return res.end();
    } catch (e) {
      return res.status(500).json({ error: "Erreur Excel" });
    }
  }

  // PDF GENERATION (Default)
  const inRange = (dateStr: string, start: string, end: string) =>
    dateStr >= start && dateStr <= end;

  // Génération dynamique des cartes de résumé par semaine
  let summaryHtml = "";
  
  // On itère semaine par semaine depuis 'from' jusqu'à 'to'
  let currentStart = from;
  let weekIndex = 1;
  
  // On s'assure de ne pas boucler indéfiniment, max 6 semaines
  while (currentStart <= to && weekIndex <= 6) {
    // Fin de cette semaine (soit Dimanche, soit 'to' si 'to' est avant dimanche)
    // Pour simplifier, on prend des blocs de 7 jours (Lun-Dim)
    const currentEnd = addDays(currentStart, 6);
    
    // Si la fin de la semaine dépasse la fin de la période (ex: fin de mois), on peut couper
    // Mais pour l'affichage, c'est souvent plus simple de garder des semaines entières ou de filtrer.
    // Ici on filtre les sessions
    
    // Calcul des minutes pour cette tranche de 7 jours
    const effectiveEnd = currentEnd > to ? to : currentEnd;

    const wMinutes = sessions
      .filter((s) => inRange(s.date, currentStart, effectiveEnd))
      .reduce((acc, s) => acc + computeNetMinutes(s), 0);
      
    // Adaptation du label si une seule semaine est demandée
    const label = mode === 'weekly' ? 'Semaine' : `Semaine ${weekIndex}`;

    summaryHtml += `
        <div class="summary-card">
          <div class="summary-title">${label}</div>
          <div class="summary-range">Du ${formatHumanDate(currentStart)} au ${formatHumanDate(effectiveEnd)}</div>
          <div class="summary-value">${minutesToHHMM(wMinutes)}</div>
        </div>`;
        
    currentStart = addDays(currentStart, 7);
    weekIndex++;
  }

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
          flex-wrap: wrap;
        }
        .summary-card {
          flex: 1;
          min-width: 120px;
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
      <div class="period">Salarié : ${userName}</div>
      <div class="period">Période : du ${formatHumanDate(from)} au ${formatHumanDate(to)}</div>
      <div class="summary">
        ${summaryHtml}
        <div class="summary-card total">
          <div class="summary-title">Total Période</div>
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

