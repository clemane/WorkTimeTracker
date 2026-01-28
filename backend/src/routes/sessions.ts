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

  const now = new Date().toISOString();
  const results: WorkSession[] = [];

  for (const s of body.sessions) {
    if (!s.date || !isValidDate(s.date)) continue;
    if (!s.arrival_time || !isValidTime(s.arrival_time)) continue;
    if (!s.departure_time || !isValidTime(s.departure_time)) continue;

    const breakMinutes = s.break_minutes ?? 0;
    const remoteMinutes = s.remote_minutes ?? null;
    const notes = s.notes ?? null;

    const existing = db
      .prepare(
        "SELECT id FROM work_sessions WHERE date = ? AND user_id = ?"
      )
      .get(s.date, userIdNum) as { id: number } | undefined;

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

