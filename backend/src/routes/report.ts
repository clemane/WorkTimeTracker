import { Router, Request, Response } from "express";
import puppeteer from "puppeteer";
import ExcelJS from "exceljs";
import { getDb, mapRowToWorkSession } from "../db";
import { WorkSession } from "../types";
import { transporter } from "../mailer";

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
  if (s.day_type === "holiday" || s.day_type === "vacation") {
    return s.worked_minutes ?? 0;
  }
  const [ah, am] = s.arrival_time.split(":").map((x) => parseInt(x, 10));
  const [dh, dm] = s.departure_time.split(":").map((x) => parseInt(x, 10));
  const span = (dh * 60 + dm) - (ah * 60 + am);
  const breakMinutes = s.break_minutes ?? 0;
  const remoteMinutes = s.remote_minutes ?? 0;
  return span - breakMinutes + remoteMinutes;
}

function dayTypeLabel(t: WorkSession["day_type"]): string {
  if (t === "holiday") return "Férié";
  if (t === "vacation") return "Vacances";
  return "";
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
          { header: 'Type', key: 'type', width: 10 },
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
          const isSpecial = s.day_type === "holiday" || s.day_type === "vacation";
          worksheet.addRow({
            date: formatHumanDate(s.date),
            type: dayTypeLabel(s.day_type),
            arrival: isSpecial ? "" : s.arrival_time,
            departure: isSpecial ? "" : s.departure_time,
            break: isSpecial ? "" : s.break_minutes,
            remote: isSpecial ? "" : (s.remote_minutes ?? 0),
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

  // Fetch user details (username + defaults pour calcul du jour standard)
  const user = db
    .prepare(
      "SELECT username, default_arrival, default_departure, default_break_minutes FROM users WHERE id = ?"
    )
    .get(userIdNum) as
    | {
        username: string;
        default_arrival: string | null;
        default_departure: string | null;
        default_break_minutes: number | null;
      }
    | undefined;
  const userName = user ? user.username : "Inconnu";

  // Durée standard d'une journée de travail, dérivée du profil utilisateur
  const standardDayMinutes = (() => {
    const arrival = user?.default_arrival ?? "07:30";
    const departure = user?.default_departure ?? "16:30";
    const breakMin = user?.default_break_minutes ?? 60;
    const [ah, am] = arrival.split(":").map((x) => parseInt(x, 10));
    const [dh, dm] = departure.split(":").map((x) => parseInt(x, 10));
    return (dh * 60 + dm) - (ah * 60 + am) - breakMin;
  })();

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

  // Décomposition vacances / fériés — partagée entre Excel et PDF
  const holidaySessions = sessions.filter((s) => s.day_type === "holiday");
  const vacationSessions = sessions.filter((s) => s.day_type === "vacation");
  const holidayCount = holidaySessions.length;
  const vacationCount = vacationSessions.length;
  const prisSurVacances = vacationSessions.reduce((acc, s) => {
    return acc + Math.max(0, standardDayMinutes - (s.worked_minutes ?? 0));
  }, 0);
  const prisSurFeries = holidaySessions.reduce((acc, s) => {
    return acc + Math.max(0, standardDayMinutes - (s.worked_minutes ?? 0));
  }, 0);

  // EXCEL GENERATION FOR SINGLE PERIOD
  if (format === "excel") {
    try {
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet("Feuille de temps");

      worksheet.columns = [
        { header: 'Date', key: 'date', width: 15 },
        { header: 'Type', key: 'type', width: 10 },
        { header: 'Arrivée', key: 'arrival', width: 10 },
        { header: 'Départ', key: 'departure', width: 10 },
        { header: 'Pause', key: 'break', width: 10 },
        { header: 'Distant', key: 'remote', width: 10 },
        { header: 'Total', key: 'net', width: 10 },
        { header: 'Notes', key: 'notes', width: 30 },
      ];

      worksheet.getRow(1).font = { bold: true };

      sessions.forEach(s => {
        const isSpecial = s.day_type === "holiday" || s.day_type === "vacation";
        worksheet.addRow({
          date: formatHumanDate(s.date),
          type: dayTypeLabel(s.day_type),
          arrival: isSpecial ? "" : s.arrival_time,
          departure: isSpecial ? "" : s.departure_time,
          break: isSpecial ? "" : s.break_minutes,
          remote: isSpecial ? "" : (s.remote_minutes ?? 0),
          net: minutesToHHMM(computeNetMinutes(s)),
          notes: s.notes
        });
      });

      worksheet.addRow({});
      const payRow = worksheet.addRow({
        date: 'HEURES À PAYER',
        net: minutesToHHMM(totalMinutes)
      });
      payRow.font = { bold: true };

      if (vacationCount > 0) {
        const vacRow = worksheet.addRow({
          date: 'PRIS SUR VACANCES',
          net: minutesToHHMM(prisSurVacances),
          notes: `${vacationCount} jour${vacationCount > 1 ? "s" : ""}`
        });
        vacRow.font = { bold: true };
      }
      if (holidayCount > 0) {
        const holRow = worksheet.addRow({
          date: 'PRIS SUR FÉRIÉS',
          net: minutesToHHMM(prisSurFeries),
          notes: `${holidayCount} jour${holidayCount > 1 ? "s" : ""}`
        });
        holRow.font = { bold: true };
      }

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
      const isSpecial = s.day_type === "holiday" || s.day_type === "vacation";
      const typeBadge = s.day_type === "holiday"
        ? `<span class="badge badge-holiday">Férié</span>`
        : s.day_type === "vacation"
        ? `<span class="badge badge-vacation">Vacances</span>`
        : "";
      return `<tr>
      <td>${formatHumanDate(s.date)}</td>
      <td>${typeBadge}</td>
      <td>${isSpecial ? "" : s.arrival_time}</td>
      <td>${isSpecial ? "" : s.departure_time}</td>
      <td>${isSpecial ? "" : s.break_minutes}</td>
      <td>${isSpecial ? "" : (s.remote_minutes ?? 0)}</td>
      <td class="net">${net}</td>
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
        .badge {
          display: inline-block;
          padding: 2px 8px;
          border-radius: 12px;
          font-size: 10px;
          font-weight: 600;
          letter-spacing: 0.02em;
        }
        .badge-holiday {
          background: #fef3c7;
          color: #92400e;
          border: 1px solid #fcd34d;
        }
        .badge-vacation {
          background: #cffafe;
          color: #155e75;
          border: 1px solid #67e8f9;
        }
        .counters {
          font-size: 11px;
          color: #6b7280;
          margin-top: 2px;
        }
        .summary-card.pay {
          background: #dcfce7;
          border-color: #86efac;
        }
        .summary-card.vacation-pris {
          background: #cffafe;
          border-color: #67e8f9;
        }
        .summary-card.holiday-pris {
          background: #fef3c7;
          border-color: #fcd34d;
        }
        .totals-row {
          display: flex;
          gap: 12px;
          margin-bottom: 18px;
          flex-wrap: wrap;
        }
      </style>
    </head>
    <body>
      <h1>Rapport d'heures</h1>
      <div class="period">Salarié : ${userName}</div>
      <div class="period">Période : du ${formatHumanDate(from)} au ${formatHumanDate(to)}</div>
      <div class="totals-row">
        <div class="summary-card pay">
          <div class="summary-title">Heures à payer</div>
          <div class="summary-value">${minutesToHHMM(totalMinutes)}</div>
        </div>
        ${vacationCount > 0 ? `
        <div class="summary-card vacation-pris">
          <div class="summary-title">Pris sur vacances</div>
          <div class="summary-value">${minutesToHHMM(prisSurVacances)}</div>
          <div class="counters">${vacationCount} jour${vacationCount > 1 ? "s" : ""}</div>
        </div>` : ""}
        ${holidayCount > 0 ? `
        <div class="summary-card holiday-pris">
          <div class="summary-title">Pris sur fériés</div>
          <div class="summary-value">${minutesToHHMM(prisSurFeries)}</div>
          <div class="counters">${holidayCount} jour${holidayCount > 1 ? "s" : ""}</div>
        </div>` : ""}
      </div>
      <div class="summary">
        ${summaryHtml}
      </div>
      <table>
        <thead>
          <tr>
            <th>Jour</th>
            <th>Type</th>
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

    // Si le paramètre 'sendEmail' est présent, on envoie le mail
    if (req.query.sendEmail === "true") {
      try {
        await transporter.sendMail({
          from: process.env.MAIL_FROM || '"Feuille de temps" <noreply@globalti.ca>',
          to: process.env.MAIL_TO || "fredj@globalti.ca",
          subject: `Rapport de temps - ${userName} - ${from}`,
          text: `Bonjour,\n\nVoici le rapport de temps pour l'employé ${userName} pour la période du ${from} au ${to}.\n\nCordialement,\nL'équipe Feuille de temps`,
          attachments: [
            {
              filename: `rapport-heures-${userName}-${from}.pdf`,
              content: pdfBuffer,
            },
          ],
        });
        // On pourrait ajouter un header ou une info pour confirmer l'envoi
        res.setHeader("X-Email-Sent", "true");
      } catch (mailErr) {
        console.error("Erreur envoi email:", mailErr);
        // On continue quand même pour servir le PDF au user
      }
    }

    return res.send(pdfBuffer);
  } catch (err) {
    console.error("Erreur génération PDF", err);
    return res
      .status(500)
      .json({ error: "Erreur lors de la génération du PDF" });
  }
});

export default router;

