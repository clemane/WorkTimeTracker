<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { WorkSession } from "../services/api";
import { saveSessionsBulk, type SessionPayload } from "../services/api";
import { computeNetMinutes, minutesToHHMM } from "../utils/time";
import {
  getMondayOfWeek,
  getTwoWeekDates,
  getWeekDates,
  addDays,
  getDayLabel,
  formatDayShort,
} from "../utils/week";
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
  Loader2
} from "lucide-vue-next";
import TimeInput from "./TimeInput.vue";

const props = defineProps<{
  initialMonday?: string;
  existingSessions?: WorkSession[];
  userMode?: "weekly" | "bi-weekly" | "monthly";
  workingDays?: number[];
  defaultArrival?: string;
  defaultDeparture?: string;
}>();

const emit = defineEmits<{
  (e: "saved"): void;
  (e: "update:weekStart", monday: string): void;
}>();

const todayDate = new Date().toISOString().slice(0, 10);
const defaultMonday = getMondayOfWeek(todayDate);
const weekStart = ref(props.initialMonday ?? defaultMonday);
const workingDays = computed(() => {
    // If workingDays prop is provided and non-empty, use it.
    // Otherwise fallback to default [0,1,2,3,4].
    // Be careful: if user explicitly selects NO days, it might be empty array?
    // Let's assume valid prop is passed.
    if (props.workingDays !== undefined) return props.workingDays;
    return [0, 1, 2, 3, 4];
}); 
const defaultArrival = computed(() => props.defaultArrival ?? "07:30");
const defaultDeparture = computed(() => props.defaultDeparture ?? "16:30");

watch(
  () => props.initialMonday,
  (val) => {
    if (val && val !== weekStart.value) weekStart.value = val;
  },
  { immediate: true }
);

const mode = ref<"weekly" | "bi-weekly" | "monthly">(props.userMode ?? "bi-weekly");

watch(() => props.userMode, (val) => {
  if (val) mode.value = val;
});

const weekDates = computed(() => {
  if (mode.value === "weekly") {
    return getWeekDates(weekStart.value);
  }
  if (mode.value === "monthly") {
    // Determine the month based on weekStart
    // Note: weekStart is a Monday. 
    // If we want the month of that Monday:
    const d = new Date(weekStart.value + "T12:00:00");
    // Align to the 1st of the month
    const year = d.getFullYear();
    const month = d.getMonth();
    
    // Find the Monday of the first week of the month
    const firstDayOfMonth = new Date(year, month, 1, 12);
    let currentMonday = getMondayOfWeek(firstDayOfMonth.toISOString().slice(0, 10));
    
    // Find the end of the month
    const lastDayOfMonth = new Date(year, month + 1, 0, 12);
    const endMonday = getMondayOfWeek(lastDayOfMonth.toISOString().slice(0, 10));
    
    const dates: string[] = [];
    while (currentMonday <= endMonday) {
      dates.push(...getWeekDates(currentMonday));
      currentMonday = addDays(currentMonday, 7);
    }
    return dates;
  }
  // Default bi-weekly
  return getTwoWeekDates(weekStart.value);
});

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
    arrival_time: defaultArrival.value,
    departure_time: defaultDeparture.value,
    break_minutes: 60,
    remote_minutes: 0,
    notes: "",
  };
}

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
    const parsed = JSON.parse(raw);
    if (!parsed || parsed.monday !== monday || !Array.isArray(parsed.rows)) {
      return current;
    }
    const byDate = new Map(parsed.rows.map((r: any) => [r.date, r]));
    return current.map((r) => {
      const draft = byDate.get(r.date);
      if (!draft) return r;
      return { ...r, ...draft };
    });
  } catch {
    return current;
  }
}

function saveDraft() {
  if (typeof window === "undefined") return;
  const monday = weekStart.value;
  const payload = {
    monday,
    rows: rows.value.map(({ id, ...r }) => r),
  };
  try {
    window.localStorage.setItem(getDraftKey(monday), JSON.stringify(payload));
  } catch { /* ignore */ }
}

