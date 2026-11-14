import { supabase } from "./supabase";
export type FeedPost = { id: string; created_at: string; title: string | null; caption: string | null; content: string | null; hashtags: string[] | null; list: { id: string; name: string } };
export type Cursor = { created_at: string; id: string };
export type FeedPage = { posts: FeedPost[]; hasMore: boolean; nextCursor: Cursor | null };
export async function fetchFeed(cursor: Cursor | null = null): Promise<FeedPage> {
  const { data: response, error } = await supabase.rpc("get_user_feed", { p_limit: 15, p_cursor_created_at: cursor?.created_at ?? undefined, p_cursor_id: cursor?.id ?? undefined });
  if (error) throw error;
  const data = response as unknown as FeedPage;
  if (!data || !Array.isArray(data.posts) || typeof data.hasMore !== "boolean" || (data.hasMore && (!data.nextCursor?.id || !data.nextCursor?.created_at || (data.nextCursor.id === cursor?.id && data.nextCursor.created_at === cursor?.created_at)))) throw new Error("The feed returned an invalid response.");
  return data;
}
