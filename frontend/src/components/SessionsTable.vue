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
  Loader2,
  Download,
  Edit,
  LayoutList,
  CalendarDays,
  CalendarRange
} from "lucide-vue-next";

const props = defineProps<{
  sessions: WorkSession[];
  userMode?: string; // To default the view
}>();

const emit = defineEmits<{ (e: "delete-period"): void; (e: "edit-period", monday: string): void }>();
const deleting = ref<string | null>(null);

// Mode d'affichage de l'historique
const viewMode = ref<"weekly" | "bi-weekly" | "monthly">((props.userMode as any) ?? "bi-weekly");

// Filtre unique pour l'affichage et l'export
const dateFrom = ref<string>("");
const dateTo = ref<string>("");

type PeriodGroup = {
  startMonday: string;
  from: string;
  to: string;
  totalMinutes: number;
  daysCount: number;
};

const periodGroups = computed<PeriodGroup[]>(() => {
  if (props.sessions.length === 0) return [];

  // Sort sessions by date
  const sorted = [...props.sessions].sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : 0);
  
  // We need to group sessions based on user preference (weekly, bi-weekly, monthly).
  // Currently the code forces bi-weekly (14 days) logic:
  // const bucketIndex = Math.floor(diffDays / 14);
  
  // To avoid duplicates and respect user mode, we should fetch user mode or guess it?
  // Ideally, the grouping logic should match how data was entered.
  // For now, let's keep the bi-weekly logic but ensure it's robust.
  
  const earliestMonday = getMondayOfWeek(sorted[0].date);

  function getPeriodStart(dateStr: string): string {
    if (viewMode.value === "monthly") {
        // Group by 1st of month
        const d = new Date(dateStr + "T12:00:00");
        const year = d.getFullYear();
        const month = d.getMonth();
        return new Date(year, month, 1, 12).toISOString().slice(0, 10);
    }
    
    const monday = getMondayOfWeek(dateStr);
    
    if (viewMode.value === "weekly") {
        return monday;
    }

    // Bi-weekly
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
      let toStr = "";
      
      if (viewMode.value === "monthly") {
          const d = new Date(periodStart + "T12:00:00");
          const year = d.getFullYear();
          const month = d.getMonth();
          const lastDay = new Date(year, month + 1, 0, 12);
          toStr = lastDay.toISOString().slice(0, 10);
      } else if (viewMode.value === "weekly") {
          toStr = addDays(periodStart, 6);
      } else {
          toStr = addDays(periodStart, 13);
      }

      map.set(periodStart, {
        startMonday: periodStart, // Note: for Monthly, this is YYYY-MM-01, not necessarily a Monday
        from: periodStart,
        to: toStr,
        totalMinutes: 0,
        daysCount: 0,
      });
    }
    const group = map.get(periodStart)!;
    
    group.totalMinutes += computeNetMinutes(s.arrival_time, s.departure_time, s.break_minutes, s.remote_minutes ?? 0);
    group.daysCount += 1;
  }

  let groups = Array.from(map.values());

  if (dateFrom.value) groups = groups.filter((g) => g.from >= dateFrom.value);
  if (dateTo.value) groups = groups.filter((g) => g.to <= dateTo.value);

  return groups.sort((a, b) => (b.startMonday > a.startMonday ? 1 : -1));
});

function downloadPdfForPeriod(startMonday: string) {
  const rawUser = window.localStorage.getItem("worktime:user");
  const user = rawUser ? JSON.parse(rawUser) as { id: number } : null;
  if (!user?.id) return;
  const url = `/api/report?monday=${encodeURIComponent(startMonday)}&userId=${encodeURIComponent(String(user.id))}&mode=${viewMode.value}&format=pdf`;
  window.open(url, "_blank");
}

function downloadExcelForPeriod(startMonday: string) {
  const rawUser = window.localStorage.getItem("worktime:user");
  const user = rawUser ? JSON.parse(rawUser) as { id: number } : null;
  if (!user?.id) return;
  const url = `/api/report?monday=${encodeURIComponent(startMonday)}&userId=${encodeURIComponent(String(user.id))}&mode=${viewMode.value}&format=excel`;
  window.open(url, "_blank");
}

function downloadGlobalExcel() {
  const rawUser = window.localStorage.getItem("worktime:user");
  const user = rawUser ? JSON.parse(rawUser) as { id: number; timesheet_mode?: string } : null;
  if (!user?.id) return;
  
  // Use current view mode for bulk export sheets
  const mode = viewMode.value;
  let url = "";

  if (!dateFrom.value || !dateTo.value) {
    if (!confirm("Exporter tout l'historique ?")) return;
    const start = "2024-01-01";
    const end = "2030-12-31";
    url = `/api/report/bulk?from=${start}&to=${end}&userId=${encodeURIComponent(String(user.id))}&mode=${mode}&format=excel`;
  } else {
    url = `/api/report/bulk?from=${encodeURIComponent(dateFrom.value)}&to=${encodeURIComponent(dateTo.value)}&userId=${encodeURIComponent(String(user.id))}&mode=${mode}&format=excel`;
  }
  
  window.open(url, "_blank");
}

