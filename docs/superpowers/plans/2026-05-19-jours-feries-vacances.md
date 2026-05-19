# Jours fériés et vacances — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre à un utilisateur de marquer chaque jour de sa feuille de temps comme Normal, Férié ou Vacances. Les jours non-normaux affichent un champ simplifié « Heures travaillées » au lieu d'arrivée/départ/pause/distant, et apparaissent avec un tag coloré dans l'UI et les rapports PDF/Excel.

**Architecture:** Approche A (validée dans le spec) — deux nouvelles colonnes sur `work_sessions` (`day_type` TEXT DEFAULT `'normal'`, `worked_minutes` INTEGER NULL). Migration via ALTER TABLE conditionnel (pattern existant). Aucun test automatisé dans ce projet — chaque tâche se termine par une vérification manuelle via curl et/ou navigateur.

**Tech Stack:** TypeScript, Express, better-sqlite3, Vue 3 (Composition API), Tailwind CSS 4, Lucide icons, Puppeteer (PDF), ExcelJS (Excel).

**Spec source:** `docs/superpowers/specs/2026-05-19-jours-feries-vacances-design.md`

---

## File structure

**Files modifiés :**
- `backend/src/db.ts` — 2 ALTER TABLE conditionnels + `mapRowToWorkSession` retourne les 2 nouveaux champs
- `backend/src/types.ts` — type `DayType` + champs sur `WorkSession`
- `backend/src/routes/sessions.ts` — endpoint `POST /sessions/bulk` accepte/valide `day_type` et `worked_minutes`
- `backend/src/routes/report.ts` — fonction `computeNetMinutes` qui gère day_type, tag jaune/bleu dans le PDF, colonne Type dans Excel, compteurs sous le total
- `frontend/src/services/api.ts` — type `DayType` exporté + champs sur `WorkSession`
- `frontend/src/components/WeekForm.vue` — sélecteur 3 états, rendu conditionnel par jour, calcul net, fallback brouillon

**Files créés :** aucun (toute la logique vit dans les fichiers existants — projet petit, pas besoin de découpage).

---

## Task 1 : Migration DB + types backend

**Files:**
- Modify: `backend/src/db.ts` (block de migrations + mapRowToWorkSession)
- Modify: `backend/src/types.ts`

- [ ] **Step 1 : Ajouter le type `DayType` dans `backend/src/types.ts`**

Remplacer tout le contenu du fichier par :

```ts
export type DayType = "normal" | "holiday" | "vacation";

export interface WorkSession {
  id?: number;
  user_id?: number;
  date: string; // YYYY-MM-DD
  arrival_time: string; // HH:MM
  departure_time: string; // HH:MM
  break_minutes: number;
  remote_minutes?: number | null;
  notes?: string | null;
  day_type: DayType;
  worked_minutes?: number | null;
  created_at?: string;
  updated_at?: string;
}
```

- [ ] **Step 2 : Ajouter les migrations dans `backend/src/db.ts`**

Repérer le bloc de migrations `work_sessions` (juste après le bloc qui vérifie `user_id`). Insérer ces deux ALTER TABLE juste après ce bloc :

```ts
if (!workSessionColumns.some((c) => c.name === "day_type")) {
  db.exec("ALTER TABLE work_sessions ADD COLUMN day_type TEXT DEFAULT 'normal'");
}

if (!workSessionColumns.some((c) => c.name === "worked_minutes")) {
  db.exec("ALTER TABLE work_sessions ADD COLUMN worked_minutes INTEGER");
}
```

- [ ] **Step 3 : Mettre à jour `mapRowToWorkSession`**

Remplacer la fonction `mapRowToWorkSession` (en bas de `backend/src/db.ts`) par :

```ts
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
    day_type: (row.day_type as DayType) ?? "normal",
    worked_minutes: row.worked_minutes,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
```

Et au sommet du fichier, mettre à jour l'import :

```ts
import { WorkSession, DayType } from "./types";
```

- [ ] **Step 4 : Vérifier la migration**

Démarrer le backend et vérifier le schéma :

```bash
cd /home/clement/Documents/GlobalTi/Test/backend && npm run dev
```

Dans un autre terminal :

```bash
sqlite3 /home/clement/Documents/GlobalTi/Test/backend/worktime.db "PRAGMA table_info(work_sessions);"
```

