<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { WorkSession } from "../services/api";
import { saveSessionsBulk, type SessionPayload } from "../services/api";
import { computeNetMinutes, minutesToHHMM } from "../utils/time";
import {
  getMondayOfWeek,
  getTwoWeekDates,
  getDayLabel,
  formatDayShort,
} from "../utils/week";

const props = defineProps<{
  initialMonday?: string;
  existingSessions?: WorkSession[];
}>();

const emit = defineEmits<{
  (e: "saved"): void;
  (e: "update:weekStart", monday: string): void;
}>();

const today = new Date().toISOString().slice(0, 10);
const defaultMonday = getMondayOfWeek(today);
const weekStart = ref(props.initialMonday ?? defaultMonday);

watch(
  () => props.initialMonday,
  (val) => {
    if (val && val !== weekStart.value) weekStart.value = val;
  },
  { immediate: true }
);

const weekDates = computed(() => getTwoWeekDates(weekStart.value));

type DayRow = {
  date: string;
  arrival_time: string;
  departure_time: string;
  break_minutes: number;
  remote_minutes: number;
  notes: string;
  id?: number;
};

const sessionsByDate = computed(() => {
  const map: Record<string, WorkSession> = {};
  for (const s of props.existingSessions ?? []) {
    map[s.date] = s;
  }
  return map;
});

const rows = ref<DayRow[]>([]);

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
      id: existing.id,
    };
  }
  return {
    date,
    arrival_time: "07:30",
    departure_time: "16:30",
    break_minutes: 60,
    remote_minutes: 0,
    notes: "",
  };
}

type DraftRow = Pick<
  DayRow,
  "date" | "arrival_time" | "departure_time" | "break_minutes" | "remote_minutes" | "notes"
>;

function getDraftKey(monday: string): string {
  if (typeof window === "undefined") return `worktime:draft:0:${monday}`;
  try {
    const raw = window.localStorage.getItem("worktime:user");
    const user = raw ? (JSON.parse(raw) as { id: number }) : null;
    const userId = user?.id ?? 0;
    return `worktime:draft:${userId}:${monday}`;
  } catch {
    return `worktime:draft:0:${monday}`;
  }
}

function applyDraft(monday: string, current: DayRow[]): DayRow[] {
  if (typeof window === "undefined") return current;
  try {
    const raw = window.localStorage.getItem(getDraftKey(monday));
    if (!raw) return current;
    const parsed = JSON.parse(raw) as { monday: string; rows: DraftRow[] };
    if (!parsed || parsed.monday !== monday || !Array.isArray(parsed.rows)) {
      return current;
    }
    const byDate = new Map(parsed.rows.map((r) => [r.date, r]));
    return current.map((r) => {
      const draft = byDate.get(r.date);
      if (!draft) return r;
      return {
        ...r,
        arrival_time: draft.arrival_time ?? r.arrival_time,
        departure_time: draft.departure_time ?? r.departure_time,
        break_minutes:
          typeof draft.break_minutes === "number"
            ? draft.break_minutes
            : r.break_minutes,
        remote_minutes:
          typeof draft.remote_minutes === "number"
            ? draft.remote_minutes
            : r.remote_minutes,
        notes: draft.notes ?? r.notes,
      };
    });
  } catch {
    return current;
  }
}

function saveDraft() {
  if (typeof window === "undefined") return;
  const monday = weekStart.value;
  const payload: { monday: string; rows: DraftRow[] } = {
    monday,
    rows: rows.value.map((r) => ({
      date: r.date,
      arrival_time: r.arrival_time,
      departure_time: r.departure_time,
      break_minutes: r.break_minutes,
      remote_minutes: r.remote_minutes,
      notes: r.notes,
    })),
  };
  try {
    window.localStorage.setItem(getDraftKey(monday), JSON.stringify(payload));
  } catch {
    // ignore quota / private mode errors
  }
}

function clearDraft(monday: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getDraftKey(monday));
  } catch {
    // ignore
  }
}

function initRows() {
  const base = weekDates.value.map((date) => buildDefaultRow(date));
  rows.value = applyDraft(weekStart.value, base);
}

