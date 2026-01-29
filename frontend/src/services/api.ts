export interface WorkSession {
  id?: number;
  user_id?: number;
  date: string;
  arrival_time: string;
  departure_time: string;
  break_minutes: number;
  remote_minutes?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface User {
  id: number;
  username: string;
  timesheet_mode?: "weekly" | "bi-weekly" | "monthly";
  working_days?: number[]; // [0, 1, 2, 3, 4] for Mon-Fri
  default_arrival?: string;
  default_departure?: string;
}

const baseUrl = "/api";

export async function login(username: string, password: string): Promise<User> {
  const res = await fetch(baseUrl + "/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password }),
  });
  if (!res.ok) {
    throw new Error("Identifiants invalides");
  }
  return res.json();
}

export async function updateProfile(userId: number, data: Partial<User>): Promise<void> {
  const res = await fetch(baseUrl + "/auth/profile", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id: userId, ...data }),
  });
  if (!res.ok) throw new Error("Erreur lors de la mise à jour du profil");
}

export async function updateProfileMode(userId: number, mode: string): Promise<void> {
  return updateProfile(userId, { timesheet_mode: mode as any });
}

export async function changePassword(
  username: string,
  currentPassword: string,
  newPassword: string
): Promise<void> {
  const res = await fetch(baseUrl + "/auth/change-password", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username,
      currentPassword,
      newPassword,
    }),
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? "Impossible de changer le mot de passe"
    );
  }
}

export async function getSessions(params?: {
  from?: string;
  to?: string;
  userId?: number;
}): Promise<WorkSession[]> {
  const url = new URL(baseUrl + "/sessions", window.location.origin);
  if (params?.from) url.searchParams.set("from", params.from);
  if (params?.to) url.searchParams.set("to", params.to);
  if (params?.userId) url.searchParams.set("userId", String(params.userId));

  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Erreur lors de la récupération des sessions");
  return res.json();
}

export async function createSession(
  session: Omit<WorkSession, "id" | "created_at" | "updated_at">
): Promise<WorkSession> {
  const rawUser = window.localStorage.getItem("worktime:user");
  const user = rawUser ? (JSON.parse(rawUser) as User) : null;
  const res = await fetch(baseUrl + "/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...session,
      user_id: user?.id,
    }),
  });
  if (!res.ok) throw new Error("Erreur lors de la création de la session");
  return res.json();
}

export async function updateSession(
  id: number,
  session: Omit<WorkSession, "id" | "created_at" | "updated_at">
): Promise<WorkSession> {
  const rawUser = window.localStorage.getItem("worktime:user");
  const user = rawUser ? (JSON.parse(rawUser) as User) : null;
  const res = await fetch(`${baseUrl}/sessions/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      ...session,
      user_id: user?.id,
    }),
  });
  if (!res.ok) throw new Error("Erreur lors de la mise à jour de la session");
  return res.json();
}

export async function deleteSession(id: number): Promise<void> {
  const res = await fetch(`${baseUrl}/sessions/${id}`, {
    method: "DELETE",
  });
  if (!res.ok && res.status !== 204) {
    throw new Error("Erreur lors de la suppression de la session");
  }
}

export async function deleteSessionsByPeriod(
  monday: string,
  userId: number
): Promise<{ deleted: number }> {
  const url = new URL(baseUrl + "/sessions/period", window.location.origin);
  url.searchParams.set("monday", monday);
  url.searchParams.set("userId", String(userId));
  const res = await fetch(url.toString(), { method: "DELETE" });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(
      (data as { error?: string }).error ?? "Erreur lors de la suppression de la période"
    );
  }
  return res.json();
}

export type SessionPayload = Omit<WorkSession, "id" | "created_at" | "updated_at">;

export async function saveSessionsBulk(
  sessions: SessionPayload[]
): Promise<WorkSession[]> {
  const rawUser = window.localStorage.getItem("worktime:user");
  const user = rawUser ? (JSON.parse(rawUser) as User) : null;
  const res = await fetch(`${baseUrl}/sessions/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessions, userId: user?.id }),
  });
  if (!res.ok) throw new Error("Erreur lors de l'enregistrement de la semaine");
  return res.json();
}