Expected : la sortie contient les colonnes `day_type` (TEXT, default `'normal'`) et `worked_minutes` (INTEGER, nullable).

Arrêter le backend (Ctrl+C) après vérification.

- [ ] **Step 5 : Commit**

```bash
cd /home/clement/Documents/GlobalTi/Test && git add backend/src/db.ts backend/src/types.ts && git commit -m "feat(db): ajoute day_type et worked_minutes sur work_sessions"
```

---

## Task 2 : Validation et persistance dans le bulk endpoint

**Files:**
- Modify: `backend/src/routes/sessions.ts` (handler `POST /bulk`)

- [ ] **Step 1 : Mettre à jour le handler `POST /sessions/bulk`**

Dans `backend/src/routes/sessions.ts`, remplacer tout le contenu de la route `router.post("/bulk", ...)` par :

```ts
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

  const user = db
    .prepare("SELECT working_days FROM users WHERE id = ?")
    .get(userIdNum) as { working_days: string } | undefined;
  let workingDays = [0, 1, 2, 3, 4];
  if (user && user.working_days) {
    try {
      workingDays = JSON.parse(user.working_days);
    } catch {}
  }

  const getDayIndex = (dStr: string) => {
    const d = new Date(dStr + "T12:00:00");
    const day = d.getDay();
    return day === 0 ? 6 : day - 1;
  };

  for (const s of body.sessions) {
    if (!s.date || !isValidDate(s.date)) continue;

    const dayIdx = getDayIndex(s.date);
    const isWorkingDay = workingDays.includes(dayIdx);

    const existing = db
      .prepare("SELECT id FROM work_sessions WHERE date = ? AND user_id = ?")
      .get(s.date, userIdNum) as { id: number } | undefined;

    if (!isWorkingDay) {
      if (existing) {
        db.prepare("DELETE FROM work_sessions WHERE id = ?").run(existing.id);
      }
      continue;
    }

    const dayType: "normal" | "holiday" | "vacation" =
      s.day_type === "holiday" || s.day_type === "vacation" ? s.day_type : "normal";

    let arrivalTime = s.arrival_time;
    let departureTime = s.departure_time;
    let breakMinutes = s.break_minutes ?? 0;
    let remoteMinutes = s.remote_minutes ?? null;
    let workedMinutes: number | null = null;

    if (dayType === "normal") {
      if (!arrivalTime || !isValidTime(arrivalTime)) continue;
      if (!departureTime || !isValidTime(departureTime)) continue;
    } else {
      // Non-normal day : on garde arrival/departure si valides (pour préserver l'état),
      // sinon on met des valeurs par défaut inoffensives.
      if (!arrivalTime || !isValidTime(arrivalTime)) arrivalTime = "00:00";
      if (!departureTime || !isValidTime(departureTime)) departureTime = "00:00";
      const wm = Number(s.worked_minutes);
      workedMinutes = Number.isInteger(wm) && wm >= 0 ? wm : 0;
    }

    const notes = s.notes ?? null;

    if (existing) {
      db.prepare(
        `UPDATE work_sessions
         SET arrival_time = ?, departure_time = ?, break_minutes = ?,
             remote_minutes = ?, notes = ?, day_type = ?, worked_minutes = ?,
             updated_at = ?
         WHERE id = ?`
      ).run(
        arrivalTime,
        departureTime,
        breakMinutes,
        remoteMinutes,
        notes,
        dayType,
        workedMinutes,
        now,
        existing.id
      );
      const row = db
        .prepare("SELECT * FROM work_sessions WHERE id = ?")
        .get(existing.id);
      results.push(mapRowToWorkSession(row));
    } else {
      const info = db
        .prepare(
          `INSERT INTO work_sessions
           (user_id, date, arrival_time, departure_time, break_minutes,
            remote_minutes, notes, day_type, worked_minutes, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        )
        .run(
          userIdNum,
          s.date,
          arrivalTime,
          departureTime,
          breakMinutes,
          remoteMinutes,
          notes,
          dayType,
          workedMinutes,
          now,
          now
        );
      const row = db
        .prepare("SELECT * FROM work_sessions WHERE id = ?")
        .get(info.lastInsertRowid);
      results.push(mapRowToWorkSession(row));
    }
  }

  res.status(200).json(results);
});
```

- [ ] **Step 2 : Vérifier que le backend démarre toujours**

```bash
cd /home/clement/Documents/GlobalTi/Test/backend && npm run dev
```

Expected : message `Server listening on port 4001` (ou équivalent), pas d'erreur TypeScript. Laisser tourner.

- [ ] **Step 3 : Tester un POST bulk avec un jour Vacances via curl**

Dans un autre terminal, récupérer l'ID du user :

```bash
sqlite3 /home/clement/Documents/GlobalTi/Test/backend/worktime.db "SELECT id, username FROM users LIMIT 5;"
```

Récupérer l'ID (probablement 1). Puis envoyer une session de type vacation :

```bash
curl -s -X POST http://localhost:4001/api/sessions/bulk \
  -H "Content-Type: application/json" \
  -d '{
    "userId": 1,
    "sessions": [
      {"date":"2026-05-18","arrival_time":"08:00","departure_time":"16:30","break_minutes":60,"remote_minutes":0,"notes":"normal","day_type":"normal"},
      {"date":"2026-05-19","arrival_time":"00:00","departure_time":"00:00","break_minutes":0,"remote_minutes":0,"notes":"vacances","day_type":"vacation","worked_minutes":240}
    ]
  }'
