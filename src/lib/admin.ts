import { supabase } from "./supabase";
import { normalizeEmail, normalizeLabels } from "./validation";
export { normalizeEmail, normalizeLabels } from "./validation";

export type Assignment = { user_id: string; institution_id: string; role: "admin" | "owner"; institution_name?: string };
export type Institution = { id: string; name: string };
export type MailingList = { id: string; tag: string; institution: string; hashtags: string[] | null; created_at: string };
export type Sender = { id: string; list_id: string; sender_email: string; created_at: string };
export type Administrator = Assignment & { email: string; created_at: string };
export type Counts = { lists: number; senders: number; administrators: number };
export type RecentPost = { id: string; title: string | null; caption: string | null; created_at: string; hashtags: string[] | null; status: string };

export function message(error: unknown): string {
  if (error && typeof error === "object" && "code" in error) {
    if (error.code === "23505") return "This address or administrator is already registered. An address can belong to only one mailing list.";
    if (error.code === "23503") return "A related record changed. Refresh this page and try again.";
    if (error.code === "42501") return "You do not have permission for this action. Your administrator access may have changed.";
  }
  return error && typeof error === "object" && "message" in error ? String(error.message) : "Something went wrong. Please try again.";
}

export async function getAdminAssignments(authId: string): Promise<Assignment[]> {
  const profile = await supabase.from("users").select("id").eq("auth_id", authId).maybeSingle();
  if (profile.error) throw profile.error;
  if (!profile.data) return [];
  const { data, error } = await supabase.from("institution_admins").select("user_id,institution_id,role,institutions(name)").eq("user_id", profile.data.id);
  if (error) throw error;
  return (data ?? []).map(row => {
    const institution = row.institutions as unknown as { name: string } | null;
    return { user_id: row.user_id, institution_id: row.institution_id, role: row.role === "owner" ? "owner" as const : "admin" as const, institution_name: institution?.name };
  });
}

export async function getInstitution(id: string): Promise<Institution> {
  const { data, error } = await supabase.from("institutions").select("id,name").eq("id", id).single();
  if (error) throw error;
  return { ...data, name: data.name || "Institution" };
}

export async function getMailingLists(institution: string): Promise<MailingList[]> {
  const { data, error } = await supabase.from("list").select("id,tag,institution,hashtags,created_at").eq("institution", institution).order("tag");
  if (error) throw error;
  return (data ?? []).map(row => ({ ...row, tag: row.tag || "Untitled list", institution: row.institution || institution }));
}

export async function getSenders(institution: string): Promise<Sender[]> {
  const { data, error } = await supabase.from("list_senders").select("id,list_id,sender_email,created_at,list!inner(institution)").eq("list.institution", institution).order("sender_email");
  if (error) throw error;
  return data ?? [];
}

export async function createList(institution: string, name: string) {
  const tag = name.trim();
  if (!tag || tag.length > 150) throw new Error("Enter a list name of 1–150 characters.");
  const { data, error } = await supabase.from("list").insert({ tag, institution, hashtags: [] }).select("id").single();
  if (error) throw error;
  return data.id as string;
}

export async function updateList(institution: string, id: string, changes: { tag?: string; hashtags?: string[] }) {
  const patch: { tag?: string; hashtags?: string[] } = {};
  if (changes.tag !== undefined) {
    patch.tag = changes.tag.trim();
    if (!patch.tag || patch.tag.length > 150) throw new Error("Enter a list name of 1–150 characters.");
  }
  if (changes.hashtags !== undefined) patch.hashtags = normalizeLabels(changes.hashtags);
  const { error } = await supabase.from("list").update(patch).eq("id", id).eq("institution", institution).select("id").single();
  if (error) throw error;
}

export async function deleteList(institution: string, id: string) {
  const { error } = await supabase.from("list").delete().eq("id", id).eq("institution", institution).select("id").single();
  if (error) throw error;
}

async function requireList(institution: string, id: string) {
  const { error } = await supabase.from("list").select("id").eq("id", id).eq("institution", institution).single();
  if (error) throw error;
}

export async function addSender(institution: string, listId: string, email: string) {
  const sender_email = normalizeEmail(email);
  await requireList(institution, listId);
  const { error } = await supabase.from("list_senders").insert({ list_id: listId, sender_email }).select("id").single();
  if (error) throw error;
}

export async function updateSender(institution: string, sender: Sender, listId: string, email: string) {
  const sender_email = normalizeEmail(email);
  await requireList(institution, sender.list_id);
  if (listId !== sender.list_id) await requireList(institution, listId);
  const { error } = await supabase.from("list_senders").update({ list_id: listId, sender_email }).eq("id", sender.id).eq("list_id", sender.list_id).select("id").single();
  if (error) throw error;
}

export async function removeSender(institution: string, sender: Sender) {
  await requireList(institution, sender.list_id);
  const { error } = await supabase.from("list_senders").delete().eq("id", sender.id).eq("list_id", sender.list_id).select("id").single();
  if (error) throw error;
}

export async function getCounts(institution: string): Promise<Counts> {
  const { data, error } = await supabase.rpc("admin_dashboard_counts", { p_institution: institution });
  if (error) throw error;
  return data as Counts;
}

export async function getRecentPosts(institution: string): Promise<RecentPost[]> {
  const { data, error } = await supabase.from("email_posts").select("id,title,caption,created_at,hashtags,status").eq("institution_id", institution).order("created_at", { ascending: false }).limit(5);
  if (error) throw error;
  return data ?? [];
}

export async function getAdministrators(institution: string): Promise<Administrator[]> {
  const { data, error } = await supabase.rpc("admin_institution_roster", { p_institution: institution });
  if (error) throw error;
  return (data ?? []).map(row => ({ ...row, role: row.role === "owner" ? "owner" as const : "admin" as const }));
}

export async function assignAdministrator(institution: string, email: string) {
  const { error } = await supabase.rpc("assign_institution_admin_by_email", { p_institution: institution, p_email: normalizeEmail(email) });
  if (error) throw error;
}

export async function removeAdministrator(institution: string, userId: string) {
  const { error } = await supabase.from("institution_admins").delete().eq("institution_id", institution).eq("user_id", userId).eq("role", "admin").select("user_id").single();
  if (error) throw error;
}
