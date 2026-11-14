import { useEffect, useState } from "react";
import { supabase, EmailRow } from "./supabase";

type Tab = "emails" | "students" | "settings";

export default function Admin() {
  const [tab, setTab] = useState<Tab>("emails");
  return (
    <div>
      <nav className="chips">
        {(["emails", "students", "settings"] as Tab[]).map((t) => (
          <button key={t} className={t === tab ? "chip active" : "chip"} onClick={() => setTab(t)}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </nav>
      {tab === "emails" && <Emails />}
      {tab === "students" && <Students />}
      {tab === "settings" && <Settings />}
    </div>
  );
}

// ---------- Emails ----------

function Emails() {
  const [rows, setRows] = useState<(EmailRow & { email_students: { student_id: string }[] })[]>([]);
  const [error, setError] = useState("");

  async function load() {
    const { data, error } = await supabase
      .from("emails")
      .select("id, from_address, subject, received_at, category, summary, status, error, body_text, email_students(student_id)")
      .order("received_at", { ascending: false })
      .limit(200);
    if (error) setError(error.message);
    else setRows((data ?? []) as any);
  }
  useEffect(() => {
    load();
  }, []);

  async function remove(id: string) {
    if (!confirm("Delete this email for everyone?")) return;
    const { error } = await supabase.from("emails").delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  const failed = rows.filter((r) => r.status === "failed").length;

  return (
    <div>
      <p className="muted">
        {rows.length} emails{failed > 0 && <> · <span className="error">{failed} failed</span></>}
        {" "}<button className="ghost" onClick={load}>Refresh</button>
      </p>
      {error && <p className="error">{error}</p>}
      <table>
        <thead>
          <tr><th>Received</th><th>From</th><th>Subject</th><th>Category</th><th>Students</th><th>Status</th><th></th></tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{new Date(r.received_at).toLocaleString()}</td>
              <td>{r.from_address}</td>
              <td title={r.summary ?? ""}>{r.subject}</td>
              <td>{r.category}</td>
              <td>{r.email_students.length}</td>
              <td title={r.error ?? ""} className={r.status === "failed" ? "error" : ""}>{r.status}</td>
              <td><button className="ghost" onClick={() => remove(r.id)}>Delete</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Students ----------

type Student = { id: string; name: string; email: string | null; classes: string[]; user_id: string | null };

function Students() {
  const [rows, setRows] = useState<Student[]>([]);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [classes, setClasses] = useState("");
  const [error, setError] = useState("");

  async function load() {
    const { data, error } = await supabase.from("students").select("*").order("name");
    if (error) setError(error.message);
    else setRows((data ?? []) as Student[]);
  }
  useEffect(() => {
    load();
  }, []);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    // Link to their login if they already signed up with this email
    let user_id: string | null = null;
    if (email) {
      const { data } = await supabase.from("profiles").select("id").eq("email", email.trim().toLowerCase()).maybeSingle();
      user_id = data?.id ?? null;
    }
    const { error } = await supabase.from("students").insert({
      name: name.trim(),
      email: email.trim().toLowerCase() || null,
      classes: classes.split(",").map((c) => c.trim()).filter(Boolean),
      user_id,
    });
    if (error) setError(error.message);
    else {
      setName(""); setEmail(""); setClasses("");
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Remove this student?")) return;
    const { error } = await supabase.from("students").delete().eq("id", id);
    if (error) setError(error.message);
    else load();
  }

  return (
    <div>
      <form className="card inline" onSubmit={add}>
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} required />
        <input type="email" placeholder="Login email" value={email} onChange={(e) => setEmail(e.target.value)} />
        <input placeholder="Classes (comma separated)" value={classes} onChange={(e) => setClasses(e.target.value)} />
        <button type="submit">Add student</button>
      </form>
      {error && <p className="error">{error}</p>}
      <p className="muted small">A student sees emails only after their login email matches a student row. Sign-up first, then add them here with the same email.</p>
      <table>
        <thead><tr><th>Name</th><th>Email</th><th>Classes</th><th>Login linked</th><th></th></tr></thead>
        <tbody>
          {rows.map((s) => (
            <tr key={s.id}>
              <td>{s.name}</td>
              <td>{s.email}</td>
              <td>{s.classes.join(", ")}</td>
              <td>{s.user_id ? "Yes" : "No"}</td>
              <td><button className="ghost" onClick={() => remove(s.id)}>Remove</button></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------- Settings ----------

function Settings() {
  const [values, setValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState("");

  useEffect(() => {
    supabase.from("settings").select("key, value").then(({ data }) => {
      setValues(Object.fromEntries((data ?? []).map((r) => [r.key, r.value])));
    });
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const rows = Object.entries(values).map(([key, value]) => ({ key, value, updated_at: new Date().toISOString() }));
    const { error } = await supabase.from("settings").upsert(rows);
    setMsg(error ? error.message : "Saved. New emails use these settings.");
  }

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setValues({ ...values, [k]: e.target.value });

  return (
    <form className="card stack" onSubmit={save}>
      <label>OpenAI model<input value={values.model ?? ""} onChange={set("model")} /></label>
      <label>Categories (comma separated)<input value={values.categories ?? ""} onChange={set("categories")} /></label>
      <label>System prompt<textarea rows={8} value={values.system_prompt ?? ""} onChange={set("system_prompt")} /></label>
      <button type="submit">Save</button>
      {msg && <p className="muted">{msg}</p>}
    </form>
  );
}
