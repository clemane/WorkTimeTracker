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

const props = defineProps<{
  initialMonday?: string;
  existingSessions?: WorkSession[];
}>();

const emit = defineEmits<{
  (e: "saved"): void;
  (e: "update:weekStart", monday: string): void;
}>();

const todayDate = new Date().toISOString().slice(0, 10);
const defaultMonday = getMondayOfWeek(todayDate);
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
  return minutesToHHMM(computeNetMinutes(r.arrival_time, r.departure_time, r.break_minutes, r.remote_minutes));
};

const totalNetMinutes = computed(() => {
  return rows.value.reduce((acc, r) => acc + computeNetMinutes(r.arrival_time, r.departure_time, r.break_minutes, r.remote_minutes), 0);
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
  const url = `/api/report?monday=${encodeURIComponent(monday)}&userId=${encodeURIComponent(String(user.id))}`;
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
  <div class="space-y-8">
    <!-- Top Bar with Date Selection -->
    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Tableau de bord</h1>
        <p class="text-neutral-400 mt-1">Saisissez vos heures pour la période sélectionnée.</p>
      </div>

      <div class="flex items-center gap-2 bg-neutral-900 border border-neutral-800 p-1 rounded-2xl shadow-lg">
        <button @click="goPrevWeek" class="p-2 hover:bg-neutral-800 rounded-xl transition-colors text-neutral-400 hover:text-white">
          <ChevronLeft class="h-5 w-5" />
        </button>
        <div class="relative flex items-center px-4 py-2 gap-2 text-sm font-semibold">
          <CalendarIcon class="h-4 w-4 text-primary" />
          <input 
            type="date" 
            v-model="weekStart"
            @change="emit('update:weekStart', weekStart)"
            class="bg-transparent border-none outline-none focus:ring-0 cursor-pointer"
          />
        </div>
        <button @click="goNextWeek" class="p-2 hover:bg-neutral-800 rounded-xl transition-colors text-neutral-400 hover:text-white">
          <ChevronRight class="h-5 w-5" />
        </button>
      </div>
    </div>

    <!-- Stats Summary -->
    <div class="grid grid-cols-1 sm:grid-cols-3 gap-6">
      <div v-for="stat in [
        { label: 'Total Période', value: totalNetLabel, icon: Clock, color: 'text-primary' },
        { label: 'Jours Saisis', value: rows.filter(r => r.id).length + ' / 10', icon: CheckCircle2, color: 'text-green-400' },
        { label: 'Télétravail', value: minutesToHHMM(rows.reduce((acc, r) => acc + r.remote_minutes, 0)), icon: Home, color: 'text-amber-400' }
      ]" :key="stat.label" class="bg-neutral-900/50 border border-neutral-800 p-6 rounded-3xl backdrop-blur-sm">
        <div class="flex items-center gap-4">
          <div :class="`p-3 rounded-2xl bg-neutral-950 border border-neutral-800 ${stat.color}`">
            <component :is="stat.icon" class="h-6 w-6" />
          </div>
          <div>
            <p class="text-xs font-semibold uppercase tracking-widest text-neutral-500">{{ stat.label }}</p>
            <p class="text-2xl font-bold mt-1">{{ stat.value }}</p>
          </div>
        </div>
      </div>
    </div>

    <!-- Main Entry Form -->
    <div class="space-y-6">
      <div v-for="(week, wIdx) in [rows.slice(0, 5), rows.slice(5, 10)]" :key="wIdx" class="space-y-4">
        <div class="flex items-center justify-between px-2">
          <h2 class="text-lg font-bold flex items-center gap-2">
            <span class="h-2 w-2 rounded-full" :class="wIdx === 0 ? 'bg-primary' : 'bg-cyan-400'"></span>
            Semaine {{ wIdx + 1 }}
          </h2>
          <span class="text-xs font-mono text-neutral-500 bg-neutral-900 px-3 py-1 rounded-full border border-neutral-800">
            {{ formatDayShort(week[0].date) }} → {{ formatDayShort(week[4].date) }}
          </span>
        </div>

        <div class="grid grid-cols-1 lg:grid-cols-5 gap-4">
          <div 
            v-for="(row, rIdx) in week" 
            :key="row.date"
            class="group bg-neutral-900/40 border border-neutral-800 hover:border-neutral-700 rounded-3xl p-5 transition-all hover:shadow-xl hover:-translate-y-1"
          >
            <div class="flex justify-between items-start mb-6">
              <div>
                <p class="text-sm font-bold">{{ getDayLabel(rIdx) }}</p>
                <p class="text-xs text-neutral-500">{{ formatDayShort(row.date) }}</p>
              </div>
              <div class="text-right">
                <p class="text-lg font-black text-primary">{{ netByIndex(wIdx * 5 + rIdx) }}</p>
                <p class="text-[10px] uppercase tracking-tighter text-neutral-600 font-bold">Net</p>
              </div>
            </div>

            <div class="space-y-4">
              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1">
                  <label class="text-[10px] font-bold uppercase text-neutral-500 flex items-center gap-1">
                    <Clock class="h-3 w-3" /> Arrivée
                  </label>
                  <input v-model="row.arrival_time" type="time" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-2 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all" />
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold uppercase text-neutral-500 flex items-center gap-1">
                    <LogOut class="h-3 w-3 rotate-180" /> Départ
                  </label>
                  <input v-model="row.departure_time" type="time" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-2 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all" />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="space-y-1">
                  <label class="text-[10px] font-bold uppercase text-neutral-500 flex items-center gap-1">
                    <Coffee class="h-3 w-3" /> Pause
                  </label>
                  <div class="relative">
                    <input v-model.number="row.break_minutes" type="number" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-2 py-2 text-sm pr-7 outline-none focus:border-primary transition-all" />
                    <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-600 font-bold">m</span>
                  </div>
                </div>
                <div class="space-y-1">
                  <label class="text-[10px] font-bold uppercase text-neutral-500 flex items-center gap-1">
                    <Home class="h-3 w-3" /> Distant
                  </label>
                  <div class="relative">
                    <input v-model.number="row.remote_minutes" type="number" class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-2 py-2 text-sm pr-7 outline-none focus:border-primary transition-all" />
                    <span class="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-neutral-600 font-bold">m</span>
                  </div>
                </div>
              </div>

              <div class="space-y-1">
                <label class="text-[10px] font-bold uppercase text-neutral-500 flex items-center gap-1">
                  <StickyNote class="h-3 w-3" /> Notes
                </label>
                <input v-model="row.notes" type="text" placeholder="..." class="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-3 py-2 text-xs outline-none focus:border-primary transition-all" />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Action Bar -->
    <div class="flex justify-center pt-8 pb-12">
      <div class="bg-neutral-900 border border-neutral-800 p-2 rounded-3xl shadow-xl flex items-center gap-2">
        <button 
          @click="downloadPdf"
          class="flex items-center gap-2 px-6 py-3 text-sm font-bold text-neutral-400 hover:text-white hover:bg-neutral-800 rounded-2xl transition-all"
        >
          <Download class="h-4 w-4" />
          <span class="hidden sm:inline">Exporter PDF</span>
        </button>
        <button 
          @click="saveWeek"
          :disabled="saving"
          class="flex items-center gap-2 px-8 py-3 text-sm font-bold bg-primary text-white rounded-2xl transition-all hover:scale-105 active:scale-95 disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-primary/20"
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
