<script setup lang="ts">
import { computed, ref } from "vue";
import type { WorkSession } from "../services/api";
import { deleteSessionsByPeriod } from "../services/api";
import { computeNetMinutes, minutesToHHMM } from "../utils/time";
import { getMondayOfWeek, addDays, formatDayShort } from "../utils/week";

const props = defineProps<{
  sessions: WorkSession[];
}>();

const emit = defineEmits<{ "delete-period": [] }>();
const deleting = ref<string | null>(null);

const from = ref<string>("");
const to = ref<string>("");

type PeriodGroup = {
  startMonday: string;
  from: string;
  to: string;
  totalMinutes: number;
  daysCount: number;
};

const periodGroups = computed<PeriodGroup[]>(() => {
  if (props.sessions.length === 0) return [];

  const sorted = [...props.sessions].sort((a, b) =>
    a.date < b.date ? -1 : a.date > b.date ? 1 : 0
  );

  const earliestMonday = getMondayOfWeek(sorted[0].date);

  function getPeriodStart(dateStr: string): string {
    const monday = getMondayOfWeek(dateStr);
    const start = new Date(earliestMonday + "T12:00:00");
    const current = new Date(monday + "T12:00:00");
    const diffDays = Math.floor(
      (current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
    const bucketIndex = Math.floor(diffDays / 14);
    const bucketStart = addDays(earliestMonday, bucketIndex * 14);
    return bucketStart;
  }

  const map = new Map<string, PeriodGroup & { _sessions: WorkSession[] }>();

  for (const s of sorted) {
    const periodStart = getPeriodStart(s.date);
    if (!map.has(periodStart)) {
      map.set(periodStart, {
        startMonday: periodStart,
        from: periodStart,
        to: addDays(periodStart, 13),
        totalMinutes: 0,
        daysCount: 0,
        _sessions: [],
      });
    }
    const group = map.get(periodStart)!;
    group._sessions.push(s);
    group.totalMinutes += computeNetMinutes(
      s.arrival_time,
      s.departure_time,
      s.break_minutes,
      s.remote_minutes ?? 0
    );
    group.daysCount += 1;
  }

  let groups = Array.from(map.values()) as PeriodGroup[];

  if (from.value) {
    groups = groups.filter((g) => g.from >= from.value);
  }
  if (to.value) {
    groups = groups.filter((g) => g.to <= to.value);
  }

  return groups.sort((a, b) => (b.startMonday > a.startMonday ? 1 : -1));
});

function periodLabel(g: PeriodGroup): string {
  const week1From = g.startMonday;
  const week1To = addDays(g.startMonday, 4);
  const week2From = addDays(g.startMonday, 7);
  const week2To = addDays(g.startMonday, 11);
  return `S1: ${formatDayShort(week1From)} → ${formatDayShort(
    week1To
  )} · S2: ${formatDayShort(week2From)} → ${formatDayShort(week2To)}`;
}

function totalLabel(g: PeriodGroup): string {
  return minutesToHHMM(g.totalMinutes);
}

function downloadPdfForPeriod(startMonday: string) {
  const rawUser = window.localStorage.getItem("worktime:user");
  const user = rawUser ? (JSON.parse(rawUser) as { id: number }) : null;
  if (!user?.id) return;
  const url = `/api/report?monday=${encodeURIComponent(
    startMonday
  )}&userId=${encodeURIComponent(String(user.id))}`;
  window.open(url, "_blank");
}

async function deletePeriod(g: PeriodGroup) {
  const rawUser = window.localStorage.getItem("worktime:user");
  const user = rawUser ? (JSON.parse(rawUser) as { id: number }) : null;
  if (!user?.id) return;
  if (!window.confirm("Supprimer toute cette période (2 semaines) ? Cette action est irréversible.")) return;
  deleting.value = g.startMonday;
  try {
    await deleteSessionsByPeriod(g.startMonday, user.id);
    emit("delete-period");
  } catch (e) {
    alert(e instanceof Error ? e.message : "Erreur lors de la suppression.");
  } finally {
    deleting.value = null;
  }
}
</script>

<template>
  <section class="history-card">
    <h2>Historique par période (2 semaines)</h2>

    <div class="filters">
      <div class="field">
        <label>Semaine à partir du</label>
        <input v-model="from" type="date" class="input" />
      </div>
      <div class="field">
        <label>Jusqu'au</label>
        <input v-model="to" type="date" class="input" />
      </div>
    </div>

    <div v-if="periodGroups.length > 0" class="table-wrap">
      <table class="history-table">
        <thead>
          <tr>
            <th>Période</th>
            <th>Jours saisis</th>
            <th>Total net / PDF</th>
            <th class="th-actions"></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="g in periodGroups"
            :key="g.startMonday"
            class="session-row"
          >
            <td>
              <span class="day-label">{{ periodLabel(g) }}</span>
              <span class="date-num">Lundi {{ g.startMonday }}</span>
            </td>
            <td>{{ g.daysCount }} / 10 jours</td>
            <td class="net-cell">
              <div class="net-value">{{ totalLabel(g) }}</div>
              <button
                type="button"
                class="btn-link"
                @click.stop="downloadPdfForPeriod(g.startMonday)"
              >
                PDF
              </button>
            </td>
            <td class="actions-cell">
              <button
                type="button"
                class="btn-delete"
                title="Supprimer cette période"
                :disabled="deleting === g.startMonday"
                @click.stop="deletePeriod(g)"
              >
                {{ deleting === g.startMonday ? "…" : "Supprimer" }}
              </button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-else class="empty">Aucune semaine enregistrée pour le moment.</p>
  </section>
</template>

<style scoped>
.history-card {
  background: var(--card-bg);
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow);
  padding: var(--space-lg);
}

.history-card h2 {
  margin: 0 0 var(--space-md);
  font-size: 1.25rem;
  font-weight: 600;
  color: var(--text);
}

.filters {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.field {
  display: flex;
  flex-direction: column;
  gap: 2px;
  font-size: 0.9rem;
}

.field label {
  color: var(--muted);
}

.input {
  padding: 0.4rem 0.6rem;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg);
  color: var(--text);
  font-size: 0.95rem;
}

.table-wrap {
  overflow-x: auto;
}

.history-table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.9rem;
}

