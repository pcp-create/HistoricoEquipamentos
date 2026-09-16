"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  BookOpen,
  BarChart3,
  Layers3,
  LogOut,
  ClipboardList,
  Settings,
  Wrench,
  ShieldCheck,
} from "lucide-react";
export default function SiteHeader({
  active,
  email,
}: {
  active:
    | "history"
    | "analysis"
    | "manufacturer"
    | "quotes"
    | "settings"
    | "equipment"
    | "admin";
  email?: string;
}) {
  const [admin, setAdmin] = useState(false);
  useEffect(() => {
    let stopped = false;
    const pulse = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/activity", { method: "POST" });
        if (!stopped) {
          if (r.ok) setAdmin((await r.json()).admin === true);
          else if (r.status === 401) setAdmin(false);
        }
      } catch {}
    };
    void pulse();
    const timer = setInterval(pulse, 60000);
    document.addEventListener("visibilitychange", pulse);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", pulse);
    };
  }, []);
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
          <Image
            className="rj-logo"
            src="/logo-rj.png"
            alt="RJ Compressores"
            width={444}
            height={312}
            unoptimized
          />
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
        <a
          href="/fabricante"
          className={active === "manufacturer" ? "nav-active" : "nav-link"}
          aria-current={active === "manufacturer" ? "page" : undefined}
        >
          <BookOpen size={17} /> Catálogo do fabricante
        </a>
        <a
          href="/orcamentos"
          className={active === "quotes" ? "nav-active" : "nav-link"}
          aria-current={active === "quotes" ? "page" : undefined}
        >
          <ClipboardList size={17} /> Orçamentos
        </a>
        <a
          href="/equipamentos"
          className={active === "equipment" ? "nav-active" : "nav-link"}
          aria-current={active === "equipment" ? "page" : undefined}
        >
          <Wrench size={17} /> Equipamentos
        </a>
        <a
          href="/configuracoes"
          className={active === "settings" ? "nav-active" : "nav-link"}
          aria-current={active === "settings" ? "page" : undefined}
        >
          <Settings size={17} /> Configurações
        </a>
        {admin && (
          <a
            href="/administracao"
            className={active === "admin" ? "nav-active" : "nav-link"}
            aria-current={active === "admin" ? "page" : undefined}
          >
            <ShieldCheck size={17} /> Administração
          </a>
        )}
      </nav>
    </>
  );
}
