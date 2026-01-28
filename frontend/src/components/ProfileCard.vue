<script setup lang="ts">
import { ref, computed } from "vue";
import { changePassword, type User } from "../services/api";
import { 
  User as UserIcon, 
  ShieldCheck, 
  Key, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Lock
} from "lucide-vue-next";

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
    setTimeout(() => { success.value = false; }, 5000);
  } catch (e: any) {
    error.value = e.message ?? "Erreur lors du changement de mot de passe.";
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-8">
    <div class="flex items-center gap-4">
      <div class="h-16 w-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary">
        <UserIcon class="h-8 w-8" />
      </div>
      <div>
        <h1 class="text-3xl font-bold tracking-tight">Mon Profil</h1>
        <p class="text-neutral-400 mt-1">Gérez vos informations de compte et votre sécurité.</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <!-- Account Info -->
      <div class="bg-neutral-900/40 border border-neutral-800 rounded-3xl p-8 space-y-6 backdrop-blur-sm">
        <div class="flex items-center gap-3 text-neutral-400">
          <ShieldCheck class="h-5 w-5" />
          <h2 class="text-sm font-bold uppercase tracking-widest">Informations du compte</h2>
        </div>

        <div class="space-y-4">
          <div>
            <label class="text-[10px] font-bold uppercase text-neutral-500 block mb-1">Identifiant</label>
            <p class="text-lg font-medium text-white">{{ user.username }}</p>
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase text-neutral-500 block mb-1">Rôle</label>
            <p class="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
              Utilisateur Standard
            </p>
          </div>
        </div>
      </div>

      <!-- Security / Password Change -->
      <div class="bg-neutral-900/40 border border-neutral-800 rounded-3xl p-8 space-y-6 backdrop-blur-sm">
        <div class="flex items-center gap-3 text-neutral-400">
          <Lock class="h-5 w-5" />
          <h2 class="text-sm font-bold uppercase tracking-widest">Sécurité</h2>
        </div>

        <form @submit.prevent="onSubmit" class="space-y-4">
          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase text-neutral-500 ml-1">Mot de passe actuel</label>
            <input 
              v-model="currentPassword" 
              type="password" 
              required
              class="w-full bg-neutral-950 border border-neutral-800 rounded-2xl px-4 py-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
            />
          </div>

          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase text-neutral-500 ml-1">Nouveau mot de passe</label>
            <input 
              v-model="newPassword" 
              type="password" 
              required
              minlength="6"
              class="w-full bg-neutral-950 border border-neutral-800 rounded-2xl px-4 py-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
            />
          </div>

          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase text-neutral-500 ml-1">Confirmer</label>
            <input 
              v-model="confirmPassword" 
              type="password" 
              required
              minlength="6"
              class="w-full bg-neutral-950 border border-neutral-800 rounded-2xl px-4 py-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all"
            />
          </div>

          <div v-if="error" class="flex items-center gap-2 text-xs font-medium text-red-400 py-1">
            <AlertCircle class="h-3 w-3" />
            {{ error }}
          </div>

          <div v-if="success" class="flex items-center gap-2 text-xs font-medium text-green-400 py-1">
            <CheckCircle2 class="h-3 w-3" />
            Mot de passe mis à jour avec succès.
          </div>

          <button 
            type="submit" 
            :disabled="loading || !canSubmit"
            class="w-full flex items-center justify-center gap-2 bg-white text-black font-bold py-3 rounded-2xl transition-all hover:bg-neutral-200 active:scale-95 disabled:opacity-50 disabled:hover:bg-white"
          >
            <Loader2 v-if="loading" class="h-4 w-4 animate-spin" />
            <Key v-else class="h-4 w-4" />
            {{ loading ? 'Changement...' : 'Mettre à jour' }}
          </button>
        </form>
      </div>
    </div>
  </div>
</template>
