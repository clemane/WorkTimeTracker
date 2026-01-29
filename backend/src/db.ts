import Database from "better-sqlite3";
import path from "path";
import { WorkSession } from "./types";

const dbPath = path.join(process.cwd(), "worktime.db");
const db = new Database(dbPath);

db.pragma("journal_mode = WAL");

db.exec(`
  CREATE TABLE IF NOT EXISTS work_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER,
    date TEXT NOT NULL,
    arrival_time TEXT NOT NULL,
    departure_time TEXT NOT NULL,
    break_minutes INTEGER NOT NULL DEFAULT 0,
    remote_minutes INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at TEXT NOT NULL
  );
`);

// S'assure que la colonne user_id existe bien (migration simple)
const workSessionColumns = db
  .prepare("PRAGMA table_info(work_sessions)")
  .all() as { name: string }[];

if (!workSessionColumns.some((c) => c.name === "user_id")) {
  db.exec("ALTER TABLE work_sessions ADD COLUMN user_id INTEGER");
}

// Check for timesheet_mode in users
const userColumns = db
  .prepare("PRAGMA table_info(users)")
  .all() as { name: string }[];

if (!userColumns.some((c) => c.name === "timesheet_mode")) {
  db.exec("ALTER TABLE users ADD COLUMN timesheet_mode TEXT DEFAULT 'bi-weekly'");
}

if (!userColumns.some((c) => c.name === "working_days")) {
  // Par défaut : 0,1,2,3,4 (Lundi à Vendredi) - Stocké en JSON
  db.exec("ALTER TABLE users ADD COLUMN working_days TEXT DEFAULT '[0,1,2,3,4]'");
}

if (!userColumns.some((c) => c.name === "default_arrival")) {
  db.exec("ALTER TABLE users ADD COLUMN default_arrival TEXT DEFAULT '07:30'");
}

if (!userColumns.some((c) => c.name === "default_departure")) {
  db.exec("ALTER TABLE users ADD COLUMN default_departure TEXT DEFAULT '16:30'");
}


// Seed de base pour les utilisateurs si la table est vide
const existingUsers = db.prepare("SELECT COUNT(*) as c FROM users").get() as {
  c: number;
};

if (existingUsers.c === 0) {
  const now = new Date().toISOString();
  const insert = db.prepare(
    "INSERT INTO users (username, password, created_at) VALUES (?, ?, ?)"
  );
  // Clément (mot de passe fourni)
  insert.run("clemane", "#0796Tl!2968", now);
  // Florian (mot de passe arbitraire)
  insert.run("floriantoine", "flori-pass-123", now);
}

export function getDb() {
  return db;
}

export function mapRowToWorkSession(row: any): WorkSession {
  return {
    id: row.id,
    user_id: row.user_id,
    date: row.date,
    arrival_time: row.arrival_time,
    departure_time: row.departure_time,
    break_minutes: row.break_minutes,
    remote_minutes: row.remote_minutes,
    notes: row.notes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

