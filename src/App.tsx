import { useCallback, useEffect, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./lib/supabase";
import { getAdminAssignments, message } from "./lib/admin";
import type { Assignment } from "./lib/admin";
import { navigate, useRoute } from "./lib/routes";
import FeedPage from "./components/FeedPage";
import AdminStudio from "./components/AdminStudio";
import LoginScreen from "./components/LoginScreen";
import Sidebar from "./components/Sidebar";
import TopBar from "./components/TopBar";

export default function App() {
  return isSupabaseConfigured ? <ConfiguredApp /> : <LoginScreen />;
}

function ConfiguredApp() {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [authError, setAuthError] = useState("");
  const [access, setAccess] = useState<{ authId: string; assignments: Assignment[]; error: string } | null>(null);
  const [accessVersion, setAccessVersion] = useState(0);
  const [institutionId, setInstitutionId] = useState("");
  const route = useRoute();
  const refreshAccess = useCallback(() => setAccessVersion(v => v + 1), []);

  useEffect(() => {
    let active = true;
    let eventReceived = false;
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      eventReceived = true; setSession(next); setAuthLoading(false); setAuthError("");
    });
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || eventReceived) return;
      if (error) setAuthError(error.message);
      setSession(data.session); setAuthLoading(false);
    }).catch(err => { if (active && !eventReceived) { setAuthError(message(err)); setAuthLoading(false); } });
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);

  useEffect(() => {
    let active = true;
    const authId = session?.user.id;
    if (!authId) { setAccess(null); setInstitutionId(""); return; }
    getAdminAssignments(authId).then(assignments => {
      if (!active) return;
      setAccess({ authId, assignments, error: "" });
      setInstitutionId(current => assignments.some(a => a.institution_id === current) ? current : assignments[0]?.institution_id ?? "");
      if (!window.location.hash || window.location.hash === "#") navigate(assignments.length ? "/admin/overview" : "/feed");
    }).catch(err => { if (active) setAccess({ authId, assignments: [], error: message(err) }); });
    return () => { active = false; };
  }, [session?.user.id, accessVersion]);

  useEffect(() => {
    window.addEventListener("focus", refreshAccess);
    return () => window.removeEventListener("focus", refreshAccess);
  }, [refreshAccess]);

  async function logout() {
    const { error } = await supabase.auth.signOut();
    if (error) setAuthError(error.message);
  }
  if (authLoading) return <p className="center" role="status">Restoring your session…</p>;
  if (!session) return <>{authError && <p className="notice error" role="alert">{authError}</p>}<LoginScreen /></>;
  if (!access || access.authId !== session.user.id) return <p className="center" role="status">Checking institution access…</p>;
  const assignment = access.assignments.find(a => a.institution_id === institutionId);
  const adminPage = route.page !== "feed";

  return <div className="app">
    <Sidebar email={session.user.email ?? ""} assignment={assignment} assignments={access.assignments} route={route} onInstitutionChange={setInstitutionId} onLogout={() => { void logout(); }} />
    <div className="main"><TopBar admin={adminPage} /><main className="content">
      {authError && <p className="notice error" role="alert">{authError}</p>}
      {access.error && <div className="notice error" role="alert">Could not check administrator access: {access.error}<button onClick={refreshAccess}>Retry</button></div>}
      {adminPage ? assignment && !access.error ? <AdminStudio key={`${session.user.id}:${assignment.institution_id}:${assignment.role}`} assignment={assignment} route={route} onAccessRefresh={refreshAccess} /> : <section className="card accessDenied"><span className="eyebrow">PROTECTED WORKSPACE</span><h1>Administrator access required</h1><p>Your account does not have a verified administrator assignment for this institution. An institution owner can grant access to an existing registered account.</p><div className="pageActions"><button onClick={refreshAccess}>Check access again</button><a className="textLink" href="#/feed">Go to my student feed →</a></div></section> : <FeedPage key={session.user.id} userId={session.user.id} />}
    </main></div>
  </div>;
}
