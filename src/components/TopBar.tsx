export default function TopBar({ admin }: { admin: boolean }) {
  return <header className="topBar"><span className="workspaceLabel">{admin ? "Campus workspace / Admin Studio" : "Campus workspace / Home Feed"}</span><span className="pill"><img src="/aggie-fetch-logo.png" alt="" width={20} height={20} />fetchy community</span></header>;
}
