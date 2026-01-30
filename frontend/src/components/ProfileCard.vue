<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { changePassword, updateProfile, type User } from "../services/api";
import { 
  User as UserIcon, 
  ShieldCheck, 
  Key, 
  CheckCircle2, 
  AlertCircle,
  Loader2,
  Lock,
  Settings,
  Clock,
  CalendarDays,
  Palette
} from "lucide-vue-next";
import TimeInput from "./TimeInput.vue";

const props = defineProps<{
  user: User;
}>();

const emit = defineEmits<{
  (e: "update:user", user: User): void;
}>();

// Security
const currentPassword = ref("");
const newPassword = ref("");
const confirmPassword = ref("");
const loading = ref(false);
const error = ref<string | null>(null);
const success = ref(false);

// Mode preference
const selectedMode = ref(props.user.timesheet_mode ?? "bi-weekly");
const defaultArrival = ref(props.user.default_arrival ?? "07:30");
const defaultDeparture = ref(props.user.default_departure ?? "16:30");
const workingDays = ref<number[]>(props.user.working_days ?? [0,1,2,3,4]);

// Theme selection
const currentTheme = ref(window.localStorage.getItem("worktime:theme") || "default");

function setTheme(theme: string) {
  currentTheme.value = theme;
  if (theme === "default") {
    document.documentElement.removeAttribute("data-theme");
  } else {
    document.documentElement.setAttribute("data-theme", theme);
  }
  window.localStorage.setItem("worktime:theme", theme);
  // Dispatch event for App.vue to pick up (for Matrix Rain)
  window.dispatchEvent(new Event("theme-changed"));
}

const updatingSettings = ref(false);
const settingsSuccess = ref(false);

watch(() => props.user, (u) => {
  if (u.timesheet_mode) selectedMode.value = u.timesheet_mode;
  if (u.default_arrival) defaultArrival.value = u.default_arrival;
  if (u.default_departure) defaultDeparture.value = u.default_departure;
  if (u.working_days) workingDays.value = u.working_days;
}, { deep: true });

async function saveSettings() {
  if (updatingSettings.value) return; // Prevent double save
  updatingSettings.value = true;
  settingsSuccess.value = false;
  try {
    const newData = {
      timesheet_mode: selectedMode.value as any,
      working_days: workingDays.value,
      default_arrival: defaultArrival.value,
      default_departure: defaultDeparture.value
    };
    
    await updateProfile(props.user.id, newData);
    
    // Update local storage
    const raw = window.localStorage.getItem("worktime:user");
    let updatedUser = { ...props.user, ...newData };
    
    if (raw) {
       const user = JSON.parse(raw);
       updatedUser = { ...user, ...newData };
       window.localStorage.setItem("worktime:user", JSON.stringify(updatedUser));
    }

    // Emit update instead of reloading
    emit("update:user", updatedUser);

    settingsSuccess.value = true;
    setTimeout(() => { settingsSuccess.value = false; }, 2000);
  } catch (e) {
    // console.error(e);
  } finally {
    updatingSettings.value = false;
  }
}

watch(
  [selectedMode, defaultArrival, defaultDeparture, workingDays],
  () => {
    saveSettings();
  },
  { deep: true }
);

const weekDays = [
  { val: 0, label: "Lun" },
  { val: 1, label: "Mar" },
  { val: 2, label: "Mer" },
  { val: 3, label: "Jeu" },
  { val: 4, label: "Ven" },
  { val: 5, label: "Sam" },
  { val: 6, label: "Dim" },
];