watch(
  [weekStart, () => props.existingSessions],
  () => initRows(),
  { immediate: true }
);

watch(
  () => rows.value,
  () => saveDraft(),
  { deep: true }
);

const netByIndex = (i: number) => {
  const r = rows.value[i];
  if (!r) return "00:00";
  return minutesToHHMM(
    computeNetMinutes(
      r.arrival_time,
      r.departure_time,
      r.break_minutes,
      r.remote_minutes
    )
  );
};

const totalNetMinutes = computed(() => {
  let total = 0;
  for (const r of rows.value) {
    total += computeNetMinutes(
      r.arrival_time,
      r.departure_time,
      r.break_minutes,
      r.remote_minutes
    );
  }
  return total;
});

const totalNetLabel = computed(() => minutesToHHMM(totalNetMinutes.value));

const week1TotalLabel = computed(() =>
  minutesToHHMM(
    rows.value
      .slice(0, 5)
      .reduce(
        (acc, r) =>
          acc +
          computeNetMinutes(
            r.arrival_time,
            r.departure_time,
            r.break_minutes,
            r.remote_minutes
          ),
        0
      )
  )
);

const week2TotalLabel = computed(() =>
  minutesToHHMM(
    rows.value
      .slice(5, 10)
      .reduce(
        (acc, r) =>
          acc +
          computeNetMinutes(
            r.arrival_time,
            r.departure_time,
            r.break_minutes,
            r.remote_minutes
          ),
        0
      )
  )
);

const week1RangeLabel = computed(() => {
  if (rows.value.length < 1) return "";
  const start = rows.value[0];
  const end = rows.value[Math.min(4, rows.value.length - 1)];
  return `${formatDayShort(start.date)} → ${formatDayShort(end.date)}`;
});

const week2RangeLabel = computed(() => {
  if (rows.value.length < 6) return "";
  const start = rows.value[5];
  const end = rows.value[Math.min(9, rows.value.length - 1)];
  return `${formatDayShort(start.date)} → ${formatDayShort(end.date)}`;
});

function dayLabelForIndex(i: number): string {
  return getDayLabel(i % 5);
}

const saving = ref(false);
const error = ref<string | null>(null);

async function saveWeek() {
  error.value = null;
  saving.value = true;
  try {
    const payloads: SessionPayload[] = rows.value.map((r) => ({
      date: r.date,
      arrival_time: r.arrival_time,
      departure_time: r.departure_time,
      break_minutes: r.break_minutes,
      remote_minutes: r.remote_minutes,
      notes: r.notes || undefined,
    }));
    await saveSessionsBulk(payloads);
    clearDraft(weekStart.value);
    emit("saved");
  } catch (e: any) {
    error.value = e.message ?? "Erreur d'enregistrement";
  } finally {
    saving.value = false;
  }
}

function downloadPdf() {
  const monday = weekStart.value;
  if (!monday) return;
  const rawUser = window.localStorage.getItem("worktime:user");
  const user = rawUser ? JSON.parse(rawUser) as { id: number } : null;
  if (!user?.id) return;
  const url = `/api/report?monday=${encodeURIComponent(
    monday
  )}&userId=${encodeURIComponent(String(user.id))}`;
  window.open(url, "_blank");
}

function goPrevWeek() {
  const d = new Date(weekStart.value + "T12:00:00");
  d.setDate(d.getDate() - 7);
  weekStart.value = d.toISOString().slice(0, 10);
  emit("update:weekStart", weekStart.value);
}

function goNextWeek() {
  const d = new Date(weekStart.value + "T12:00:00");
  d.setDate(d.getDate() + 7);
  weekStart.value = d.toISOString().slice(0, 10);
  emit("update:weekStart", weekStart.value);
}
</script>

