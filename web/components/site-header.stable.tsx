"use client";
import Link from "next/link";
import { readActivityLocation } from "@/lib/activity-location";
import { apiFetch } from "@/lib/client-api-cache";
import { useEffect, useState } from "react";
import Image from "next/image";
import { userInitials } from "@/lib/user-display-name";
import { useSessionAccess } from "./session-access";
import { useSearchParams } from "next/navigation";
import { House, ChevronRight, LogOut, ShieldCheck } from "lucide-react";
const moduleNames: Record<string, string> = {
  oficina: "Gestão de Oficina",
  visitas: "Visitas",
  tarefas: "Tarefas",
  crm: "CRM",
  "assistencia-tecnica": "Assistência Técnica",
  suprimentos: "Suprimentos",
  equipamentos: "Gestão de Equipamentos",
};
const screens: Record<string, { label: string; modules: string[] }> = {
  workshop: {label:"Painel da oficina",modules:["oficina"]},
  visitsManagement: { label: "Gestão de Visitas", modules: ["visitas"] },
  leakage: { label: "Gerar Relatório Caça Vazamento", modules: ["assistencia-tecnica"] },
  vibration: { label: "Gerar Relatório Análise de Vibração", modules: ["assistencia-tecnica"] },
  scheduling: { label: "Programação de OSs", modules: ["assistencia-tecnica"] },
  tasks: { label: "Acompanhamento de tarefas", modules: ["tarefas"] },
  history: {
    label: "Ordens de Serviço",
    modules: ["assistencia-tecnica"],
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
  equipmentPreventives: {label:"Controle de Preventivas",modules:["equipamentos","assistencia-tecnica"]},
  equipmentRental: {label:"Controle de locação",modules:["equipamentos"]},
  equipmentClients: {label:"Cliente / Equipamento",modules:["equipamentos"]},
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
    | "workshop"
    | "visitsManagement"
    | "leakage"
    | "vibration"
    | "scheduling"
    | "tasks"
    | "home"
    | "history"
    | "analysis"
    | "manufacturer"
    | "quotes"
    | "settings"
    | "equipmentPreventives"
    | "equipmentRental"
    | "equipmentClients"
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
    let busy = false;
    const pulse = async () => {
      if (stopped || busy || document.visibilityState !== "visible") return;
      busy = true;
      try {
        const location = await readActivityLocation(navigator.geolocation);
        if (stopped || document.visibilityState !== "visible") return;
        const r = await apiFetch("/api/activity", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ location }),
        });
        if (!stopped) {
          if (r.ok) {
            const data = await r.json();
            setAdmin(data.admin === true);
            if (typeof data.displayName === "string")
              setDisplayName(data.displayName);
          } else if (r.status === 401) setAdmin(false);
        }
      } catch {} finally { busy = false; }
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
    await apiFetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "logout" }),
    });
    window.location.assign("/login");
  }
  return (
    <>
      <header className="topbar">
        <Link prefetch={false} className="brand" href="/">
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
        </Link>
        <div className="header-divider" />
        <span className="workspace-name">Portal da empresa</span>
        <div className="header-right">
          {admin && (
            <Link
              prefetch={false}
              className="icon-button"
              href="/administracao"
              aria-label="Administração"
              title="Administração"
            >
              <ShieldCheck size={18} />
            </Link>
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
          <Link prefetch={false} href="/" className="nav-link">
            <House size={17} /> Módulos
          </Link>
          {currentModule && (
            <>
              <ChevronRight size={14} aria-hidden="true" />
              <Link
                prefetch={false}
                href={"/modulos/" + currentModule}
                className={active === "home" ? "nav-active" : "nav-link"}
                aria-current={active === "home" ? "page" : undefined}
              >
                {moduleNames[currentModule]}
              </Link>
            </>
          )}
          {active === "settings" && (
            <>
              <ChevronRight size={14} aria-hidden="true" />
              <Link
                prefetch={false}
                className="nav-link"
                href={"/fabricante?module=" + currentModule}
              >
                Catálogo do fabricante
              </Link>
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
