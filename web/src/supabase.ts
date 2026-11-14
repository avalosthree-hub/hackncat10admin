import { createClient } from "@supabase/supabase-js";

export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL as string,
  import.meta.env.VITE_SUPABASE_ANON_KEY as string,
);

export type EmailRow = {
  id: string;
  from_address: string | null;
  subject: string | null;
  body_text: string | null;
  received_at: string;
  category: string | null;
  summary: string | null;
  status: "pending" | "processed" | "failed";
  error: string | null;
  tasks?: { id: string; title: string; due_date: string | null }[];
};
