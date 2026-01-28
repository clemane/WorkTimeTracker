export interface WorkSession {
  id?: number;
  user_id?: number;
  date: string; // YYYY-MM-DD
  arrival_time: string; // HH:MM
  departure_time: string; // HH:MM
  break_minutes: number;
  remote_minutes?: number | null;
  notes?: string | null;
  created_at?: string;
  updated_at?: string;
}