<template>
  <section class="week-form">
    <div class="week-header">
      <h2>Saisie des 2 semaines</h2>
      <div class="week-nav">
        <span class="nav-label">Période (lundi)</span>
        <button type="button" class="btn-icon" @click="goPrevWeek" aria-label="Semaine précédente">‹</button>
        <input
          v-model="weekStart"
          type="date"
          class="week-picker"
          :min="'2020-01-01'"
          @change="emit('update:weekStart', weekStart)"
        />
        <button type="button" class="btn-icon" @click="goNextWeek" aria-label="Semaine suivante">›</button>
      </div>
    </div>

    <div class="weeks-grid">
      <div class="week-column">
        <div class="week-title">
          <div>
            <span class="week-label">Semaine 1</span>
            <span v-if="week1RangeLabel" class="week-range">{{ week1RangeLabel }}</span>
          </div>
          <span class="week-total">Total S1 : {{ week1TotalLabel }}</span>
        </div>
        <div class="table-wrap">
          <table class="week-table">
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
              <tr
                v-for="(row, i) in rows.slice(0, 5)"
                :key="row.date"
                class="day-row"
              >
                <td class="day-cell">
                  <span class="day-name">{{ dayLabelForIndex(i) }}</span>
                  <span class="day-date">{{ formatDayShort(row.date) }}</span>
                </td>
                <td>
                  <input v-model="row.arrival_time" type="time" class="input-time" />
                </td>
                <td>
                  <input v-model="row.departure_time" type="time" class="input-time" />
                </td>
                <td>
                  <input v-model.number="row.break_minutes" type="number" min="0" max="480" class="input-num" placeholder="60" title="Ex. 60 = 1h repas" />
                </td>
                <td>
                  <input v-model.number="row.remote_minutes" type="number" min="0" class="input-num" />
                </td>
                <td class="net-cell">{{ netByIndex(i) }}</td>
                <td>
                  <input v-model="row.notes" type="text" class="input-notes" placeholder="Optionnel" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      <div class="week-column">
        <div class="week-title">
          <div>
            <span class="week-label">Semaine 2</span>
            <span v-if="week2RangeLabel" class="week-range">{{ week2RangeLabel }}</span>
          </div>
          <span class="week-total">Total S2 : {{ week2TotalLabel }}</span>
        </div>
        <div class="table-wrap">
          <table class="week-table">
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
              <tr
                v-for="(row, idx) in rows.slice(5, 10)"
                :key="row.date"
                class="day-row"
              >
                <td class="day-cell">
                  <span class="day-name">{{ dayLabelForIndex(idx) }}</span>
                  <span class="day-date">{{ formatDayShort(row.date) }}</span>
                </td>
                <td>
                  <input v-model="row.arrival_time" type="time" class="input-time" />
                </td>
                <td>
                  <input v-model="row.departure_time" type="time" class="input-time" />
                </td>
                <td>
                  <input v-model.number="row.break_minutes" type="number" min="0" max="480" class="input-num" placeholder="60" title="Ex. 60 = 1h repas" />
                </td>
                <td>
                  <input v-model.number="row.remote_minutes" type="number" min="0" class="input-num" />
                </td>
                <td class="net-cell">
                  {{ netByIndex(5 + idx) }}
                </td>
                <td>
                  <input v-model="row.notes" type="text" class="input-notes" placeholder="Optionnel" />
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <div class="week-footer">
      <div class="total-net">
        <span>Total 2 semaines</span>
        <strong>{{ totalNetLabel }}</strong>
      </div>
      <div class="footer-actions">
        <button
          type="button"
          class="btn-secondary"
          @click="downloadPdf"
        >
          Télécharger le PDF
        </button>
        <button
          type="button"
          class="btn-primary"
          :disabled="saving"
          @click="saveWeek"
        >
          {{ saving ? "Enregistrement…" : "Enregistrer la semaine" }}
        </button>
      </div>
    </div>

    <p v-if="error" class="error-msg">{{ error }}</p>
  </section>
</template>

<style scoped>
.week-form {
  background: var(--card-bg);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
  padding: 1.75rem;
  margin-bottom: var(--space-lg);
  border: 1px solid var(--border);
}

.week-header {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  margin-bottom: 1.5rem;
  padding-bottom: 1rem;
  border-bottom: 1px solid var(--border);
}

.week-header h2 {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}