.history-table th {
  text-align: left;
  padding: 0.6rem 0.5rem;
  font-weight: 600;
  color: var(--muted);
  border-bottom: 1px solid var(--border);
}

.history-table td {
  padding: 0.5rem;
  border-bottom: 1px solid var(--border-light);
}

.session-row:hover td {
  background: var(--hover);
}

.day-label {
  display: block;
  color: var(--text);
}

.date-num {
  font-size: 0.8rem;
  color: var(--muted);
}

.net-cell {
  font-weight: 600;
  color: var(--accent);
  white-space: nowrap;
}

.net-value {
  margin-bottom: 2px;
}

.btn-link {
  padding: 0;
  border: none;
  background: none;
  color: var(--accent);
  cursor: pointer;
  font-size: 0.8rem;
}

.btn-link:hover {
  text-decoration: underline;
}

.th-actions {
  width: 1%;
  white-space: nowrap;
}

.actions-cell {
  padding: 0.5rem;
  vertical-align: middle;
  white-space: nowrap;
}

.btn-delete {
  padding: 0.35rem 0.6rem;
  font-size: 0.8rem;
  color: var(--text);
  background: var(--card-bg);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
}

.btn-delete:hover:not(:disabled) {
  background: var(--hover);
  border-color: var(--muted);
}

.btn-delete:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.empty {
  margin: 0;
  padding: var(--space-md);
  color: var(--muted);
  font-size: 0.95rem;
}
</style>