function editPeriod(g: PeriodGroup) {
  // If monthly, startMonday is YYYY-MM-01. We need to find the Monday of the first week of that month?
  // Or just pass the date and let WeekForm handle alignment.
  // Ideally for edit, we want to align to a Monday.
  let target = g.startMonday;
  if (viewMode.value === "monthly") {
      target = getMondayOfWeek(g.startMonday);
  }
  emit("edit-period", target);
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
function showPicker(event: Event) {
  try {
    (event.target as HTMLInputElement).showPicker();
  } catch (e) {
    // Fallback or ignore
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

      <div class="flex items-center gap-4 bg-surface border border-border p-2 rounded-2xl shadow-lg">
        <div class="flex bg-canvas rounded-xl p-1 border border-border mr-2">
          <button 
            @click="viewMode = 'weekly'"
            class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
            :class="viewMode === 'weekly' ? 'bg-surface shadow-sm text-text-body' : 'text-text-muted hover:text-text-body'"
          >
            <LayoutList class="h-3.5 w-3.5" /> Hebdo
          </button>
          <button 
            @click="viewMode = 'bi-weekly'"
            class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
            :class="viewMode === 'bi-weekly' ? 'bg-surface shadow-sm text-text-body' : 'text-text-muted hover:text-text-body'"
          >
            <CalendarRange class="h-3.5 w-3.5" /> Quinzaine
          </button>
          <button 
            @click="viewMode = 'monthly'"
            class="px-3 py-1.5 rounded-lg text-xs font-bold transition-all flex items-center gap-2"
            :class="viewMode === 'monthly' ? 'bg-surface shadow-sm text-text-body' : 'text-text-muted hover:text-text-body'"
          >
            <CalendarDays class="h-3.5 w-3.5" /> Mois
          </button>
        </div>

        <div class="flex items-center gap-2 px-3 border-r border-border cursor-pointer" @click="showPicker">
          <Search class="h-4 w-4 text-text-muted" />
          <input 
            v-model="dateFrom" 
            type="date" 
            class="bg-transparent border-none outline-none text-xs font-medium focus:ring-0 cursor-pointer text-text-body" 
            placeholder="Du" 
            @click="showPicker"
          />
        </div>
        <div class="flex items-center gap-2 px-3 cursor-pointer" @click="showPicker">
          <input 
            v-model="dateTo" 
            type="date" 
            class="bg-transparent border-none outline-none text-xs font-medium focus:ring-0 cursor-pointer text-text-body" 
            placeholder="Au" 
            @click="showPicker"
          />
        </div>
        <button 
          @click="downloadGlobalExcel"
          class="flex items-center gap-2 px-4 py-2.5 bg-green-600 hover:bg-green-500 text-white rounded-xl text-xs font-bold transition-all ml-2"
          title="Exporter la sélection en Excel"
        >
          <Download class="h-3.5 w-3.5" />
          <span class="hidden sm:inline">Excel Global</span>
        </button>
      </div>
    </div>

    <!-- Global Export Section REMOVED (Merged above) -->

    <div v-if="periodGroups.length > 0" class="grid grid-cols-1 gap-4">
      <div 
        v-for="g in periodGroups" 
        :key="g.startMonday"
        class="group bg-surface/40 border border-border hover:border-surface-hover rounded-3xl p-6 transition-all flex flex-col sm:flex-row sm:items-center justify-between gap-6"
      >
        <div class="flex items-center gap-4">
          <div class="h-12 w-12 rounded-2xl bg-canvas border border-border flex items-center justify-center text-primary">
            <Calendar class="h-6 w-6" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <span class="text-sm font-bold text-text-body">
                {{ formatDayShort(g.startMonday) }} — {{ formatDayShort(g.to) }}
              </span>
              <span class="text-[10px] uppercase tracking-widest px-2 py-0.5 rounded-full bg-surface-hover text-text-muted font-bold border border-border">
                {{ g.daysCount }} jours
              </span>
            </div>
            <p class="text-xs text-text-muted mt-1 flex items-center gap-1">
              <Clock class="h-3 w-3" /> 
              {{ viewMode === 'weekly' ? 'Semaine' : viewMode === 'monthly' ? 'Mois' : 'Quinzaine' }}
            </p>
          </div>
        </div>

        <div class="flex items-center justify-between sm:justify-end gap-6">
          <div class="text-right">
            <p class="text-xl font-black text-primary">{{ minutesToHHMM(g.totalMinutes) }}</p>
            <p class="text-[10px] uppercase tracking-tighter text-text-muted font-bold">Total net</p>
          </div>

          <div class="flex items-center gap-2">
            <button 
              @click="editPeriod(g)"
              class="h-10 w-10 flex items-center justify-center rounded-xl border border-border hover:bg-surface-hover text-text-muted hover:text-text-body transition-all"
              title="Modifier cette période"
            >
              <Edit class="h-4 w-4" />
            </button>
            <button 
              @click="downloadPdfForPeriod(g.startMonday)"
              class="h-10 px-4 flex items-center gap-2 rounded-xl bg-surface hover:bg-surface-hover border border-border text-xs font-bold transition-colors text-text-muted hover:text-text-body"
            >
              <FileText class="h-4 w-4" />
              <span>PDF</span>
            </button>
            <button 
              @click="downloadExcelForPeriod(g.startMonday)"
              class="h-10 px-4 flex items-center gap-2 rounded-xl bg-surface hover:bg-surface-hover border border-border text-xs font-bold transition-colors text-text-muted hover:text-text-body"
            >
              <FileText class="h-4 w-4 text-green-500" />
              <span>Excel</span>
            </button>
            <button 
              @click="deletePeriod(g)"
              :disabled="deleting === g.startMonday"
              class="h-10 w-10 flex items-center justify-center rounded-xl border border-border hover:border-danger/50 hover:bg-danger/10 text-text-muted hover:text-danger transition-all"
            >
              <Loader2 v-if="deleting === g.startMonday" class="h-4 w-4 animate-spin" />
              <Trash2 v-else class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>
    </div>

    <div v-else class="flex flex-col items-center justify-center py-20 bg-surface/20 border border-border border-dashed rounded-3xl">
      <AlertCircle class="h-10 w-10 text-text-muted mb-4" />
      <p class="text-text-muted font-medium">Aucun historique trouvé</p>
    </div>
  </div>
</template>
