<script setup lang="ts">
import { ref, computed } from "vue";
import { changePassword, type User } from "../services/api";

const props = defineProps<{
  user: User;
}>();

const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const loading = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

const canSubmit = computed(() => {
  return (
    currentPassword.value &&
    newPassword.value &&
    confirmPassword.value &&
    newPassword.value === confirmPassword.value &&
    newPassword.value.length >= 6
  );
});

async function onSubmit() {
  error.value = null;
  success.value = false;
  if (newPassword.value !== confirmPassword.value) {
    error.value = "Les deux mots de passe ne correspondent pas.";
    return;
  }
  if (newPassword.value.length < 6) {
    error.value = "Le nouveau mot de passe doit faire au moins 6 caractères.";
    return;
  }
  loading.value = true;
  try {
    await changePassword(
      props.user.username,
      currentPassword.value,
      newPassword.value
    );
    success.value = true;
    currentPassword.value = "";
    newPassword.value = "";
    confirmPassword.value = "";
  } catch (e: any) {
    error.value = e.message ?? "Erreur lors du changement de mot de passe.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <section class="profile-card">
    <h2>Mon profil</h2>
    <p class="hint">Compte : <strong>{{ user.username }}</strong></p>

    <form class="form" @submit.prevent="onSubmit">
      <div class="field">
        <label>Mot de passe actuel</label>
        <input
          v-model="currentPassword"
          type="password"
          autocomplete="current-password"
          required
        />
      </div>

      <div class="field">
        <label>Nouveau mot de passe</label>
        <input
          v-model="newPassword"
          type="password"
          autocomplete="new-password"
          required
          minlength="6"
        />
      </div>

      <div class="field">
        <label>Confirmer le nouveau mot de passe</label>
        <input
          v-model="confirmPassword"
          type="password"
          autocomplete="new-password"
          required
          minlength="6"
        />
      </div>

      <button class="btn-primary" type="submit" :disabled="loading || !canSubmit">
        {{ loading ? "Chargement..." : "Changer le mot de passe" }}
      </button>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="success" class="success">Mot de passe mis à jour.</p>
    </form>
  </section>
</template>

<style scoped>
.profile-card {
  max-width: 420px;
  padding: 1.5rem;
  background: var(--card-bg);
  border-radius: 16px;
  box-shadow: var(--shadow);
  border: 1px solid var(--border);
}

h2 {
  margin: 0 0 0.5rem;
}

.hint {
  margin: 0 0 1.25rem;
  color: var(--muted);
  font-size: 0.9rem;
}

.hint strong {
  color: var(--text);
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
  margin-top: 0.5rem;
  padding: 0.6rem 1.25rem;
  border-radius: 10px;
  border: none;
  background: var(--primary);
  color: #fff;
  font-weight: 600;
  cursor: pointer;
}

.btn-primary:disabled {
  opacity: 0.6;
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

.success {
  margin-top: 0.5rem;
  padding: 0.4rem 0.6rem;
  background: rgba(34, 197, 94, 0.2);
  color: #22c55e;
  border-radius: 8px;
  font-size: 0.85rem;
}
</style>