.week-nav {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.nav-label {
  font-size: 0.8rem;
  font-weight: 500;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.04em;
  margin-right: 0.25rem;
}

.btn-icon {
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font-size: 1.35rem;
  font-weight: 300;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-icon:hover {
  background: var(--hover);
  border-color: var(--primary);
  color: var(--primary);
}

.week-picker {
  padding: 0.5rem 0.75rem;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--bg);
  color: var(--text);
  font-size: 0.95rem;
  font-weight: 500;
}

.weeks-grid {
  display: flex;
  flex-direction: column;
  gap: 1.5rem;
  margin-bottom: 1.5rem;
}

.week-column {
  background: rgba(15, 23, 42, 0.5);
  border-radius: 14px;
  border: 1px solid var(--border);
  padding: 1.25rem;
  position: relative;
  overflow: hidden;
}

.week-column::before {
  content: "";
  position: absolute;
  left: 0;
  top: 0;
  bottom: 0;
  width: 4px;
  border-radius: 4px 0 0 4px;
  background: linear-gradient(180deg, var(--primary), var(--accent));
}

.week-column:last-child::before {
  background: linear-gradient(180deg, #06b6d4, #22d3ee);
}

.week-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  margin-bottom: 1rem;
  gap: 0.75rem;
}

.week-label {
  font-size: 1rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.01em;
}

.week-range {
  display: block;
  font-size: 0.8rem;
  color: var(--muted);
  margin-top: 2px;
}

.week-total {
  font-size: 0.95rem;
  color: var(--accent);
  font-weight: 700;
  white-space: nowrap;
}

.table-wrap {
  overflow-x: auto;
  border-radius: 10px;
}

.week-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.week-table th {
  text-align: left;
  padding: 0.65rem 0.6rem;
  font-weight: 600;
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}

.week-table td {
  padding: 0.55rem 0.6rem;
  border-bottom: 1px solid var(--border-light);
  vertical-align: middle;
}

.day-row:nth-child(even) td {
  background: rgba(255, 255, 255, 0.02);
}

.day-row:hover td {
  background: var(--hover);
}

.day-cell {
  min-width: 100px;
}

.day-name {
  display: block;
  font-weight: 600;
  color: var(--text);
  font-size: 0.9rem;
}

.day-date {
  font-size: 0.78rem;
  color: var(--muted);
}

.input-time,
.input-num {
  width: 100%;
  max-width: 5.5rem;
  padding: 0.45rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 0.9rem;
  transition: border-color 0.2s, box-shadow 0.2s;
}

.input-time:focus,
.input-num:focus {
  outline: none;
  border-color: var(--primary);
  box-shadow: 0 0 0 2px rgba(59, 130, 246, 0.2);
}

.input-notes {
  width: 100%;
  min-width: 90px;
  max-width: 130px;
  padding: 0.45rem 0.5rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--bg);
  color: var(--text);
  font-size: 0.85rem;
}

.net-cell {
  font-weight: 700;
  color: var(--accent);
  font-size: 0.95rem;
}

.week-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding-top: 1.25rem;
  margin-top: 0.25rem;
  border-top: 1px solid var(--border);
}

.total-net {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.95rem;
  color: var(--muted);
}

.total-net strong {
  font-size: 1.4rem;
  font-weight: 700;
  color: var(--accent);
  padding: 0.35rem 0.85rem;
  background: rgba(56, 189, 248, 0.12);
  border-radius: 10px;
}

.footer-actions {
  display: flex;
  gap: 0.75rem;
}

.btn-primary {
  padding: 0.7rem 1.5rem;
  border: none;
  border-radius: 10px;
  background: var(--primary);
  color: white;
  font-weight: 600;
  font-size: 0.95rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-primary:hover:not(:disabled) {
  background: var(--primary-hover);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
  transform: none;
}

.btn-secondary {
  padding: 0.7rem 1.2rem;
  border-radius: 10px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  font-weight: 500;
  font-size: 0.9rem;
  cursor: pointer;
  transition: all 0.2s ease;
}

.btn-secondary:hover {
  border-color: var(--primary);
  color: var(--primary);
}

.error-msg {
  margin: 1rem 0 0;
  padding: 0.6rem 0.9rem;
  background: var(--error-bg);
  color: var(--error);
  border-radius: 10px;
  font-size: 0.9rem;
}
</style>
