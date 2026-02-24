import { Router, Request, Response } from "express";
import { getDb, mapRowToWorkSession } from "../db";
import { WorkSession } from "../types";

const router = Router();
const db = getDb();

function isValidDate(dateStr: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(dateStr);
}

function isValidTime(timeStr: string): boolean {
  return /^\d{2}:\d{2}$/.test(timeStr);
}

// GET /api/sessions?from=YYYY-MM-DD&to=YYYY-MM-DD&userId=number
router.get("/", (req: Request, res: Response) => {
  const { from, to, userId } = req.query as {
    from?: string;
    to?: string;
    userId?: string;
  };

  const userIdNum = Number(userId);
  if (!userId || !Number.isInteger(userIdNum)) {
    return res.status(400).json({ error: "userId requis" });
  }

  let sql = "SELECT * FROM work_sessions WHERE user_id = ?";
  const params: any[] = [userIdNum];

  if (from) {
    sql += " AND date >= ?";
    params.push(from);
  }
  if (to) {
    sql += " AND date <= ?";
    params.push(to);
  }

  sql += " ORDER BY date DESC";

  const rows = db.prepare(sql).all(...params);
  res.json(rows.map(mapRowToWorkSession));
});

// POST /api/sessions
router.post("/", (req: Request, res: Response) => {
  const body = req.body as WorkSession;

  if (!body.user_id || !Number.isInteger(body.user_id)) {
    return res.status(400).json({ error: "user_id requis" });
  }

  if (!body.date || !isValidDate(body.date)) {
    return res.status(400).json({ error: "date invalide (YYYY-MM-DD)" });
  }
  if (!body.arrival_time || !isValidTime(body.arrival_time)) {
    return res.status(400).json({ error: "arrival_time invalide (HH:MM)" });
  }
  if (!body.departure_time || !isValidTime(body.departure_time)) {
    return res.status(400).json({ error: "departure_time invalide (HH:MM)" });
  }

  const breakMinutes = body.break_minutes ?? 0;
  const remoteMinutes = body.remote_minutes ?? null;
  const notes = body.notes ?? null;
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT INTO work_sessions (
      user_id, date, arrival_time, departure_time,
      break_minutes, remote_minutes, notes,
      created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const info = stmt.run(
    body.user_id,
    body.date,
    body.arrival_time,
    body.departure_time,
    breakMinutes,
    remoteMinutes,
    notes,
    now,
    now
  );

  const row = db
    .prepare("SELECT * FROM work_sessions WHERE id = ?")
    .get(info.lastInsertRowid);

  res.status(201).json(mapRowToWorkSession(row));
});

// PUT /api/sessions/:id
router.put("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalide" });
  }

  const body = req.body as WorkSession;

  if (!body.date || !isValidDate(body.date)) {
    return res.status(400).json({ error: "date invalide (YYYY-MM-DD)" });
  }
  if (!body.arrival_time || !isValidTime(body.arrival_time)) {
    return res.status(400).json({ error: "arrival_time invalide (HH:MM)" });
  }
  if (!body.departure_time || !isValidTime(body.departure_time)) {
    return res.status(400).json({ error: "departure_time invalide (HH:MM)" });
  }

  const breakMinutes = body.break_minutes ?? 0;
  const remoteMinutes = body.remote_minutes ?? null;
  const notes = body.notes ?? null;
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    UPDATE work_sessions
    SET date = ?, arrival_time = ?, departure_time = ?,
        break_minutes = ?, remote_minutes = ?, notes = ?,
        updated_at = ?
    WHERE id = ?
  `);

  const info = stmt.run(
    body.date,
    body.arrival_time,
    body.departure_time,
    breakMinutes,
    remoteMinutes,
    notes,
    now,
    id
  );

  if (info.changes === 0) {
    return res.status(404).json({ error: "session non trouvée" });
  }

  const row = db
    .prepare("SELECT * FROM work_sessions WHERE id = ?")
    .get(id);

  res.json(mapRowToWorkSession(row));
});

// POST /api/sessions/bulk — upsert par date (lun–ven)
router.post("/bulk", (req: Request, res: Response) => {
  const body = req.body as { sessions: WorkSession[]; userId?: number };
  if (!Array.isArray(body.sessions)) {
    return res.status(400).json({ error: "sessions doit être un tableau" });
  }

  const userIdNum = Number(body.userId);
  if (!body.userId || !Number.isInteger(userIdNum)) {
    return res.status(400).json({ error: "userId requis" });
  }

  // Get user profile to check working days (or just check if we really want to insert?)
  // Actually, the frontend sends "rows". If user has filtered some days, they are NOT in the rows sent?
  // Let's check frontend WeekForm.vue.
  // Wait, frontend sends ALL rows from rows.value.
  // But rows.value contains EVERYTHING if unfiltered in JS, but filtered in template?
  // No, `rows` ref contains all days of the period.
  // `weeks` computed filters them for display.
  // So `saveWeek` sends ALL days including Saturday/Sunday even if not worked.
  
  // We should fetch the user to know their working days preference and ONLY save working days?
  // Or better: update the frontend to only send working days.
  // But let's look at the backend logic first.
  
  const now = new Date().toISOString();
  const results: WorkSession[] = [];

  // We fetch user settings to filter out non-working days if necessary?
  // Or simply trust the payload?
  // If the user UNCHECKS a day in their profile, they don't want it to be saved.
  // But `saveSessionsBulk` in frontend sends everything.
  
  const user = db.prepare("SELECT working_days FROM users WHERE id = ?").get(userIdNum) as { working_days: string } | undefined;
  let workingDays = [0, 1, 2, 3, 4]; // Default
  if (user && user.working_days) {
    try {
      workingDays = JSON.parse(user.working_days);
    } catch {}
  }

  // Helper to get day index 0-6 (Mon-Sun) from date string
  const getDayIndex = (dStr: string) => {
    const d = new Date(dStr + "T12:00:00");
    const day = d.getDay(); // 0=Sun
    return day === 0 ? 6 : day - 1; // 0=Mon, 6=Sun
  };

  for (const s of body.sessions) {
    if (!s.date || !isValidDate(s.date)) continue;
    
    // Check if this day is a working day for the user
    // If not, we should perhaps DELETE it if it exists, or just NOT insert/update it?
    // If we just skip it, existing Saturday sessions remain.
    // If we want to "clean" the week, we should probably delete non-working days if they exist.
    
    const dayIdx = getDayIndex(s.date);
    const isWorkingDay = workingDays.includes(dayIdx);
    
    const existing = db
      .prepare(
        "SELECT id FROM work_sessions WHERE date = ? AND user_id = ?"
      )
      .get(s.date, userIdNum) as { id: number } | undefined;

    if (!isWorkingDay) {
        // If it's not a working day but exists in DB, we should delete it to keep history clean
        if (existing) {
            db.prepare("DELETE FROM work_sessions WHERE id = ?").run(existing.id);
        }
        continue; // Skip saving/updating
    }

    if (!s.arrival_time || !isValidTime(s.arrival_time)) continue;
    if (!s.departure_time || !isValidTime(s.departure_time)) continue;

    const breakMinutes = s.break_minutes ?? 0;
    const remoteMinutes = s.remote_minutes ?? null;
    const notes = s.notes ?? null;

    if (existing) {
      db.prepare(`
        UPDATE work_sessions
        SET arrival_time = ?, departure_time = ?,
            break_minutes = ?, remote_minutes = ?, notes = ?,
            updated_at = ?
        WHERE id = ?
      `).run(s.arrival_time, s.departure_time, breakMinutes, remoteMinutes, notes, now, existing.id);
      const row = db.prepare("SELECT * FROM work_sessions WHERE id = ?").get(existing.id);
      results.push(mapRowToWorkSession(row));
    } else {
      const info = db.prepare(`
        INSERT INTO work_sessions (user_id, date, arrival_time, departure_time, break_minutes, remote_minutes, notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(userIdNum, s.date, s.arrival_time, s.departure_time, breakMinutes, remoteMinutes, notes, now, now);
      const row = db.prepare("SELECT * FROM work_sessions WHERE id = ?").get(info.lastInsertRowid);
      results.push(mapRowToWorkSession(row));
    }
  }

  res.status(200).json(results);
});

