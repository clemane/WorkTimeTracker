# Jours fériés et vacances — Design

## Contexte

WorkTimeTracker permet aux utilisateurs de saisir leurs sessions quotidiennes (arrivée, départ, pause, télétravail). On veut pouvoir marquer un jour comme **Férié** ou **Vacances**, tout en gardant la possibilité d'y saisir des heures travaillées (cas où on bosse pendant ses vacances ou un jour férié).

## Objectif

Ajouter un sélecteur 3 états (Normal / Férié / Vacances) sur chaque jour du formulaire de saisie hebdomadaire. Les jours marqués Férié/Vacances affichent un champ simplifié (heures travaillées en HH:MM) au lieu de la grille arrivée/départ/pause/distant, et apparaissent avec un tag coloré dans l'UI et les rapports.

## Non-objectifs

- Pas de configuration admin globale des jours fériés (chaque user marque ses propres jours)
- Pas d'import automatique d'un calendrier de jours fériés québécois
- Pas de gestion d'un solde de vacances (banque de jours)
- Pas de validation/approbation par un manager

## Modèle de données

### Migration `backend/src/db.ts`

Deux nouvelles colonnes sur `work_sessions`, ajoutées via ALTER TABLE conditionnel (pattern déjà utilisé dans le projet) :

```sql
ALTER TABLE work_sessions ADD COLUMN day_type TEXT DEFAULT 'normal';
ALTER TABLE work_sessions ADD COLUMN worked_minutes INTEGER;
```

Valeurs possibles pour `day_type` : `'normal'`, `'holiday'`, `'vacation'`. Toutes les lignes existantes héritent de `'normal'` via DEFAULT.

`worked_minutes` est utilisé uniquement quand `day_type !== 'normal'`. NULL pour les jours normaux.

### Type `WorkSession` (`backend/src/types.ts`)

```ts
export type DayType = 'normal' | 'holiday' | 'vacation';

export interface WorkSession {
  id?: number;
  user_id?: number;
  date: string;
  arrival_time: string;
  departure_time: string;
  break_minutes: number;
  remote_minutes?: number | null;
  notes?: string | null;
  day_type: DayType;
  worked_minutes?: number | null;
  created_at?: string;
  updated_at?: string;
}
```

### Règle de calcul du net pour un jour

- Si `day_type === 'normal'` → `computeNetMinutes(arrival, departure, break, remote)` (logique actuelle, inchangée)
- Sinon → `worked_minutes ?? 0`

Pour les jours Férié/Vacances, `arrival_time`/`departure_time` restent en DB (avec les valeurs par défaut ou ce qui était saisi avant le switch de type) mais sont ignorés au calcul et masqués dans l'UI. Cela permet de revenir en Normal sans avoir reperdu les valeurs.

## Backend

### `backend/src/routes/sessions.ts`

Endpoint `POST /sessions/bulk` :
- Accepte `day_type` et `worked_minutes` dans chaque payload
- Validation :
  - `day_type` doit être l'une des trois valeurs autorisées (défaut `'normal'` si absent)
  - Si `day_type !== 'normal'`, `worked_minutes` doit être un entier ≥ 0 (défaut 0 si absent)
  - Si `day_type === 'normal'`, `worked_minutes` est ignoré (forcé à NULL)
- INSERT/UPDATE incluent les deux nouvelles colonnes

### `backend/src/db.ts` — `mapRowToWorkSession`

Ajoute au retour :
- `day_type: row.day_type ?? 'normal'`
- `worked_minutes: row.worked_minutes`

### `backend/src/routes/report.ts` (PDF et Excel)

- Calcul du net par ligne : applique la règle de calcul ci-dessus
- Affichage par jour : libellé/tag à côté de la date
  - Férié → tag jaune (amber)
  - Vacances → tag bleu (cyan)
- Total période : somme des nets de tous les jours (qu'ils viennent de l'amplitude ou de `worked_minutes`)
- Sous-titre sous le total : `X jour(s) férié(s) · Y jour(s) de vacances` (omis si 0 et 0)

## Frontend

### `frontend/src/services/api.ts`

- Ajoute `DayType` type
- `WorkSession` gagne `day_type` + `worked_minutes`
- `SessionPayload` gagne `day_type` + `worked_minutes` (optionnels)

### `frontend/src/components/WeekForm.vue`

Chaque carte jour reçoit en haut un sélecteur segmenté 3 états :

```
[Normal] [Férié] [Vacances]
```

- 3 boutons pill, `Normal` actif par défaut, couleurs : neutre / amber-400 / cyan-400
- Sélectionner Férié ou Vacances masque la grille (arrivée/départ/pause/distant) et affiche à la place :
  - Un tag coloré indiquant le type
  - Un champ `Heures travaillées` (HH:MM via le composant `TimeInput` existant)
  - Le champ Notes reste visible dans tous les cas

Type `DayRow` mis à jour :
```ts
type DayRow = {
  date: string;
  arrival_time: string;
  departure_time: string;
  break_minutes: number;
  remote_minutes: number;
  notes: string;
  day_type: DayType;
  worked_minutes: number;
  id?: number;
};
```

Logique :
- Fonction `computeRowNet(row)` qui applique la règle de calcul
- `totalNetMinutes` et `netByIndex` utilisent `computeRowNet` au lieu d'appeler directement `computeNetMinutes`
- Changer de type ne purge pas les valeurs : les champs cachés gardent leur dernière valeur en mémoire et sont restaurés si on repasse en Normal

### Brouillon localStorage

Pas de changement explicite : `day_type` et `worked_minutes` font partie de `DayRow` et sont sérialisés automatiquement via le `JSON.stringify` existant. Les anciens brouillons (avant migration) tomberont sur `day_type` undefined côté chargement — il faut donc faire le fallback `day_type ?? 'normal'` au moment du `applyDraft`.

## Tests manuels (golden path + edge cases)

1. Marquer un jour en Férié sans saisir d'heures → total inchangé pour ce jour (0h), tag jaune affiché, sauvegarde OK
2. Marquer un jour en Vacances avec 4h travaillées → 4h comptent dans le total période, tag bleu affiché
3. Passer un jour Vacances → Normal après avoir saisi des heures de vacances → les anciennes arrivée/départ reviennent (pas perdues)
4. Sauvegarder une période mixte (3 normaux + 2 fériés) → reload page → état restauré identiquement
5. Export PDF d'une période avec férié/vacances → tags présents, total correct, sous-titre compteurs affiché
6. Export Excel idem (le format Excel doit aussi montrer le type)
7. Tester avec un brouillon localStorage existant (avant migration) → `day_type` se met sur `'normal'` automatiquement, pas de crash
