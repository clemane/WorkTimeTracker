# Time Tracker

Application web de suivi des heures de travail. Permet aux employés de saisir leurs sessions quotidiennes (arrivée, départ, pauses, télétravail) et de générer des rapports PDF/Excel.

![Vue 3](https://img.shields.io/badge/Vue-3-4FC08D?logo=vue.js)
![Express](https://img.shields.io/badge/Express-4-000000?logo=express)
![SQLite](https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite)
![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript)
![Tailwind CSS](https://img.shields.io/badge/Tailwind-4-06B6D4?logo=tailwindcss)

## Fonctionnalites

- **Saisie des heures** : arrivee, depart, pause, minutes en teletravail, notes
- **Modes de feuille de temps** : hebdomadaire, bi-hebdomadaire, mensuel
- **Export PDF** via Puppeteer (rapport formate avec resume par semaine)
- **Export Excel** via ExcelJS (periode unique ou multi-periodes)
- **Envoi par email** des rapports PDF via SMTP
- **Profil utilisateur** : jours travailles, horaires par defaut, changement de mot de passe
- **Themes visuels** incluant un mode "Matrix"
- **Interface responsive** (mobile + desktop)

## Stack technique

| Couche | Technologies |
|--------|-------------|
| Frontend | Vue 3, Vite, Tailwind CSS 4, VueUse, Lucide Icons |
| Backend | Node.js, Express, TypeScript |
| Base de donnees | SQLite (better-sqlite3) |
| Rapports | Puppeteer (PDF), ExcelJS (Excel) |
| Email | Nodemailer |

## Installation

### Prerequis

- Node.js >= 18
- npm

### 1. Cloner le projet

```bash
git clone https://github.com/<votre-username>/time-tracker.git
cd time-tracker
```

### 2. Backend

```bash
cd backend
cp .env.example .env   # Configurer les variables d'environnement
npm install
npm run dev
```

Le serveur API demarre sur `http://localhost:4001`.

### 3. Frontend

```bash
cd frontend
npm install
npm run dev
```

L'interface demarre sur `http://localhost:4000` et proxifie `/api` vers le backend.

## Configuration

Toutes les options sensibles sont dans `backend/.env` :

| Variable | Description | Defaut |
|----------|-------------|--------|
| `PORT` | Port du serveur API | `4001` |
| `SEED_USERS` | Utilisateurs initiaux (`user:pass,user2:pass2`) | `admin:changeme` |
| `SMTP_HOST` | Serveur SMTP | `localhost` |
| `SMTP_PORT` | Port SMTP | `25` |
| `SMTP_SECURE` | Connexion TLS | `false` |
| `MAIL_FROM` | Expediteur des rapports | `noreply@example.com` |
| `MAIL_TO` | Destinataire des rapports | `admin@example.com` |

## Scripts disponibles

### Backend

| Commande | Description |
|----------|-------------|
| `npm run dev` | Demarrage en mode developpement (hot reload) |
| `npm run build` | Compilation TypeScript |
| `npm start` | Demarrage en production |

### Frontend

| Commande | Description |
|----------|-------------|
| `npm run dev` | Serveur de developpement Vite |
| `npm run build` | Build de production |
| `npm run preview` | Preview du build |

## Structure du projet

```
.
├── backend/
│   ├── src/
│   │   ├── server.ts          # Point d'entree Express
│   │   ├── db.ts              # Init SQLite + schema + seed
│   │   ├── mailer.ts          # Transport Nodemailer
│   │   ├── types.ts           # Interfaces TypeScript
│   │   └── routes/
│   │       ├── auth.ts        # Login, profil, mot de passe
│   │       ├── sessions.ts    # CRUD sessions de travail
│   │       └── report.ts      # Generation PDF/Excel + email
│   ├── .env.example
│   └── package.json
│
└── frontend/
    ├── src/
    │   ├── App.vue            # Layout principal + auth
    │   ├── components/
    │   │   ├── LoginCard.vue
    │   │   ├── WeekForm.vue
    │   │   ├── SessionsTable.vue
    │   │   ├── ProfileCard.vue
    │   │   ├── TimeInput.vue
    │   │   └── MatrixRain.vue
    │   ├── services/
    │   │   └── api.ts
    │   └── utils/
    │       ├── time.ts
    │       └── week.ts
    ├── vite.config.ts
    └── package.json
```

## Licence

MIT
