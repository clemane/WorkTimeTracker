<script setup lang="ts">
import { computed, ref } from "vue";
import type { WorkSession } from "../services/api";
import { deleteSessionsByPeriod } from "../services/api";
import { computeNetMinutes, minutesToHHMM } from "../utils/time";
import { getMondayOfWeek, addDays, formatDayShort } from "../utils/week";
import { 
  FileText, 
  Trash2, 
  Search, 
  ChevronRight, 
  Clock, 
  Calendar,
  AlertCircle,
  Loader2
} from "lucide-vue-next";

const props = defineProps<{
  sessions: WorkSession[];
}>();

const emit = defineEmits<{ (e: "delete-period"): void }>();
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

  const sorted = [...props.sessions].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  const earliestMonday = getMondayOfWeek(sorted[0].date);

  function getPeriodStart(dateStr: string): string {
    const monday = getMondayOfWeek(dateStr);
    const start = new Date(earliestMonday + "T12:00:00");
    const current = new Date(monday + "T12:00:00");
    const diffDays = Math.floor((current.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
    const bucketIndex = Math.floor(diffDays / 14);
    return addDays(earliestMonday, bucketIndex * 14);
  }

  const map = new Map<string, PeriodGroup>();

  for (const s of sorted) {
    const periodStart = getPeriodStart(s.date);
    if (!map.has(periodStart)) {
      map.set(periodStart, {
        startMonday: periodStart,
        from: periodStart,
        to: addDays(periodStart, 13),
        totalMinutes: 0,
        daysCount: 0,
      });
    }
    const group = map.get(periodStart)!;
    group.totalMinutes += computeNetMinutes(s.arrival_time, s.departure_time, s.break_minutes, s.remote_minutes ?? 0);
    group.daysCount += 1;
  }

  let groups = Array.from(map.values());

  if (from.value) groups = groups.filter((g) => g.from >= from.value);
  if (to.value) groups = groups.filter((g) => g.to <= to.value);

  return groups.sort((a, b) => (b.startMonday > a.startMonday ? 1 : -1));
});

function downloadPdfForPeriod(startMonday: string) {
  const rawUser = window.localStorage.getItem("worktime:user");
  const user = rawUser ? JSON.parse(rawUser) as { id: number } : null;
  if (!user?.id) return;
  const url = `/api/report?monday=${encodeURIComponent(startMonday)}&userId=${encodeURIComponent(String(user.id))}`;
  window.open(url, "_blank");
}

async function deletePeriod(g: PeriodGroup) {
  const rawUser = window.localStorage.getItem("worktime:user");
  const user = rawUser ? JSON.parse(rawUser) as { id: number } : null;
  if (!user?.id) return;
  if (!window.confirm("Supprimer toute cette période ?")) return;
  deleting.value = g.startMonday;
  try {
    await deleteSessionsByPeriod(g.startMonday, user.id);
    emit("delete-period");
  } catch (e) {
    alert("Erreur lors de la suppression.");
  } finally {
    deleting.value = null;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Historique</h1>
        <p class="text-neutral-400 mt-1">Consultez et gérez vos périodes passées.</p>
      </div>

      <div class="flex items-center gap-4 bg-neutral-900 border border-neutral-800 p-2 rounded-2xl shadow-lg">
        <div class="flex items-center gap-2 px-3 border-r border-neutral-800">
          <Search class="h-4 w-4 text-neutral-500" />
          <input v-model="from" type="date" class="bg-transparent border-none outline-none text-xs font-medium focus:ring-0" placeholder="Du" />
        </div>
        <div class="flex items-center gap-2 px-3">
          <input v-model="to" type="date" class="bg-transparent border-none outline-none text-xs font-medium focus:ring-0" placeholder="Au" />
        </div>
      </div>
    </div>

    <div v-if="periodGroups.length > 0" class="grid grid-cols-1 gap-4">
      <div 
        v-for="g in periodGroups" 
        :key="g.startMonday"
        class="group bg-neutral-900/40 border border-neutral-800 hover:border-neutral-700 rounded-3xl p-6 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-6"
      >
        <div class="flex items-center gap-4">
          <div class="h-12 w-12 rounded-2xl bg-neutral-950 border border-neutral-800 flex items-center justify-center text-primary">
            <Calendar class="h-6 w-6" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold text-white">
                {{ formatDayShort(g.startMonday) }} — {{ formatDayShort(g.to) }}
              </span>
              <span class="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-neutral-800 text-neutral-500 font-bold border border-neutral-700">
                {{ g.daysCount }} jours
              </span>
            </div>
            <p class="text-xs text-neutral-500 mt-1 flex items-center gap-1">
              <Clock class="h-3 w-3" /> Période de 14 jours
            </p>
          </div>
        </div>

        <div class="flex items-center justify-between sm:justify-end gap-6">
          <div class="text-right">
            <p class="text-xl font-black text-primary">{{ minutesToHHMM(g.totalMinutes) }}</p>
            <p class="text-[10px] uppercase tracking-tighter text-neutral-600 font-bold">Total net</p>
          </div>

          <div class="flex items-center gap-2">
            <button 
              @click="downloadPdfForPeriod(g.startMonday)"
              class="h-10 px-4 flex items-center gap-2 rounded-xl bg-neutral-800 hover:bg-neutral-700 text-xs font-bold transition-colors"
            >
              <FileText class="h-4 w-4" />
              <span>PDF</span>
            </button>
            <button 
              @click="deletePeriod(g)"
              :disabled="deleting === g.startMonday"
              class="h-10 w-10 flex items-center justify-center rounded-xl border border-neutral-800 hover:border-red-900/50 hover:bg-red-900/10 text-neutral-500 hover:text-red-400 transition-all"
            >
              <Loader2 v-if="deleting === g.startMonday" class="h-4 w-4 animate-spin" />
              <Trash2 v-else class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex flex-col items-center justify-center py-20 bg-neutral-900/20 border border-neutral-900 border-dashed rounded-3xl">
      <AlertCircle class="h-10 w-10 text-neutral-800 mb-4" />
      <p class="text-neutral-500 font-medium">Aucun historique trouvé</p>
    </div>
  </div>
</template>