```

Expected : réponse JSON contenant 2 sessions, la première avec `"day_type":"normal"` et `"worked_minutes":null`, la seconde avec `"day_type":"vacation"` et `"worked_minutes":240`.

- [ ] **Step 4 : Vérifier en DB**

```bash
sqlite3 /home/clement/Documents/GlobalTi/Test/backend/worktime.db "SELECT date, day_type, worked_minutes FROM work_sessions WHERE date IN ('2026-05-18','2026-05-19');"
```

Expected : deux lignes, la seconde avec `vacation|240`.

- [ ] **Step 5 : Nettoyer les sessions de test**

```bash
sqlite3 /home/clement/Documents/GlobalTi/Test/backend/worktime.db "DELETE FROM work_sessions WHERE date IN ('2026-05-18','2026-05-19');"
```

- [ ] **Step 6 : Commit**

Arrêter le backend (Ctrl+C). Puis :

```bash
cd /home/clement/Documents/GlobalTi/Test && git add backend/src/routes/sessions.ts && git commit -m "feat(sessions): supporte day_type et worked_minutes dans le bulk endpoint"
```

---

## Task 3 : Rapports PDF et Excel — gestion des day_type

**Files:**
- Modify: `backend/src/routes/report.ts`

- [ ] **Step 1 : Mettre à jour `computeNetMinutes` pour gérer day_type**

Dans `backend/src/routes/report.ts`, remplacer la fonction `computeNetMinutes` par :

```ts
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
```

Ajouter aussi cette fonction helper juste en-dessous (utilisée par PDF et Excel) :

```ts
function dayTypeLabel(t: WorkSession["day_type"]): string {
  if (t === "holiday") return "Férié";
  if (t === "vacation") return "Vacances";
  return "";
}
```

- [ ] **Step 2 : Ajouter la colonne Type dans l'Excel bulk**

Dans `backend/src/routes/report.ts`, repérer le bloc `worksheet.columns = [...]` du handler `/bulk`. Le remplacer par :

```ts
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
```

Puis dans le même handler, modifier le `sessions.forEach` qui suit. Le remplacer par :

```ts
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
```

- [ ] **Step 3 : Ajouter la colonne Type dans l'Excel single**

Repérer le second `worksheet.columns = [...]` (dans le handler `GET /api/report`). Le remplacer par :

```ts
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
```

Et remplacer le bloc `sessions.forEach(s => { worksheet.addRow({...}); });` correspondant par :

```ts
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
```

- [ ] **Step 4 : Ajouter le tag coloré et la colonne Type dans le HTML du PDF**

Dans le même fichier, repérer le bloc `const htmlRows = sessions.map((s) => {...}).join("\n");`. Le remplacer par :

```ts
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
```

- [ ] **Step 5 : Ajouter la colonne Type au header du tableau PDF**

Dans le même fichier, dans le template HTML (string littérale qui commence par `<!doctype html>`), repérer le `<thead>`. Le remplacer par :

```html
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
```

- [ ] **Step 6 : Ajouter les styles des badges et le sous-titre compteurs**

Dans le bloc `<style>` du template HTML, ajouter à la fin (juste avant `</style>`) :

```css
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
```

Calculer les compteurs juste avant la génération de `summaryHtml` (avant `let summaryHtml = "";`). Ajouter :

```ts
const holidayCount = sessions.filter((s) => s.day_type === "holiday").length;
const vacationCount = sessions.filter((s) => s.day_type === "vacation").length;
const counterParts: string[] = [];
if (holidayCount > 0) counterParts.push(`${holidayCount} jour${holidayCount > 1 ? "s" : ""} férié${holidayCount > 1 ? "s" : ""}`);
if (vacationCount > 0) counterParts.push(`${vacationCount} jour${vacationCount > 1 ? "s" : ""} de vacances`);
const countersLine = counterParts.length > 0
  ? `<div class="counters">${counterParts.join(" · ")}</div>`
  : "";
