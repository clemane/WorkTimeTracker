<script setup lang="ts">
import { ref, watch } from "vue";

const props = defineProps<{
  modelValue: string;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", val: string): void;
}>();

// On garde une copie locale pour l'affichage
const localValue = ref(props.modelValue);

// Met à jour la valeur locale si la prop change (ex: pré-remplissage)
watch(
  () => props.modelValue,
  (val) => {
    if (val !== localValue.value) localValue.value = val;
  }
);

function formatTime(val: string): string {
  // Enlève tout ce qui n'est pas chiffre
  const clean = val.replace(/[^0-9]/g, "");
  
  if (clean.length >= 3) {
    // Si on a au moins 3 chiffres (ex: 830 ou 0830), on insère les deux points
    const h = clean.slice(0, -2).padStart(2, "0"); // Prend tout sauf les 2 derniers
    const m = clean.slice(-2);
    
    // Validation basique
    let hour = parseInt(h);
    let min = parseInt(m);
    
    if (hour > 23) hour = 23;
    if (min > 59) min = 59;
    
    return `${String(hour).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
  }
  
  return val;
}

function onFocus(e: Event) {
  const input = e.target as HTMLInputElement;
  // Sélectionne tout le texte au focus pour faciliter le remplacement rapide
  input.select();
}

function onInput(e: Event) {
  const input = e.target as HTMLInputElement;
  // Si l'utilisateur tape plus de 4 chiffres, on garde les 4 derniers
  // pour permettre "l'override" naturel si on a oublié de sélectionner
  const raw = input.value.replace(/[^0-9]/g, "");
  if (raw.length > 4) {
      input.value = raw.slice(-4); // Garde les derniers chiffres tapés
  }
  localValue.value = input.value;
}

function onBlur() {
  // Au moment de quitter le champ, on formate proprement
  const formatted = formatTime(localValue.value);
  
  // Si vide ou invalide, on remet peut-être une valeur par défaut ou on laisse vide?
  // Ici on laisse vide si l'utilisateur a tout effacé.
  if (!localValue.value) {
      emit("update:modelValue", "");
      return;
  }

  // Si c'est valide (ex: 08:30), on émet
  // Regex simple HH:MM
  if (/^\d{2}:\d{2}$/.test(formatted)) {
    localValue.value = formatted;
    emit("update:modelValue", formatted);
  } else {
    // Si l'utilisateur a tapé n'importe quoi, on réinitialise à l'ancienne valeur
    localValue.value = props.modelValue;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === "Enter") {
    (e.target as HTMLInputElement).blur();
  }
}

// Support pour les flèches haut/bas pour incrémenter/décrémenter les minutes ? 
// Pour l'instant on reste simple.
</script>

<template>
  <input
    type="text"
    :value="localValue"
    @focus="onFocus"
    @input="onInput"
    @blur="onBlur"
    @keydown="onKeydown"
    placeholder="HH:MM"
    maxlength="5"
    class="w-full bg-canvas border border-border rounded-xl px-2 py-2 text-sm focus:border-primary focus:ring-1 focus:ring-primary/20 outline-none transition-all text-center font-mono placeholder:text-text-muted text-text-body"
  />
</template>