function toggleDay(day: number) {
  if (workingDays.value.includes(day)) {
    workingDays.value = workingDays.value.filter(d => d !== day);
  } else {
    workingDays.value = [...workingDays.value, day].sort();
  }
}

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
  <div class="max-w-4xl mx-auto space-y-8">
    <div class="flex items-center gap-4">
      <div class="h-16 w-16 rounded-3xl bg-primary/10 flex items-center justify-center text-primary">
        <UserIcon class="h-8 w-8" />
      </div>
      <div>
        <h1 class="text-3xl font-bold tracking-tight text-text-body">Mon Profil</h1>
        <p class="text-text-muted mt-1">Gérez vos informations de compte et votre sécurité.</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-8">
      <!-- Column 1: Account & Preferences -->
      <div class="bg-surface/40 border border-border rounded-3xl p-8 space-y-6 backdrop-blur-sm">
        <div class="flex items-center gap-3 text-text-muted">
          <ShieldCheck class="h-5 w-5" />
          <h2 class="text-sm font-bold uppercase tracking-widest">Informations du compte</h2>
        </div>

        <div class="space-y-4">
          <div>
            <label class="text-[10px] font-bold uppercase text-text-muted block mb-1">Identifiant</label>
            <p class="text-lg font-medium text-text-body">{{ user.username }}</p>
          </div>
          <div>
            <label class="text-[10px] font-bold uppercase text-text-muted block mb-1">Rôle</label>
            <p class="inline-flex items-center px-3 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold border border-primary/20">
              Utilisateur Standard
            </p>
          </div>
          
          <div class="pt-4 border-t border-border space-y-6">
             <div class="flex items-center gap-2 text-text-muted">
               <Settings class="h-4 w-4" />
               <h3 class="text-xs font-bold uppercase tracking-widest">Préférences</h3>
             </div>
             
             <!-- Mode Affichage -->
             <div>
               <label class="text-[10px] font-bold uppercase text-text-muted block mb-2">Affichage</label>
               <select 
                 v-model="selectedMode" 
                 class="w-full bg-canvas border border-border rounded-xl px-3 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all cursor-pointer text-text-body"
               >
                 <option value="weekly">Hebdomadaire (1 semaine)</option>
                 <option value="bi-weekly">Quinzaine (2 semaines)</option>
                 <option value="monthly">Mensuel (Mois complet)</option>
               </select>
             </div>

             <!-- Jours Travaillés -->
             <div>
               <label class="text-[10px] font-bold uppercase text-text-muted block mb-2 flex items-center gap-2">
                 <CalendarDays class="h-3 w-3" /> Jours travaillés
               </label>
               <div class="flex flex-wrap gap-2">
                 <button 
                   v-for="day in weekDays" 
                   :key="day.val"
                   @click="toggleDay(day.val)"
                   type="button"
                   class="h-8 w-8 rounded-full text-xs font-bold transition-all border"
                   :class="workingDays.includes(day.val) 
                     ? 'bg-primary text-primary-text border-primary' 
                     : 'bg-canvas text-text-muted border-border hover:border-text-muted'"
                 >
                   {{ day.label.slice(0, 1) }}
                 </button>
               </div>
             </div>

             <!-- Horaires par défaut -->
             <div class="grid grid-cols-2 gap-4">
               <div>
                 <label class="text-[10px] font-bold uppercase text-text-muted block mb-2 flex items-center gap-2">
                   <Clock class="h-3 w-3" /> Début
                 </label>
                 <TimeInput v-model="defaultArrival" />
               </div>
               <div>
                 <label class="text-[10px] font-bold uppercase text-text-muted block mb-2 flex items-center gap-2">
                   <Clock class="h-3 w-3" /> Fin
                 </label>
                 <TimeInput v-model="defaultDeparture" />
               </div>
             </div>

             <!-- Theme -->
             <div>
               <label class="text-[10px] font-bold uppercase text-text-muted block mb-2 flex items-center gap-2">
                 <Palette class="h-3 w-3" /> Thème
               </label>
               <div class="flex gap-2">
                 <button @click="setTheme('default')" type="button" class="h-8 w-8 rounded-full border border-border bg-black" :class="currentTheme === 'default' ? 'ring-2 ring-primary ring-offset-2 ring-offset-canvas' : ''"></button>
                 <button @click="setTheme('light')" type="button" class="h-8 w-8 rounded-full border border-border bg-white" :class="currentTheme === 'light' ? 'ring-2 ring-primary ring-offset-2 ring-offset-canvas' : ''"></button>
                 <button @click="setTheme('matrix')" type="button" class="h-8 w-8 rounded-full border border-border bg-black border-green-900 text-[10px] flex items-center justify-center font-bold" style="color: #00ff00" :class="currentTheme === 'matrix' ? 'ring-2 ring-green-500 ring-offset-2 ring-offset-canvas' : ''">M</button>
                 <button @click="setTheme('midnight')" type="button" class="h-8 w-8 rounded-full border border-border bg-slate-900" :class="currentTheme === 'midnight' ? 'ring-2 ring-violet-500 ring-offset-2 ring-offset-canvas' : ''"></button>
               </div>
             </div>
             
             <div v-if="updatingSettings || settingsSuccess" class="flex items-center gap-2 text-xs font-medium transition-all">
                <Loader2 v-if="updatingSettings" class="h-3 w-3 animate-spin text-primary" />
                <CheckCircle2 v-else class="h-3 w-3 text-green-400" />
                <span :class="updatingSettings ? 'text-text-muted' : 'text-green-400'">
                  {{ updatingSettings ? 'Enregistrement...' : 'Préférences enregistrées' }}
                </span>
             </div>
          </div>
        </div>
      </div>

      <!-- Column 2: Security -->
      <div class="bg-surface/40 border border-border rounded-3xl p-8 space-y-6 backdrop-blur-sm">
        <div class="flex items-center gap-3 text-text-muted">
          <Lock class="h-5 w-5" />
          <h2 class="text-sm font-bold uppercase tracking-widest">Sécurité</h2>
        </div>

        <form @submit.prevent="onSubmit" class="space-y-4">
          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase text-text-muted ml-1">Mot de passe actuel</label>
            <input 
              v-model="currentPassword" 
              type="password" 
              required
              autocomplete="current-password"
              class="w-full bg-canvas border border-border rounded-2xl px-4 py-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all text-text-body placeholder:text-text-muted"
            />
          </div>

          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase text-text-muted ml-1">Nouveau mot de passe</label>
            <input 
              v-model="newPassword" 
              type="password" 
              required
              minlength="6"
              autocomplete="new-password"
              class="w-full bg-canvas border border-border rounded-2xl px-4 py-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all text-text-body placeholder:text-text-muted"
            />
          </div>

          <div class="space-y-2">
            <label class="text-[10px] font-bold uppercase text-text-muted ml-1">Confirmer</label>
            <input 
              v-model="confirmPassword" 
              type="password" 
              required
              minlength="6"
              autocomplete="new-password"
              class="w-full bg-canvas border border-border rounded-2xl px-4 py-3 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all text-text-body placeholder:text-text-muted"
            />
          </div>

          <div v-if="error" class="flex items-center gap-2 text-xs font-medium text-danger py-1">
            <AlertCircle class="h-3 w-3" />
            {{ error }}
          </div>

          <div v-if="success" class="flex items-center gap-2 text-xs font-medium text-green-400 py-1">
            <CheckCircle2 class="h-3 w-3" />
            Mot de passe mis à jour !
          </div>

          <button 
            type="submit" 
            :disabled="loading || !canSubmit"
            class="w-full flex items-center justify-center gap-2 bg-text-body text-canvas font-bold py-3 rounded-2xl transition-all hover:opacity-90 active:scale-95 disabled:opacity-50"
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

