<script setup lang="ts">
import { ref } from "vue";
import { login, type User } from "../services/api";
import { LogIn, User as UserIcon, Lock, Loader2 } from "lucide-vue-next";

const emit = defineEmits<{
  (e: "logged-in", user: User): void;
}>();

const username = ref("");
const password = ref("");
const loading = ref(false);
const error = ref<string | null>(null);

async function handleLogin() {
  if (!username.value || !password.value) return;
  loading.value = true;
  error.value = null;
  try {
    const user = await login(username.value, password.value);
    emit("logged-in", user);
  } catch (e: any) {
    error.value = e.message ?? "Identifiants invalides";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div 
    class="w-full max-w-md"
    v-motion
    :initial="{ opacity: 0, scale: 0.95 }"
    :enter="{ opacity: 1, scale: 1 }"
  >
    <div class="rounded-3xl border border-neutral-800 bg-neutral-900/40 p-8 backdrop-blur-xl shadow-2xl">
      <div class="mb-8 text-center">
        <div class="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary">
          <LogIn class="h-8 w-8" />
        </div>
        <h2 class="text-2xl font-bold tracking-tight text-white">Bienvenue</h2>
        <p class="mt-2 text-sm text-neutral-400">Connectez-vous pour suivre votre temps de travail</p>
      </div>

      <form @submit.prevent="handleLogin" class="space-y-5">
        <div class="space-y-2">
          <label for="username" class="text-xs font-semibold uppercase tracking-wider text-neutral-500 ml-1">
            Utilisateur
          </label>
          <div class="relative group">
            <div class="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-neutral-600 group-focus-within:text-primary transition-colors">
              <UserIcon class="h-4 w-4" />
            </div>
            <input
              id="username"
              v-model="username"
              type="text"
              required
              class="block w-full rounded-2xl border border-neutral-800 bg-neutral-950/50 py-3 pl-11 pr-4 text-white placeholder-neutral-600 transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="votre_nom"
            />
          </div>
        </div>

        <div class="space-y-2">
          <label for="password" class="text-xs font-semibold uppercase tracking-wider text-neutral-500 ml-1">
            Mot de passe
          </label>
          <div class="relative group">
            <div class="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-neutral-600 group-focus-within:text-primary transition-colors">
              <Lock class="h-4 w-4" />
            </div>
            <input
              id="password"
              v-model="password"
              type="password"
              required
              class="block w-full rounded-2xl border border-neutral-800 bg-neutral-950/50 py-3 pl-11 pr-4 text-white placeholder-neutral-600 transition-all focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/20"
              placeholder="••••••••"
            />
          </div>
        </div>

        <div v-if="error" class="text-center text-sm font-medium text-red-400 py-2">
          {{ error }}
        </div>

        <button
          type="submit"
          :disabled="loading"
          class="relative w-full overflow-hidden rounded-2xl bg-primary py-4 font-bold text-white transition-all hover:bg-primary/90 hover:scale-[1.02] active:scale-[0.98] disabled:opacity-50 disabled:hover:scale-100 shadow-lg shadow-primary/20"
        >
          <div class="flex items-center justify-center gap-2">
            <Loader2 v-if="loading" class="h-5 w-5 animate-spin" />
            <span v-else>Se connecter</span>
          </div>
        </button>
      </form>

      <div class="mt-8 pt-6 border-t border-neutral-800/50 text-center">
        <p class="text-xs text-neutral-500 italic">
          Système de suivi de temps interne
        </p>
      </div>
    </div>
  </div>
</template>