function clearDraft(monday: string) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(getDraftKey(monday));
  } catch { /* ignore */ }
}

function initRows() {
  const base = weekDates.value.map((date) => buildDefaultRow(date));
  rows.value = applyDraft(weekStart.value, base);
}

watch(
  [weekStart, () => props.existingSessions, defaultArrival, defaultDeparture],
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
  return minutesToHHMM(computeNetMinutes(r.arrival_time, r.departure_time, r.break_minutes, r.remote_minutes));
};

const totalNetMinutes = computed(() => {
  // We need to sum up ONLY the rows that are actually displayed (i.e. part of workingDays)
  // rows contains ALL days of the period (Mon-Sun).
  // But we only want to sum days that are in workingDays.
  
  return rows.value.reduce((acc, r) => {
    // We need to know the day of week for this row.
    const d = new Date(r.date + "T12:00:00");
    // getDay() returns 0 for Sunday, 1 for Monday... 
    // BUT our workingDays uses 0 for Monday, 6 for Sunday (based on getWeekDates order)
    let dayIndex = d.getDay(); 
    // Convert to 0=Mon, 6=Sun
    dayIndex = dayIndex === 0 ? 6 : dayIndex - 1;
    
    if (workingDays.value.includes(dayIndex)) {
        return acc + computeNetMinutes(r.arrival_time, r.departure_time, r.break_minutes, r.remote_minutes);
    }
    return acc;
  }, 0);
});

const totalNetLabel = computed(() => minutesToHHMM(totalNetMinutes.value));

const saving = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

async function saveWeek() {
  error.value = null;
  saving.value = true;
  success.value = false;
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
    success.value = true;
    setTimeout(() => { success.value = false; }, 3000);
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
  const url = `/api/report?monday=${encodeURIComponent(monday)}&userId=${encodeURIComponent(String(user.id))}&mode=${mode.value}&format=pdf`;
  window.open(url, "_blank");
}

function downloadExcel() {
  const monday = weekStart.value;
  if (!monday) return;
  const rawUser = window.localStorage.getItem("worktime:user");
  const user = rawUser ? JSON.parse(rawUser) as { id: number } : null;
  if (!user?.id) return;
  const url = `/api/report?monday=${encodeURIComponent(monday)}&userId=${encodeURIComponent(String(user.id))}&mode=${mode.value}&format=excel`;
  window.open(url, "_blank");
}

function goPrevPeriod() {
  const d = new Date(weekStart.value + "T12:00:00");
  if (mode.value === 'weekly') {
    d.setDate(d.getDate() - 7);
  } else if (mode.value === 'monthly') {
    d.setMonth(d.getMonth() - 1);
    // Align to the Monday of the first week of that month, to be consistent?
    // Or just keep the same relative week?
    // Simplest: Just subtract a month, and getMondayOfWeek.
    // But weekStart must be a Monday.
    // If I just subtract 1 month, I might land on a Tuesday.
  } else {
    // Bi-weekly
    d.setDate(d.getDate() - 14);
  }
  
  // Re-align to Monday
  let newDateStr = d.toISOString().slice(0, 10);
  weekStart.value = getMondayOfWeek(newDateStr);
  emit("update:weekStart", weekStart.value);
}

function goNextPeriod() {
  const d = new Date(weekStart.value + "T12:00:00");
  if (mode.value === 'weekly') {
    d.setDate(d.getDate() + 7);
  } else if (mode.value === 'monthly') {
    d.setMonth(d.getMonth() + 1);
  } else {
    d.setDate(d.getDate() + 14);
  }
  
  let newDateStr = d.toISOString().slice(0, 10);
  weekStart.value = getMondayOfWeek(newDateStr);
  emit("update:weekStart", weekStart.value);
}