// DELETE /api/sessions/all — supprime tout l'historique
router.delete("/all", (_req: Request, res: Response) => {
  const info = db.prepare("DELETE FROM work_sessions").run();
  res.status(200).json({ deleted: info.changes ?? 0 });
});

// DELETE /api/sessions/period?monday=YYYY-MM-DD&userId=N — supprime toute la période (2 semaines)
router.delete("/period", (req: Request, res: Response) => {
  const { monday, userId } = req.query as { monday?: string; userId?: string };
  const userIdNum = Number(userId);
  if (!monday || !isValidDate(monday) || !userId || !Number.isInteger(userIdNum)) {
    return res.status(400).json({ error: "monday (YYYY-MM-DD) et userId requis" });
  }
  const endDate = new Date(monday + "T12:00:00");
  endDate.setDate(endDate.getDate() + 13);
  const endStr = endDate.toISOString().slice(0, 10);
  const stmt = db.prepare(
    "DELETE FROM work_sessions WHERE user_id = ? AND date >= ? AND date <= ?"
  );
  const info = stmt.run(userIdNum, monday, endStr);
  res.status(200).json({ deleted: info.changes ?? 0 });
});

// DELETE /api/sessions/:id
router.delete("/:id", (req: Request, res: Response) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) {
    return res.status(400).json({ error: "id invalide" });
  }

  const stmt = db.prepare("DELETE FROM work_sessions WHERE id = ?");
  const info = stmt.run(id);

  if (info.changes === 0) {
    return res.status(404).json({ error: "session non trouvée" });
  }

  res.status(204).send();
});

export default router;