```

Puis dans la summary-card total (chercher `<div class="summary-card total">`), modifier la card pour inclure les compteurs sous la valeur :

```html
<div class="summary-card total">
  <div class="summary-title">Total Période</div>
  <div class="summary-value">${minutesToHHMM(totalMinutes)}</div>
  ${countersLine}
</div>
```

- [ ] **Step 7 : Vérifier que le backend compile et démarre**

```bash
cd /home/clement/Documents/GlobalTi/Test/backend && npm run dev
```

Expected : pas d'erreur TypeScript, serveur démarre. Laisser tourner.

- [ ] **Step 8 : Tester le PDF avec une session vacation**

Insérer une session test, puis générer le PDF :

```bash
sqlite3 /home/clement/Documents/GlobalTi/Test/backend/worktime.db "INSERT INTO work_sessions (user_id, date, arrival_time, departure_time, break_minutes, remote_minutes, notes, day_type, worked_minutes, created_at, updated_at) VALUES (1, '2026-05-18', '08:00', '16:30', 60, 0, 'test normal', 'normal', NULL, datetime('now'), datetime('now')), (1, '2026-05-19', '00:00', '00:00', 0, 0, 'test vacances', 'vacation', 240, datetime('now'), datetime('now'));"
```

Générer le PDF :

```bash
curl -s "http://localhost:4001/api/report?monday=2026-05-18&userId=1&mode=weekly&format=pdf" -o /tmp/test-report.pdf && ls -la /tmp/test-report.pdf
```

Expected : fichier PDF généré, taille non-nulle. Ouvrir avec `xdg-open /tmp/test-report.pdf` et vérifier visuellement : ligne du 19 mai a un badge cyan « Vacances », arrivée/départ vides, total net = 04:00, sous-titre « 1 jour de vacances » sous le total.

- [ ] **Step 9 : Tester l'Excel**

```bash
curl -s "http://localhost:4001/api/report?monday=2026-05-18&userId=1&mode=weekly&format=excel" -o /tmp/test-report.xlsx && ls -la /tmp/test-report.xlsx
```

Expected : fichier xlsx généré. Ouvrir avec LibreOffice et vérifier : colonne Type, ligne du 19 mai a « Vacances » dans Type et 04:00 dans Total, arrivée/départ vides.

- [ ] **Step 10 : Nettoyer**

```bash
sqlite3 /home/clement/Documents/GlobalTi/Test/backend/worktime.db "DELETE FROM work_sessions WHERE date IN ('2026-05-18','2026-05-19');"
rm /tmp/test-report.pdf /tmp/test-report.xlsx
```

- [ ] **Step 11 : Commit**

Arrêter le backend (Ctrl+C). Puis :

```bash
cd /home/clement/Documents/GlobalTi/Test && git add backend/src/routes/report.ts && git commit -m "feat(report): affiche badge et compteurs pour jours fériés/vacances dans PDF et Excel"
```

---

## Task 4 : Frontend — types et service API

**Files:**
- Modify: `frontend/src/services/api.ts`

- [ ] **Step 1 : Mettre à jour les types dans `frontend/src/services/api.ts`**

Tout en haut du fichier, juste avant l'`interface WorkSession`, ajouter :

```ts
export type DayType = "normal" | "holiday" | "vacation";
```

Puis remplacer l'interface `WorkSession` par :

```ts
export interface WorkSession {
  id?: number;
  user_id?: number;
  date: string;
  arrival_time: string;
  departure_time: string;
  break_minutes: number;
  remote_minutes?: number | null;
  notes?: string | null;
  day_type: DayType;
  worked_minutes?: number | null;
  created_at?: string;
  updated_at?: string;
}
```

(Le type `SessionPayload = Omit<WorkSession, "id" | "created_at" | "updated_at">` en bas du fichier hérite automatiquement des nouveaux champs — ne rien y changer.)

- [ ] **Step 2 : Vérifier que TypeScript compile côté frontend**

```bash
cd /home/clement/Documents/GlobalTi/Test/frontend && npx vue-tsc --noEmit 2>&1 | head -40
```

Expected : pas d'erreur (ou seulement des erreurs préexistantes non liées). Si le frontend n'a pas `vue-tsc`, sauter cette vérif ; la prochaine étape (build du composant) le détectera.

- [ ] **Step 3 : Commit**

```bash
cd /home/clement/Documents/GlobalTi/Test && git add frontend/src/services/api.ts && git commit -m "feat(api): expose DayType et nouveaux champs sur WorkSession"
```

---

## Task 5 : Frontend — sélecteur 3 états et rendu conditionnel dans WeekForm

**Files:**
- Modify: `frontend/src/components/WeekForm.vue` (script setup + template)

- [ ] **Step 1 : Importer DayType et ajouter les icônes**

Dans `frontend/src/components/WeekForm.vue`, modifier la première ligne d'import (en haut du `<script setup>`) :

```ts
import type { WorkSession, DayType } from "../services/api";
```

Puis ajouter `Sun` et `Palmtree` à l'import lucide-vue-next existant. Le bloc d'import lucide devient :

```ts
import { 
  ChevronLeft, 
  ChevronRight, 
  Download, 
  Save, 
  Clock, 
  Coffee, 
  Home, 
  StickyNote,
  CheckCircle2,
  Calendar as CalendarIcon,
  LogOut,
  Loader2,
  Mail,
  Sun,
  Palmtree
} from "lucide-vue-next";
```

- [ ] **Step 2 : Mettre à jour le type DayRow et la fonction de calcul**

Repérer `type DayRow = { ... }`. Le remplacer par :

```ts
type DayRow = {
  date: string;
  arrival_time: string;
  departure_time: string;
  break_minutes: number;
  remote_minutes: number;
  notes: string;
  day_type: DayType;
  worked_minutes: number;
  id?: number;
};

