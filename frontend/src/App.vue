<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
import { 
  Calendar, 
  History, 
  User as UserIcon, 
  LogOut, 
  Clock,
  AlertCircle,
  Loader2
} from "lucide-vue-next";
import WeekForm from "./components/WeekForm.vue";
import SessionsTable from "./components/SessionsTable.vue";
import LoginCard from "./components/LoginCard.vue";
import ProfileCard from "./components/ProfileCard.vue";
import MatrixRain from "./components/MatrixRain.vue";
import { getSessions, type WorkSession, type User } from "./services/api";
import { getMondayOfWeek, addDays, getPeriodRange, getBiWeeklyStart } from "./utils/week";

const activeTab = ref<"week" | "history" | "profile">("week");
const weekStart = ref(getMondayOfWeek(new Date().toISOString().slice(0, 10)));
const sessions = ref<WorkSession[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentUser = ref<User | null>(null);

const weekRange = computed(() => {
  const mode = currentUser.value?.timesheet_mode ?? "bi-weekly";
  const range = getPeriodRange(weekStart.value, mode);
  return range;
});

const weekSessions = computed(() => sessions.value);

function loadUserFromStorage() {
  try {
    const raw = window.localStorage.getItem("worktime:user");
    if (!raw) return;
    const parsed = JSON.parse(raw) as User;
    if (parsed && parsed.id && parsed.username) {
      currentUser.value = parsed;
      // Ensure initial weekStart is aligned if bi-weekly
      if (parsed.timesheet_mode === "bi-weekly") {
        weekStart.value = getBiWeeklyStart(weekStart.value);
      }
    }
  } catch {
    // ignore
  }
}

async function loadSessions(opts?: { from?: string; to?: string }) {
  if (!currentUser.value) return;
  loading.value = true;
  error.value = null;
  try {
    sessions.value = await getSessions({
      ...opts,
      userId: currentUser.value.id,
    });
  } catch (e: any) {
    error.value = e.message ?? "Erreur de chargement";
  } finally {
    loading.value = false;
  }
}

function onWeekSaved() {
  loadSessions(weekRange.value);
}

function onWeekChange(monday: string) {
  const mode = currentUser.value?.timesheet_mode ?? "bi-weekly";
  if (mode === "bi-weekly") {
    weekStart.value = getBiWeeklyStart(monday);
  } else if (mode === "monthly") {
    const d = new Date(monday + "T12:00:00");
    const startOfMonth = new Date(d.getFullYear(), d.getMonth(), 1, 12).toISOString().slice(0, 10);
    weekStart.value = getMondayOfWeek(startOfMonth);
  } else {
    weekStart.value = monday;
  }
}

watch(
  [activeTab, weekStart, currentUser],
  () => {
    if (!currentUser.value) return;
    if (activeTab.value === "week") {
      loadSessions(weekRange.value);
    } else if (activeTab.value === "history") {
      loadSessions();
    }
  },
  { immediate: true }
);

onMounted(() => {
  loadUserFromStorage();
});

function onLoggedIn(user: User) {
  currentUser.value = user;
  window.localStorage.setItem("worktime:user", JSON.stringify(user));
  loadSessions(weekRange.value);
}

function logout() {
  currentUser.value = null;
  sessions.value = [];
  window.localStorage.removeItem("worktime:user");
}

function onEditPeriod(monday: string) {
  weekStart.value = monday;
  activeTab.value = "week";
}

function onUserUpdate(user: User) {
  currentUser.value = user;
}

// Global Theme Handling
const currentTheme = ref("default");

function applyTheme(theme: string) {
  currentTheme.value = theme;
  if (theme === "default") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
}

// Load theme on mount
onMounted(() => {
  loadUserFromStorage();
  const savedTheme = window.localStorage.getItem("worktime:theme");
  if (savedTheme) applyTheme(savedTheme);
  
  // Listen for theme changes from ProfileCard
  window.addEventListener("theme-changed", () => {
    const t = window.localStorage.getItem("worktime:theme");
    if (t) currentTheme.value = t;
  });
});
</script>

<template>
  <div class="min-h-screen bg-canvas text-text-body selection:bg-primary/30 transition-colors duration-300 relative overflow-hidden">
    <!-- Matrix Rain Background -->
    <MatrixRain v-if="currentTheme === 'matrix'" />

    <!-- Header -->
    <header class="sticky top-0 z-50 border-b border-border bg-canvas/50 backdrop-blur-xl transition-colors duration-300">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-2 group cursor-default">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary group-hover:scale-110 transition-transform">
            <Clock class="h-5 w-5 text-primary-text" />
          </div>
          <span class="text-lg font-bold tracking-tight">Time Tracker</span>
        </div>

        <nav v-if="currentUser" class="hidden md:flex items-center gap-1 bg-surface p-1 rounded-xl border border-border">
          <button
            v-for="tab in ([
              { id: 'week', label: 'Semaine', icon: Calendar },
              { id: 'history', label: 'Historique', icon: History },
              { id: 'profile', label: 'Profil', icon: UserIcon },
            ] as const)"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all"
            :class="activeTab === tab.id 
              ? 'bg-primary text-primary-text shadow-sm' 
              : 'text-text-muted hover:text-text-body hover:bg-surface-hover'"
          >
            <component :is="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </button>
        </nav>

        <div v-if="currentUser" class="flex items-center gap-4">
          <div class="hidden sm:flex flex-col items-end mr-2">
            <span class="text-sm font-medium">{{ currentUser.username }}</span>
            <span class="text-xs text-text-muted italic uppercase tracking-widest">Utilisateur</span>
          </div>
          <button 
            @click="logout"
            class="group flex h-10 w-10 items-center justify-center rounded-full border border-border hover:bg-surface-hover transition-colors"
            title="Déconnexion"
          >
            <LogOut class="h-4 w-4 text-text-muted group-hover:text-text-body transition-colors" />
          </button>
        </div>
      </div>

      <!-- Mobile Nav -->
      <div v-if="currentUser" class="flex md:hidden border-t border-border px-4 py-2 overflow-x-auto gap-2 scrollbar-hide">
         <button
            v-for="tab in ([
              { id: 'week', label: 'Semaine', icon: Calendar },
              { id: 'history', label: 'Historique', icon: History },
              { id: 'profile', label: 'Profil', icon: UserIcon },
            ] as const)"
            :key="tab.id"
            @click="activeTab = tab.id"
            class="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg transition-all whitespace-nowrap"
            :class="activeTab === tab.id 
              ? 'bg-primary text-primary-text shadow-sm' 
              : 'text-text-muted hover:text-text-body hover:bg-surface-hover'"
          >
            <component :is="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </button>
      </div>
    </header>

    <main class="relative z-10 mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div v-if="!currentUser" class="flex items-center justify-center py-20">
        <LoginCard @logged-in="onLoggedIn" />
      </div>

      <template v-else>
        <!-- Status Banners -->
        <div v-if="error" 
          v-motion
          :initial="{ opacity: 0, y: -20 }"
          :enter="{ opacity: 1, y: 0 }"
          class="mb-6 flex items-center gap-3 rounded-xl border border-danger/50 bg-danger/10 p-4 text-danger"
        >
          <AlertCircle class="h-5 w-5" />
          <p class="text-sm font-medium">{{ error }}</p>
        </div>

        <div v-if="loading" 
          v-motion
          :initial="{ opacity: 0 }"
          :enter="{ opacity: 1 }"
          class="mb-6 flex items-center gap-3 rounded-xl border border-border bg-surface p-4 text-text-muted"
        >
          <Loader2 class="h-5 w-5 animate-spin" />
          <p class="text-sm font-medium">Chargement des données...</p>
        </div>

        <!-- Content Area -->
        <div 
          v-motion
          :initial="{ opacity: 0, y: 20 }"
          :enter="{ opacity: 1, y: 0 }"
          :key="activeTab"
        >
          <WeekForm
            v-if="activeTab === 'week'"
            :key="weekStart"
            :initial-monday="weekStart"
            :existing-sessions="weekSessions"
            :user-mode="currentUser.timesheet_mode"
            :working-days="currentUser.working_days"
            :default-arrival="currentUser.default_arrival"
            :default-departure="currentUser.default_departure"
            @saved="onWeekSaved"
            @update:week-start="onWeekChange"
          />

          <SessionsTable
            v-if="activeTab === 'history'"
            :sessions="sessions"
            @delete-period="loadSessions"
            @edit-period="onEditPeriod"
          />

          <ProfileCard
            v-if="activeTab === 'profile' && currentUser"
            :user="currentUser"
            @update:user="onUserUpdate"
          />
        </div>
      </template>
    </main>

    <!-- Footer -->
    <footer class="mt-auto border-t border-border py-8">
      <div class="mx-auto max-w-7xl px-4 text-center text-sm text-text-muted sm:px-6 lg:px-8">
        <p>© 2026 Made by GlobalTi.</p>
      </div>
    </footer>
  </div>
</template>

<style>
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