const weeks = computed(() => {
  // 1. We start with ALL rows (representing full weeks Mon-Sun based on weekDates)
  const allRows = rows.value;
  
  // 2. We break them into chunks of 7 days (since getWeekDates returns 7 days now)
  const rawWeeks = [];
  for (let i = 0; i < allRows.length; i += 7) {
    rawWeeks.push(allRows.slice(i, i + 7));
  }

  // 3. For each week, we filter to keep only "workingDays"
  // Note: we still want to keep the "week" structure, so if a user unchecks "Tuesday", 
  // Tuesday row is just not displayed, but the week object still exists.
  
  return rawWeeks.map(week => {
    // Each row has a date. We need to find its day index (0=Mon, 6=Sun)
    // week[0] is always Monday, week[1] Tuesday... 
    // because getWeekDates generates them in order 0..6
    // Use modulo to be sure (in case of shifts) but here it should be aligned.
    
    return week.filter((_, idx) => {
        // Here idx is 0 for Monday, 1 for Tuesday ... 6 for Sunday
        // workingDays also uses 0 for Monday ... 6 for Sunday
        // So direct comparison is correct
        return workingDays.value.includes(idx);
    });
  });
});
</script>

<template>
  <div class="space-y-8">
    <!-- Top Bar with Date Selection -->
    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Tableau de bord</h1>
        <p class="text-text-muted mt-1">Saisissez vos heures pour la période sélectionnée.</p>
      </div>

      <div class="flex items-center gap-2 bg-surface border border-border p-1 rounded-2xl shadow-lg">
        <button 
          @click="goPrevPeriod" 
          class="p-2 hover:bg-surface-hover rounded-xl transition-colors text-text-muted hover:text-text-body"
        >
          <ChevronLeft class="h-5 w-5" />
        </button>
        <div class="relative flex items-center px-4 py-2 gap-2 text-sm font-semibold text-text-body">
          <CalendarIcon class="h-4 w-4 text-primary" />
          <input 
            type="date" 
            v-model="weekStart"
            @change="emit('update:weekStart', weekStart)"
            class="bg-transparent border-none outline-none focus:ring-0 cursor-pointer text-text-body"
          />
        </div>
        <button 
          @click="goNextPeriod" 
          class="p-2 hover:bg-surface-hover rounded-xl transition-colors text-text-muted hover:text-text-body"
        >
          <ChevronRight class="h-5 w-5" />
        </button>
      </div>
    </div>

    <!-- Stats Summary -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <div v-for="stat in [
        { label: 'Total Période', value: totalNetLabel, icon: Clock, color: 'text-primary' },
        { label: 'Jours Actifs', value: rows.length + ' jours', icon: CheckCircle2, color: 'text-green-400' },
        { label: 'Télétravail', value: minutesToHHMM(rows.reduce((acc, r) => acc + r.remote_minutes, 0)), icon: Home, color: 'text-amber-400' }
      ]" :key="stat.label" class="bg-surface/50 border border-border p-6 rounded-3xl backdrop-blur-sm">
        <div class="flex items-center gap-4">
          <div :class="`p-3 rounded-2xl bg-canvas border border-border ${stat.color}`">
            <component :is="stat.icon" class="h-6 w-6" />
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-widest text-text-muted">{{ stat.label }}</p>
            <p class="text-2xl font-bold mt-1 text-text-body">{{ stat.value }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Entry Form -->
    <div class="space-y-6">
      <div v-for="(week, wIdx) in weeks" :key="wIdx" class="space-y-4">
        <!-- Show week header only if there are visible days in this week -->
        <div v-if="week.length > 0">
          <div class="flex items-center justify-between px-2 mb-4">
            <h2 class="text-lg font-bold flex items-center gap-2 text-text-body">
              <span class="h-2 w-2 rounded-full" :class="wIdx === 0 ? 'bg-primary' : 'bg-cyan-400'"></span>
              Semaine {{ wIdx + 1 }}
            </h2>
            <span class="text-xs font-mono text-text-muted bg-surface px-3 py-1 rounded-full border border-border">
              {{ formatDayShort(week[0].date) }} → {{ formatDayShort(week[week.length - 1].date) }}
            </span>
          </div>

          <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
            <div 
              v-for="row in week" 
              :key="row.date"
              class="group bg-surface/40 border border-border hover:border-surface-hover rounded-3xl p-5 transition-all hover:shadow-xl hover:-translate-y-1"
            >
              <div class="flex justify-between items-start mb-6">
                <div>
                  <p class="text-sm font-bold text-text-body">{{ formatDayShort(row.date).split(' ')[0] }}</p>
                  <p class="text-xs text-text-muted">{{ formatDayShort(row.date) }}</p>
                </div>
                <div class="text-right">
                  <p class="text-lg font-black text-primary">{{ minutesToHHMM(computeNetMinutes(row.arrival_time, row.departure_time, row.break_minutes, row.remote_minutes)) }}</p>
                  <p class="text-[10px] uppercase tracking-tighter text-text-muted font-bold">Net</p>
                </div>
              </div>

              <div class="space-y-4">
                <div class="grid grid-cols-2 gap-3">
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold uppercase text-text-muted flex items-center gap-1">
                      <Clock class="h-3 w-3" /> Arrivée
                    </label>
                    <TimeInput v-model="row.arrival_time" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold uppercase text-text-muted flex items-center gap-1">
                      <LogOut class="h-3 w-3 rotate-180" /> Départ
                    </label>
                    <TimeInput v-model="row.departure_time" />
                  </div>
                </div>

                <div class="grid grid-cols-2 gap-3">
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold uppercase text-text-muted flex items-center gap-1">
                      <Coffee class="h-3 w-3" /> Pause
                    </label>
                    <div class="relative">
                      <input v-model.number="row.break_minutes" type="number" class="w-full bg-canvas border border-border rounded-xl px-2 py-2 text-sm pr-7 outline-none focus:border-primary transition-all text-text-body placeholder:text-text-muted" />
                      <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted font-bold">m</span>
                    </div>
                  </div>
                  <div class="space-y-1">
                    <label class="text-[10px] font-bold uppercase text-text-muted flex items-center gap-1">
                      <Home class="h-3 w-3" /> Distant
                    </label>
                    <div class="relative">
                      <input v-model.number="row.remote_minutes" type="number" class="w-full bg-canvas border border-border rounded-xl px-2 py-2 text-sm pr-7 outline-none focus:border-primary transition-all text-text-body placeholder:text-text-muted" />
                      <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-text-muted font-bold">m</span>
                    </div>
                  </div>
                </div>

                <div class="space-y-1">
                  <label class="text-[10px] font-bold uppercase text-text-muted flex items-center gap-1">
                    <StickyNote class="h-3 w-3" /> Notes
                  </label>
                  <input v-model="row.notes" type="text" placeholder="..." class="w-full bg-canvas border border-border rounded-xl px-3 py-2 text-xs outline-none focus:border-primary transition-all text-text-body placeholder:text-text-muted" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Action Bar -->
    <div class="flex justify-center pt-8 pb-12">
      <div class="bg-surface border border-border p-2 rounded-3xl shadow-xl flex items-center gap-2">
        <button 
          @click="downloadPdf"
          class="flex items-center gap-2 px-4 py-3 text-sm font-bold text-text-muted hover:text-text-body hover:bg-surface-hover rounded-2xl transition-all"
        >
          <Download class="h-4 w-4" />
          <span class="hidden sm:inline">PDF</span>
        </button>
        <button 
          @click="downloadExcel"
          class="flex items-center gap-2 px-4 py-3 text-sm font-bold text-text-muted hover:text-text-body hover:bg-surface-hover rounded-2xl transition-all"
        >
          <Download class="h-4 w-4" />
          <span class="hidden sm:inline">Excel</span>
        </button>
        <button 
          @click="saveWeek"
          :disabled="saving"
          class="flex items-center gap-2 px-8 py-3 text-sm font-bold bg-primary text-primary-text rounded-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-primary/20"
        >
          <Loader2 v-if="saving" class="h-4 w-4 animate-spin" />
          <Save v-else-if="!success" class="h-4 w-4" />
          <CheckCircle2 v-else class="h-4 w-4 text-green-300" />
          <span>{{ saving ? 'Enregistrement...' : success ? 'Enregistré !' : 'Enregistrer' }}</span>
        </button>
      </div>
    </div>
  </div>
</template>