function computeRowNet(r: DayRow): number {
  if (r.day_type === "holiday" || r.day_type === "vacation") {
    return r.worked_minutes ?? 0;
  }
  return computeNetMinutes(r.arrival_time, r.departure_time, r.break_minutes, r.remote_minutes);
}
```

- [ ] **Step 3 : Mettre à jour `buildDefaultRow`**

Repérer la fonction `buildDefaultRow`. La remplacer par :

```ts
function buildDefaultRow(date: string): DayRow {
  const existing = sessionsByDate.value[date];
  if (existing) {
    return {
      date: existing.date,
      arrival_time: existing.arrival_time,
      departure_time: existing.departure_time,
      break_minutes: existing.break_minutes,
      remote_minutes: existing.remote_minutes ?? 0,
      notes: existing.notes ?? "",
      day_type: existing.day_type ?? "normal",
      worked_minutes: existing.worked_minutes ?? 0,
      id: existing.id,
    };
  }
  return {
    date,
    arrival_time: defaultArrival.value,
    departure_time: defaultDeparture.value,
    break_minutes: defaultBreak.value,
    remote_minutes: 0,
    notes: "",
    day_type: "normal",
    worked_minutes: 0,
  };
}
```

- [ ] **Step 4 : Mettre à jour `applyDraft` pour fallback sur les anciens brouillons**

Repérer la fonction `applyDraft`. La remplacer par :

```ts
function applyDraft(monday: string, current: DayRow[]): DayRow[] {
  if (typeof window === "undefined") return current;
  try {
    const raw = window.localStorage.getItem(getDraftKey(monday));
    if (!raw) return current;
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.monday !== monday || !Array.isArray(parsed.rows)) {
      return current;
    }
    const byDate = new Map(parsed.rows.map((r: any) => [r.date, r]));
    return current.map((r) => {
      const draft = byDate.get(r.date);
      if (!draft) return r;
      const merged: DayRow = { ...r, ...(draft as object) } as DayRow;
      if (merged.day_type !== "normal" && merged.day_type !== "holiday" && merged.day_type !== "vacation") {
        merged.day_type = "normal";
      }
      if (typeof merged.worked_minutes !== "number") {
        merged.worked_minutes = 0;
      }
      return merged;
    });
  } catch {
    return current;
  }
}
```

- [ ] **Step 5 : Mettre à jour `netByIndex` et `totalNetMinutes`**

Repérer `const netByIndex = (i: number) => {...}`. La remplacer par :

```ts
const netByIndex = (i: number) => {
  const r = rows.value[i];
  if (!r) return "00:00";
  return minutesToHHMM(computeRowNet(r));
};
```

Repérer `const totalNetMinutes = computed(...)`. Modifier seulement le calcul interne (garder la condition `workingDays.value.includes(dayIndex)`) :

```ts
const totalNetMinutes = computed(() => {
  return rows.value.reduce((acc, r) => {
    const d = new Date(r.date + "T12:00:00");
    let dayIndex = d.getDay(); 
    dayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
    
    if (workingDays.value.includes(dayIndex)) {
        return acc + computeRowNet(r);
    }
    return acc;
  }, 0);
});
```

- [ ] **Step 6 : Mettre à jour `saveWeek` pour envoyer les nouveaux champs**

Repérer `async function saveWeek()`. Remplacer le `payloads` à l'intérieur par :

```ts
const payloads: SessionPayload[] = rows.value.map((r) => ({
  date: r.date,
  arrival_time: r.arrival_time,
  departure_time: r.departure_time,
  break_minutes: r.break_minutes,
  remote_minutes: r.remote_minutes,
  notes: r.notes || undefined,
  day_type: r.day_type,
  worked_minutes: r.day_type === "normal" ? null : r.worked_minutes,
}));
```

- [ ] **Step 7 : Ajouter le sélecteur 3 états dans le template**

Dans `frontend/src/components/WeekForm.vue`, repérer la boucle `v-for="row in week"` qui ouvre `<div class="group bg-surface/40 ...">`. À l'intérieur de cette div, juste après le `<div class="flex justify-between items-start mb-6">...</div>` qui affiche le jour et le total Net, ajouter :

```vue
<div class="flex items-center gap-1 mb-4 bg-canvas border border-border rounded-2xl p-1">
  <button
    type="button"
    @click="row.day_type = 'normal'"
    :class="[
      'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-bold uppercase rounded-xl transition-all',
      row.day_type === 'normal' ? 'bg-primary text-primary-text' : 'text-text-muted hover:text-text-body'
    ]"
  >
    Normal
  </button>
  <button
    type="button"
    @click="row.day_type = 'holiday'"
    :class="[
      'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-bold uppercase rounded-xl transition-all',
      row.day_type === 'holiday' ? 'bg-amber-400 text-amber-950' : 'text-text-muted hover:text-text-body'
    ]"
  >
    <Sun class="h-3 w-3" /> Férié
  </button>
  <button
    type="button"
    @click="row.day_type = 'vacation'"
    :class="[
      'flex-1 flex items-center justify-center gap-1 px-2 py-1.5 text-[10px] font-bold uppercase rounded-xl transition-all',
      row.day_type === 'vacation' ? 'bg-cyan-400 text-cyan-950' : 'text-text-muted hover:text-text-body'
    ]"
  >
    <Palmtree class="h-3 w-3" /> Vacances
  </button>
