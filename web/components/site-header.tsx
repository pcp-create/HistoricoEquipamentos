"use client";
import { useEffect, useState } from "react";
import Image from "next/image";
import { userInitials } from "@/lib/user-display-name";
import { useSessionAccess } from "./session-access";
import { useSearchParams } from "next/navigation";
import { House, ChevronRight, LogOut, ShieldCheck } from "lucide-react";
const moduleNames: Record<string, string> = {
  tarefas: "Tarefas",
  crm: "CRM",
  "assistencia-tecnica": "Assistência Técnica",
  suprimentos: "Suprimentos",
  equipamentos: "Equipamentos",
};
const screens: Record<string, { label: string; modules: string[] }> = {
  tasks: { label: "Acompanhamento de tarefas", modules: ["tarefas"] },
  history: {
    label: "Consulta de histórico",
    modules: ["assistencia-tecnica", "crm"],
  },
  analysis: { label: "Análise de materiais", modules: ["suprimentos"] },
  manufacturer: {
    label: "Catálogo do fabricante",
    modules: ["suprimentos", "crm", "assistencia-tecnica"],
  },
  quotes: { label: "Orçamentos", modules: ["crm"] },
  settings: {
    label: "Configuração do catálogo",
    modules: ["suprimentos", "crm", "assistencia-tecnica"],
  },
  equipment: {
    label: "Gestão de equipamentos",
    modules: ["equipamentos", "assistencia-tecnica"],
  },
  admin: { label: "Administração", modules: [] },
  home: { label: "Módulos", modules: [] },
};
export default function SiteHeader({
  active,
  email,
  moduleId,
}: {
  active:
    | "tasks"
    | "home"
    | "history"
    | "analysis"
    | "manufacturer"
    | "quotes"
    | "settings"
    | "equipment"
    | "admin";
  email?: string;
  moduleId?: string;
}) {
  const screen = screens[active];
  const queryModule = useSearchParams().get("module") || "";
  const [contextModule, setContextModule] = useState("");
  const currentModule =
    moduleId && moduleNames[moduleId]
      ? moduleId
      : screen.modules.includes(queryModule)
        ? queryModule
        : screen.modules.includes(contextModule)
          ? contextModule
          : screen.modules[0];
  useEffect(() => {
    let stored = "";
    try {
      stored = sessionStorage.getItem("navigation-module") || "";
    } catch {}
    const candidate = moduleId || queryModule || stored;
    const chosen =
      active === "home" && moduleId
        ? moduleId
        : screens[active].modules.includes(candidate)
          ? candidate
          : screens[active].modules[0];
    setContextModule(chosen || "");
    if (chosen)
      try {
        sessionStorage.setItem("navigation-module", chosen);
      } catch {}
  }, [active, moduleId, queryModule]);
  const { admin: initialAdmin, displayName: initialName } = useSessionAccess();
  const [displayName, setDisplayName] = useState(initialName);
  useEffect(() => {
    setDisplayName(initialName);
  }, [initialName]);
  const [admin, setAdmin] = useState(initialAdmin);
  useEffect(() => {
    setAdmin(initialAdmin);
  }, [initialAdmin]);
  useEffect(() => {
    let stopped = false;
    const pulse = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/activity", { method: "POST" });
        if (!stopped) {
          if (r.ok) {
            const data = await r.json();
            setAdmin(data.admin === true);
            if (typeof data.displayName === "string")
              setDisplayName(data.displayName);
          } else if (r.status === 401) setAdmin(false);
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
            RJ Compressores<span className="brand-small">GESTÃO INTEGRADA</span>
          </span>
        </a>
        <div className="header-divider" />
        <span className="workspace-name">Portal da empresa</span>
        <div className="header-right">
          {admin && (
            <a
              className="icon-button"
              href="/administracao"
              aria-label="Administração"
              title="Administração"
            >
              <ShieldCheck size={18} />
            </a>
          )}
          <span className="connection">
            <span />
            Base integrada M8
          </span>
          <span
            className="user-avatar"
            title={displayName || email || "Minha conta"}
          >
            {userInitials(displayName || email || "")}
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
      {(active !== "home" || currentModule) && (
        <nav
          className="topnav module-breadcrumb"
          aria-label="Navegação principal"
        >
          <a href="/" className="nav-link">
            <House size={17} /> Módulos
          </a>
          {currentModule && (
            <>
              <ChevronRight size={14} aria-hidden="true" />
              <a
                href={"/modulos/" + currentModule}
                className={active === "home" ? "nav-active" : "nav-link"}
                aria-current={active === "home" ? "page" : undefined}
              >
                {moduleNames[currentModule]}
              </a>
            </>
          )}
          {active === "settings" && (
            <>
              <ChevronRight size={14} aria-hidden="true" />
              <a
                className="nav-link"
                href={"/fabricante?module=" + currentModule}
              >
                Catálogo do fabricante
              </a>
            </>
          )}
          {active !== "home" && (
            <>
              <ChevronRight size={14} aria-hidden="true" />
              <span className="nav-active" aria-current="page">
                {screen.label}
              </span>
            </>
          )}
        </nav>
      )}
    </>
  );
}
