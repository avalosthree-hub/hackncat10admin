import { useEffect, useState } from "react";
import { supabase, EmailRow } from "./supabase";

// RLS means this query only ever returns emails routed to this student.
export default function Student({ userId }: { userId: string }) {
  const [emails, setEmails] = useState<EmailRow[]>([]);
  const [filter, setFilter] = useState("All");
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState("");

  async function load() {
    const { data, error } = await supabase
      .from("emails")
      .select("id, from_address, subject, body_text, received_at, category, summary, status, error, tasks(id, title, due_date)")
      .eq("status", "processed")
      .order("received_at", { ascending: false })
      .limit(200);
    if (error) setError(error.message);
    else setEmails((data ?? []) as unknown as EmailRow[]);
  }

  useEffect(() => {
    load();
    // Live updates: refetch when new emails or routing rows appear
    const channel = supabase
      .channel("student-inbox-" + userId)
      .on("postgres_changes", { event: "*", schema: "public", table: "email_students" }, load)
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const categories = ["All", ...Array.from(new Set(emails.map((e) => e.category).filter(Boolean) as string[]))];
  const shown = emails.filter((e) => filter === "All" || e.category === filter);
  const upcoming = emails
    .flatMap((e) => (e.tasks ?? []).map((t) => ({ ...t, subject: e.subject })))
    .filter((t) => t.due_date)
    .sort((a, b) => a.due_date!.localeCompare(b.due_date!));

  return (
    <div className="grid">
      <main>
        <div className="chips">
          {categories.map((c) => (
            <button key={c} className={c === filter ? "chip active" : "chip"} onClick={() => setFilter(c)}>{c}</button>
          ))}
        </div>
        {error && <p className="error">{error}</p>}
        {shown.length === 0 && <p className="muted">No emails yet.</p>}
        {shown.map((e) => {
          const isOpen = open === e.id;
          const tasks = e.tasks ?? [];
          return (
            <article key={e.id} className={isOpen ? "card item open" : "card item"}>
              <button className="item-head" onClick={() => setOpen(isOpen ? null : e.id)} aria-expanded={isOpen}>
                <div className="row">
                  <strong>{e.subject || "(no subject)"}</strong>
                  <span className="head-right">
                    {e.category && <span className="tag">{e.category}</span>}
                    <span className="chevron">{isOpen ? "\u25B2" : "\u25BC"}</span>
                  </span>
                </div>
                {tasks.length > 0 ? (
                  <ul className="preview">
                    {tasks.map((t) => (
                      <li key={t.id}>{t.title}{t.due_date && <span className="muted"> (due {t.due_date})</span>}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="preview-text muted">{e.summary}</p>
                )}
              </button>
              {isOpen && (
                <div className="details">
                  <p className="muted small">{e.from_address} · {new Date(e.received_at).toLocaleString()}</p>
                  {e.summary && <p><strong>Summary:</strong> {e.summary}</p>}
                  <p className="muted small">Full email</p>
                  <pre className="body">{e.body_text}</pre>
                </div>
              )}
            </article>
          );
        })}
      </main>
      <aside className="card">
        <h2>Upcoming due dates</h2>
        {upcoming.length === 0 && <p className="muted">Nothing due.</p>}
        <ul>
          {upcoming.map((t) => (
            <li key={t.id}><strong>{t.due_date}</strong> {t.title}<div className="muted small">{t.subject}</div></li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
