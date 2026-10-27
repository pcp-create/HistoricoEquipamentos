"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {useSearchParams} from "next/navigation";
import { ArrowLeft, Activity } from "lucide-react";
import SiteHeader from "./site-header";

export default function TechnicalReportScreen({
  active,
  title,
  description,
  source,
  messageType,
}: {
  active: "vibration" | "leakage";
  title: string;
  description: string;
  source: string;
  messageType: string;
}) {
  const params=useSearchParams();
  const report=params.get("report");
  const frame = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(1100);
  useEffect(() => {
    function resize(event: MessageEvent) {
      if (
        event.origin !== location.origin ||
        event.source !== frame.current?.contentWindow
      )
        return;
      if (
        event.data?.type === messageType &&
        Number.isFinite(event.data.height)
      ) {
        setHeight(Math.max(600, event.data.height + 16));
      }
    }
    window.addEventListener("message", resize);
    return () => window.removeEventListener("message", resize);
  }, [messageType]);
  return (
    <div className="module-home">
      <SiteHeader active={active} moduleId="assistencia-tecnica" />
      <main
        style={{ maxWidth: 1480, margin: "0 auto", padding: "24px 24px 16px" }}
      >
        <Link className="module-back" href="/modulos/assistencia-tecnica">
          <ArrowLeft size={16} /> Assistência Técnica
        </Link>
        <div className="module-home-heading" style={{ marginTop: 20 }}>
          <span className="module-eyebrow">
            <Activity size={16} aria-hidden="true" /> MANUTENÇÃO PREDITIVA
          </span>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
      </main>
      <iframe
        ref={frame}
        src={active==="vibration"&&report?source+"?report="+encodeURIComponent(report):source}
        title={"Editor: " + title}
        style={{ display: "block", width: "100%", height, border: 0 }}
      />
    </div>
  );
}
