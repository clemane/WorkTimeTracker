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
import { getSessions, type WorkSession, type User } from "./services/api";
import { getMondayOfWeek, addDays } from "./utils/week";

const activeTab = ref<"week" | "history" | "profile">("week");
const weekStart = ref(getMondayOfWeek(new Date().toISOString().slice(0, 10)));
const sessions = ref<WorkSession[]>([]);
const loading = ref(false);
const error = ref<string | null>(null);
const currentUser = ref<User | null>(null);

const weekRange = computed(() => ({
  from: weekStart.value,
  to: addDays(weekStart.value, 4),
}));

const weekSessions = computed(() => sessions.value);

function loadUserFromStorage() {
  try {
    const raw = window.localStorage.getItem("worktime:user");
    if (!raw) return;
    const parsed = JSON.parse(raw) as User;
    if (parsed && parsed.id && parsed.username) {
      currentUser.value = parsed;
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
  weekStart.value = monday;
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

</script>

<template>
  <div class="min-h-screen bg-black text-white selection:bg-primary/30">
    <!-- Header -->
    <header class="sticky top-0 z-50 border-b border-neutral-900 bg-black/50 backdrop-blur-xl">
      <div class="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        <div class="flex items-center gap-2 group cursor-default">
          <div class="flex h-8 w-8 items-center justify-center rounded-lg bg-primary group-hover:scale-110 transition-transform">
            <Clock class="h-5 w-5 text-white" />
          </div>
          <span class="text-lg font-bold tracking-tight">Antigravity</span>
        </div>

        <nav v-if="currentUser" class="hidden md:flex items-center gap-1 bg-neutral-900/50 p-1 rounded-xl border border-neutral-800">
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
              ? 'bg-neutral-800 text-white shadow-sm' 
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'"
          >
            <component :is="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </button>
        </nav>

        <div v-if="currentUser" class="flex items-center gap-4">
          <div class="hidden sm:flex flex-col items-end mr-2">
            <span class="text-sm font-medium">{{ currentUser.username }}</span>
            <span class="text-xs text-neutral-500 italic uppercase tracking-widest">Utilisateur</span>
          </div>
          <button 
            @click="logout"
            class="group flex h-10 w-10 items-center justify-center rounded-full border border-neutral-800 hover:bg-neutral-900 transition-colors"
            title="Déconnexion"
          >
            <LogOut class="h-4 w-4 text-neutral-400 group-hover:text-white transition-colors" />
          </button>
        </div>
      </div>

      <!-- Mobile Nav -->
      <div v-if="currentUser" class="flex md:hidden border-t border-neutral-900 px-4 py-2 overflow-x-auto gap-2 scrollbar-hide">
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
              ? 'bg-neutral-800 text-white shadow-sm' 
              : 'text-neutral-400 hover:text-white hover:bg-neutral-800/50'"
          >
            <component :is="tab.icon" class="h-4 w-4" />
            {{ tab.label }}
          </button>
      </div>
    </header>

    <main class="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
      <div v-if="!currentUser" class="flex items-center justify-center py-20">
        <LoginCard @logged-in="onLoggedIn" />
      </div>

      <template v-else>
        <!-- Status Banners -->
        <div v-if="error" 
          v-motion
          :initial="{ opacity: 0, y: -20 }"
          :enter="{ opacity: 1, y: 0 }"
          class="mb-6 flex items-center gap-3 rounded-xl border border-red-900/50 bg-red-900/10 p-4 text-red-400"
        >
          <AlertCircle class="h-5 w-5" />
          <p class="text-sm font-medium">{{ error }}</p>
        </div>

        <div v-if="loading" 
          v-motion
          :initial="{ opacity: 0 }"
          :enter="{ opacity: 1 }"
          class="mb-6 flex items-center gap-3 rounded-xl border border-neutral-800 bg-neutral-900/50 p-4 text-neutral-400"
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
            @saved="onWeekSaved"
            @update:week-start="onWeekChange"
          />

          <SessionsTable
            v-if="activeTab === 'history'"
            :sessions="sessions"
            @delete-period="loadSessions"
          />

          <ProfileCard
            v-if="activeTab === 'profile' && currentUser"
            :user="currentUser"
          />
        </div>
      </template>
    </main>

    <!-- Footer -->
    <footer class="mt-auto border-t border-neutral-900 py-8">
      <div class="mx-auto max-w-7xl px-4 text-center text-sm text-neutral-600 sm:px-6 lg:px-8">
        <p>© 2026 Antigravity. Minimalist Work Time Tracker.</p>
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
