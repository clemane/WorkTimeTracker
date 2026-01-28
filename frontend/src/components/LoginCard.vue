<script setup lang="ts">
import { ref } from "vue";
import { login, type User } from "../services/api";

const emit = defineEmits<{
  (e: "logged-in", user: User): void;
}>();

const username = ref("");
const password = ref("");
const loading = ref(false);
const error = ref<string | null>(null);

async function onSubmit() {
  error.value = null;
  loading.value = true;
  try {
    const user = await login(username.value, password.value);
    emit("logged-in", user);
  } catch (e: any) {
    error.value = e.message ?? "Connexion impossible";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="login-card">
    <h2>Connexion</h2>
    <p class="hint">Connecte-toi à ton compte d'heures.</p>

    <form class="form" @submit.prevent="onSubmit">
      <div class="field">
        <label>Identifiant</label>
        <input v-model="username" type="text" autocomplete="username" required />
      </div>

      <div class="field">
        <label>Mot de passe</label>
        <input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>

      <button class="btn-primary" type="submit" :disabled="loading">
        {{ loading ? "Connexion..." : "Se connecter" }}
      </button>

      <p v-if="error" class="error">{{ error }}</p>
    </form>
  </section>
</template>

<style scoped>
.login-card {
  max-width: 400px;
  margin: 4rem auto;
  padding: 2rem;
  background: var(--card-bg);
  border-radius: 16px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

h2 {
  margin: 0 0 0.5rem;
}

.hint {
  margin: 0 0 1.5rem;
  color: var(--muted);
  font-size: 0.9rem;
}

.form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.9rem;
}

label {
  color: var(--muted);
}

input {
  padding: 0.5rem 0.6rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--bg);
  color: var(--text);
}

.btn-primary {
  margin-top: 0.75rem;
  padding: 0.6rem 1.25rem;
  border-radius: 10px;
  border: none;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.7;
  cursor: not-allowed;
}

.error {
  margin-top: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: var(--error-bg);
  color: var(--error);
  border-radius: 8px;
  font-size: 0.85rem;
}
</style>

