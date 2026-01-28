<script setup lang="ts">
import { computed, ref, watch, onMounted } from "vue";
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
  <div class="page">
    <header class="header">
      <h1 class="logo">Suivi de temps</h1>
      <nav v-if="currentUser" class="tabs">
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'week' }"
          @click="activeTab = 'week'"
        >
          Semaine
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'history' }"
          @click="activeTab = 'history'"
        >
          Historique
        </button>
        <button
          type="button"
          class="tab"
          :class="{ active: activeTab === 'profile' }"
          @click="activeTab = 'profile'"
        >
          Profil
        </button>
      </nav>
      <div v-else class="tabs"></div>
      <div v-if="currentUser" class="user-info">
        <span class="user-name">{{ currentUser.username }}</span>
        <button type="button" class="logout" @click="logout">Déconnexion</button>
      </div>
    </header>

    <main class="main">
      <LoginCard v-if="!currentUser" @logged-in="onLoggedIn" />

      <template v-else>
        <div v-if="error" class="banner error">{{ error }}</div>
        <div v-if="loading" class="banner info">Chargement…</div>

        <WeekForm
          v-show="activeTab === 'week'"
          :key="weekStart"
          :initial-monday="weekStart"
          :existing-sessions="weekSessions"
          @saved="onWeekSaved"
          @update:week-start="onWeekChange"
        />

        <SessionsTable
          v-show="activeTab === 'history'"
          :sessions="sessions"
        />

        <ProfileCard
          v-if="currentUser"
          v-show="activeTab === 'profile'"
          :user="currentUser"
        />
      </template>
    </main>
  </div>
</template>

<style scoped>
.page {
  min-height: 100vh;
  background: var(--bg);
  color: var(--text);
}

.header {
  background: var(--bg-soft);
  border-bottom: 1px solid var(--border);
  padding: var(--space-md) var(--space-lg);
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: var(--space-md);
}

.logo {
  margin: 0;
  font-size: 1.35rem;
  font-weight: 700;
  color: var(--text);
  letter-spacing: -0.02em;
}

.tabs {
  display: flex;
  gap: 2px;
  background: var(--bg);
  padding: 4px;
  border-radius: var(--radius);
}

.user-info {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 0.9rem;
  color: var(--muted);
}

.user-name {
  font-weight: 500;
}

.logout {
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--border);
  background: transparent;
  color: var(--muted);
  font-size: 0.8rem;
  cursor: pointer;
}

.tab {
  padding: 0.5rem 1rem;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-weight: 500;
  font-size: 0.95rem;
  cursor: pointer;
  transition: color 0.15s, background 0.15s;
}

.tab:hover {
  color: var(--text);
}

.tab.active {
  background: var(--primary);
  color: white;
}

.main {
  max-width: 1100px;
  margin: 0 auto;
  padding: var(--space-lg);
}

.banner {
  padding: 0.6rem 1rem;
  border-radius: var(--radius);
  margin-bottom: var(--space-md);
  font-size: 0.9rem;
}

.banner.error {
  background: var(--error-bg);
  color: var(--error);
}

.banner.info {
  background: var(--border);
  color: var(--muted);
}
</style>
