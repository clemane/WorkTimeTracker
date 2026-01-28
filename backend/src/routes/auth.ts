import { Router, Request, Response } from "express";
import { getDb } from "../db";

const router = Router();
const db = getDb();

interface UserRow {
  id: number;
  username: string;
  password: string;
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

  return res.json({ id: row.id, username: row.username });
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

