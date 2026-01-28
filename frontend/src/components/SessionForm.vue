<script setup lang="ts">
import { computed, ref, watch, defineEmits, defineProps } from "vue";
import type { WorkSession } from "../services/api";
import { computeNetMinutes, minutesToHHMM } from "../utils/time";

const props = defineProps<{
  editingSession?: WorkSession | null;
}>();

const emit = defineEmits<{
  (e: "submit", payload: {
    id?: number;
    date: string;
    arrival_time: string;
    departure_time: string;
    break_minutes: number;
    remote_minutes: number;
    notes: string;
  }): void;
}>();

const today = new Date().toISOString().slice(0, 10);

const date = ref(today);
const arrival = ref("09:00");
const departure = ref("17:00");
const breakMinutes = ref(60);
const remoteMinutes = ref(0);
const notes = ref("");

watch(
  () => props.editingSession,
  (s) => {
    if (s) {
      date.value = s.date;
      arrival.value = s.arrival_time;
      departure.value = s.departure_time;
      breakMinutes.value = s.break_minutes;
      remoteMinutes.value = s.remote_minutes ?? 0;
      notes.value = s.notes ?? "";
    } else {
      date.value = today;
      arrival.value = "09:00";
      departure.value = "17:00";
      breakMinutes.value = 60;
      remoteMinutes.value = 0;
      notes.value = "";
    }
  },
  { immediate: true }
);

const netDuration = computed(() => {
  return minutesToHHMM(
    computeNetMinutes(
      arrival.value,
      departure.value,
      breakMinutes.value || 0,
      remoteMinutes.value || 0
    )
  );
});

function onSubmit() {
  emit("submit", {
    id: props.editingSession?.id,
    date: date.value,
    arrival_time: arrival.value,
    departure_time: departure.value,
    break_minutes: breakMinutes.value || 0,
    remote_minutes: remoteMinutes.value || 0,
    notes: notes.value,
  });
}
</script>

<template>
  <form class="card" @submit.prevent="onSubmit">
    <h2>Saisie de la journée</h2>

    <div class="field">
      <label>Date</label>
      <input v-model="date" type="date" required />
    </div>

    <div class="field">
      <label>Heure d'arrivée</label>
      <input v-model="arrival" type="time" required />
    </div>

    <div class="field">
      <label>Heure de départ</label>
      <input v-model="departure" type="time" required />
    </div>

    <div class="field">
      <label>Pause (minutes)</label>
      <input v-model.number="breakMinutes" type="number" min="0" />
    </div>

    <div class="field">
      <label>Télétravail (minutes)</label>
      <input v-model.number="remoteMinutes" type="number" min="0" />
    </div>

    <div class="field">
      <label>Notes</label>
      <textarea v-model="notes" rows="2" />
    </div>

    <div class="summary">
      <span>Temps net estimé :</span>
      <strong>{{ netDuration }}</strong>
    </div>

    <button type="submit">
      {{ editingSession ? "Mettre à jour" : "Enregistrer" }}
    </button>
  </form>
</template>

<style scoped>
.card {
  border: 1px solid #ddd;
  border-radius: 8px;
  padding: 1rem;
  margin-bottom: 1rem;
  background: #fff;
}
.field {
  display: flex;
  flex-direction: column;
  margin-bottom: 0.5rem;
}
.field label {
  font-size: 0.9rem;
  margin-bottom: 0.2rem;
}
input,
textarea {
  padding: 0.3rem 0.4rem;
  border-radius: 4px;
  border: 1px solid #ccc;
}
.summary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0.5rem 0 1rem;
}
button {
  padding: 0.5rem 1rem;
  border-radius: 4px;
  border: none;
  background: #2563eb;
  color: white;
  cursor: pointer;
}
button:hover {
  background: #1d4ed8;
}
</style>