</div>
```

- [ ] **Step 8 : Wrapper le contenu existant dans un v-if normal + ajouter le bloc spécial**

Dans la même boucle, repérer le `<div class="space-y-4">` qui contient arrivée/départ/pause/distant/notes. Ajouter `v-if="row.day_type === 'normal'"` à ce div :

```vue
<div v-if="row.day_type === 'normal'" class="space-y-4">
  <!-- contenu existant inchangé : grille arrivée/départ, pause/distant, notes -->
</div>
```

Juste après ce div (et toujours à l'intérieur de la carte jour), ajouter le bloc pour les jours férié/vacances :

```vue
<div v-else class="space-y-4">
  <div class="flex items-center gap-2 px-3 py-2 rounded-2xl"
       :class="row.day_type === 'holiday' ? 'bg-amber-400/10 border border-amber-400/30 text-amber-300' : 'bg-cyan-400/10 border border-cyan-400/30 text-cyan-300'">
    <Sun v-if="row.day_type === 'holiday'" class="h-4 w-4" />
    <Palmtree v-else class="h-4 w-4" />
    <span class="text-xs font-bold uppercase tracking-wider">
      {{ row.day_type === 'holiday' ? 'Jour férié' : 'Jour de vacances' }}
    </span>
  </div>

  <div class="space-y-1">
    <label class="text-[10px] font-bold uppercase text-text-muted flex items-center gap-1">
      <Clock class="h-3 w-3" /> Heures travaillées
    </label>
    <TimeInput :model-value="minutesToHHMM(row.worked_minutes)" @update:model-value="(v: string) => { const [h,m] = v.split(':').map(x => parseInt(x,10)); row.worked_minutes = (isNaN(h)?0:h)*60 + (isNaN(m)?0:m); }" />
    <p class="text-[10px] text-text-muted">Laisser 00:00 si aucune heure travaillée.</p>
  </div>

  <div class="space-y-1">
    <label class="text-[10px] font-bold uppercase text-text-muted flex items-center gap-1">
      <StickyNote class="h-3 w-3" /> Notes
    </label>
    <input v-model="row.notes" type="text" placeholder="..." class="w-full bg-canvas border border-border rounded-xl px-3 py-2 text-xs outline-none focus:border-primary transition-all text-text-body placeholder:text-text-muted" />
  </div>
