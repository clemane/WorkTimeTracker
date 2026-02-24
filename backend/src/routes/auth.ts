import { Router, Request, Response } from "express";
import { getDb } from "../db";

const router = Router();
const db = getDb();

interface UserRow {
  id: number;
  username: string;
  password: string;
  timesheet_mode: string | null;
  working_days: string | null;
  default_arrival: string | null;
  default_departure: string | null;
}

// POST /api/auth/login { username, password }
router.post("/login", (req: Request, res: Response) => {
  const { username, password } = req.body as {
    username?: string;
    password?: string;
  };

  if (!username || !password) {
    return res
      .status(400)
      .json({ error: "username et password sont requis" });
  }

  const row = db
    .prepare<UserRow>("SELECT * FROM users WHERE username = ?")
    .get(username);

  if (!row || row.password !== password) {
    return res.status(401).json({ error: "Identifiants invalides" });
  }

  return res.json({ 
    id: row.id, 
    username: row.username, 
    timesheet_mode: row.timesheet_mode ?? "bi-weekly",
    working_days: row.working_days ? JSON.parse(row.working_days) : [0,1,2,3,4],
    default_arrival: row.default_arrival ?? "07:30",
    default_departure: row.default_departure ?? "16:30"
  });
});

// GET /api/auth/profile?username=...
router.get("/profile", (req: Request, res: Response) => {
  const { username } = req.query as { username?: string };
  if (!username) return res.status(400).json({ error: "Username required" });

  const row = db.prepare<UserRow>("SELECT * FROM users WHERE username = ?").get(username);
  if (!row) return res.status(404).json({ error: "User not found" });

  return res.json({
    id: row.id,
    username: row.username,
    timesheet_mode: row.timesheet_mode ?? "bi-weekly",
    working_days: row.working_days ? JSON.parse(row.working_days) : [0,1,2,3,4],
    default_arrival: row.default_arrival ?? "07:30",
    default_departure: row.default_departure ?? "16:30"
  });
});

// PUT /api/auth/profile
router.put("/profile", (req: Request, res: Response) => {
  const { id, timesheet_mode, working_days, default_arrival, default_departure } = req.body as { 
    id?: number; 
    timesheet_mode?: string;
    working_days?: number[];
    default_arrival?: string;
    default_departure?: string;
  };

  if (!id) {
    return res.status(400).json({ error: "id required" });
  }
  
  const updates: string[] = [];
  const values: any[] = [];

  if (timesheet_mode !== undefined) {
    updates.push("timesheet_mode = ?");
    values.push(timesheet_mode);
  }
  if (working_days !== undefined) {
    updates.push("working_days = ?");
    values.push(JSON.stringify(working_days));
  }
  if (default_arrival !== undefined) {
    updates.push("default_arrival = ?");
    values.push(default_arrival);
  }
  if (default_departure !== undefined) {
    updates.push("default_departure = ?");
    values.push(default_departure);
  }

  if (updates.length === 0) return res.json({ success: true });

  values.push(id);
  const sql = `UPDATE users SET ${updates.join(", ")} WHERE id = ?`;

  const result = db.prepare(sql).run(...values);
  
  if (result.changes === 0) return res.status(404).json({ error: "User not found" });

  return res.json({ success: true });
});

// POST /api/auth/change-password { username, currentPassword, newPassword }
router.post("/change-password", (req: Request, res: Response) => {
  const { username, currentPassword, newPassword } = req.body as {
    username?: string;
    currentPassword?: string;
    newPassword?: string;
  };

  if (!username || !currentPassword || !newPassword) {
    return res
      .status(400)
      .json({ error: "username, currentPassword et newPassword sont requis" });
  }

  const row = db
    .prepare<UserRow>("SELECT * FROM users WHERE username = ?")
    .get(username);

  if (!row || row.password !== currentPassword) {
    return res.status(401).json({ error: "Mot de passe actuel incorrect" });
  }

  db.prepare("UPDATE users SET password = ? WHERE id = ?").run(
    newPassword,
    row.id
  );

  return res.json({ ok: true });
});

export default router;

