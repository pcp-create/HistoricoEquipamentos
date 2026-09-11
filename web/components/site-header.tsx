"use client";
import { BarChart3, Layers3, LogOut, Wrench } from "lucide-react";
export default function SiteHeader({
  active,
  email,
}: {
  active: "history" | "analysis";
  email?: string;
}) {
  async function logout() {
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    window.location.assign("/login");
  }
  return (
    <>
      <header className="topbar">
        <a className="brand" href="/">
          <span className="brand-icon">
            <Wrench size={24} />
          </span>
          <span>
            Histórico<span className="brand-small">EQUIPAMENTOS & PEÇAS</span>
          </span>
        </a>
        <div className="header-divider" />
        <span className="workspace-name">Central de manutenção</span>
        <div className="header-right">
          <span className="connection">
            <span />
            Base integrada M8
          </span>
          <span className="user-avatar" title={email || "Minha conta"}>
            {email?.slice(0, 2).toUpperCase() || "EQ"}
          </span>
          <button
            className="icon-button logout"
            aria-label="Sair da conta"
            onClick={logout}
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>
      <nav className="topnav" aria-label="Navegação principal">
        <a
          href="/"
          className={active === "history" ? "nav-active" : "nav-link"}
          aria-current={active === "history" ? "page" : undefined}
        >
          <Layers3 size={17} />
          Consulta de histórico
        </a>
        <a
          href="/analise-materiais"
          className={active === "analysis" ? "nav-active" : "nav-link"}
          aria-current={active === "analysis" ? "page" : undefined}
        >
          <BarChart3 size={17} />
          Análise de materiais
        </a>
      </nav>
    </>
  );
}