</div>
```

- [ ] **Step 9 : Démarrer frontend + backend et tester visuellement**

Terminal 1 :

```bash
cd /home/clement/Documents/GlobalTi/Test/backend && npm run dev
```

Terminal 2 :

```bash
cd /home/clement/Documents/GlobalTi/Test/frontend && npm run dev
```

Ouvrir `http://localhost:4000` dans un navigateur. Se connecter (admin / changeme par défaut si premier lancement).

Expected sur chaque carte jour :
- Sélecteur 3 états visible (Normal actif par défaut, surligné couleur primary)
- Cliquer sur Férié : couleur amber, le contenu de la carte passe en bloc « Jour férié » + champ Heures travaillées (HH:MM) + Notes. Champs arrivée/départ disparus.
- Cliquer sur Vacances : couleur cyan, idem avec « Jour de vacances ».
- Cliquer sur Normal : retour aux 4 champs habituels, avec les valeurs précédentes intactes.
- Saisir 04:00 dans Heures travaillées d'un jour vacances → le total Net en haut à droite de la carte affiche 04:00.
- Le total Période en haut de la page reflète bien la somme (working days uniquement).

- [ ] **Step 10 : Tester la persistance**

Cliquer sur le bouton Enregistrer. Expected : message « Enregistré ! » s'affiche.

Recharger la page (F5). Expected : la sélection Férié/Vacances et les heures travaillées sont restaurées. Repasser un jour vacances en Normal : les anciennes valeurs arrivée/départ reviennent (puisqu'elles sont restées en DB).

- [ ] **Step 11 : Tester l'export PDF depuis l'UI**

Cliquer sur le bouton PDF dans la barre d'action en bas. Expected : un PDF s'ouvre dans un nouvel onglet, avec les badges colorés sur les jours férié/vacances et le sous-titre compteurs.

- [ ] **Step 12 : Nettoyer les données de test**

Via la DB ou via l'UI, supprimer les sessions de test si besoin.

- [ ] **Step 13 : Commit**

Arrêter backend et frontend (Ctrl+C dans chaque terminal). Puis :

```bash
cd /home/clement/Documents/GlobalTi/Test && git add frontend/src/components/WeekForm.vue && git commit -m "feat(weekform): sélecteur 3 états (Normal/Férié/Vacances) avec rendu conditionnel"
```

---

## Self-review final

- [ ] **Step 1 : Tests croisés**

- Marquer une période complète (10 jours) avec mix Normal/Férié/Vacances, certains jours avec heures travaillées non nulles.
- Recharger la page : tout est restauré.
- Générer PDF + Excel : les tags et compteurs sont corrects, les totaux somment correctement les `worked_minutes` des jours spéciaux + les nets normaux.
- Passer en mode `weekly` puis `monthly` (sélecteur de profil) → la feature fonctionne dans tous les modes.

- [ ] **Step 2 : Vérifier qu'aucune régression sur les sessions normales**

- Créer une journée 100% normale comme avant la feature.
- Vérifier que le total est calculé exactement comme avant (arrivée 08:00, départ 16:30, pause 60 → net 08:00).
