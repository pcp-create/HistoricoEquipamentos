"use client";

import Link from "next/link";
import {
  ArrowUpRight,
  ArrowLeft,
  Users,
  Wrench,
  PackageSearch,
  Factory,
  ClipboardList,
} from "lucide-react";
import SiteHeader from "./site-header";

const modules = [
  {
    id: "crm",
    title: "CRM",
    icon: Users,
    description: "Apoio ao comercial e preparação de propostas.",
    links: [
      ["Orçamentos", "/orcamentos"],
      ["Histórico de clientes e peças", "/historico"],
      ["Catálogo do fabricante", "/fabricante"],
    ],
    next: "Próximas etapas: clientes, oportunidades e acompanhamento comercial.",
  },
  {
    id: "assistencia-tecnica",
    title: "Assistência Técnica",
    icon: Wrench,
    description: "Consulta técnica e planejamento das manutenções.",
    links: [
      ["Consulta de histórico / OS", "/historico"],
      ["Catálogo do fabricante", "/fabricante"],
      ["Equipamentos e planos preventivos", "/equipamentos"],
    ],
    next: "Próximas etapas: agenda, atendimento e apontamentos de campo.",
  },
  {
    id: "suprimentos",
    title: "Suprimentos",
    icon: PackageSearch,
    description: "Produtos, custos, estoques e alternativas de peças.",
    links: [
      ["Análise e consulta de materiais", "/analise-materiais"],
      ["Catálogo do fabricante", "/fabricante"],
    ],
    next: "Próximas etapas: solicitações, cotações e compras.",
  },
  {
    id: "equipamentos",
    title: "Equipamentos",
    icon: Factory,
    description: "Máquinas de clientes, frota própria e planos preventivos.",
    links: [["Gestão de equipamentos e contratos", "/equipamentos"]],
    next: "Inclui locação, empréstimos, situação da frota e preventivas.",
  },
  {
    id: "tarefas",
    title: "Tarefas",
    icon: ClipboardList,
    description: "Alertas, responsáveis e acompanhamento das tratativas.",
    links: [["Últimas tarefas, minhas tarefas e calendário", "/tarefas"]],
    next: "Notas, anexos e histórico de cada ocorrência.",
  },
];

export default function ModuleHome({ moduleId }: { moduleId?: string }) {
  const selected = modules.find((module) => module.id === moduleId);
  return (
    <div className="module-home">
      <SiteHeader active="home" moduleId={selected?.id} />
      <main className="module-home-main">
        <div className="module-home-heading">
          {selected && (
            <Link prefetch={false} className="module-back" href="/">
              <ArrowLeft size={16} /> Todos os módulos
            </Link>
          )}
          <span className="module-eyebrow">PORTAL DA EMPRESA</span>
          <h1>{selected ? selected.title : "Módulos"}</h1>
          <p>
            {selected
              ? selected.description
              : "Escolha uma área para acessar suas ferramentas."}
          </p>
        </div>
        {selected ? (
          <nav
            className="module-menu-grid"
            aria-label={"Menus de " + selected.title}
          >
            {selected.links.map(([label, href]) => (
              <Link
                prefetch={false}
                className="module-menu-item"
                key={label}
                href={href + "?module=" + selected.id}
              >
                {label}
                <ArrowUpRight size={18} aria-hidden="true" />
              </Link>
            ))}
          </nav>
        ) : (
          <nav className="module-tile-grid" aria-label="Módulos do sistema">
            {modules.map(({ id, title, icon: Icon, description }) => (
              <Link
                prefetch={false}
                className="module-tile"
                key={id}
                href={id === "tarefas" ? "/tarefas" : "/modulos/" + id}
              >
                <span className="module-icon">
                  <Icon size={27} aria-hidden="true" />
                </span>
                <span>
                  <h2>{title}</h2>
                  <p>{description}</p>
                </span>
              </Link>
            ))}
          </nav>
        )}
      </main>
    </div>
  );
}
