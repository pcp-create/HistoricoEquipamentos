"use client";
import { useState } from "react";
import { Wrench, ChevronDown, Gauge } from "lucide-react";
import type { VisitCustomer } from "@/lib/visits/model";
import VisitMachineRegistration from "./visit-machine-registration";
export default function VisitCustomerMachines({
  customer: c,
  online,
  onSelectEquipment: selectEquipment,
}: {
  customer: VisitCustomer;
  online: boolean;
  onSelectEquipment: (
    customer: VisitCustomer,
    equipment: NonNullable<VisitCustomer["equipment"]>[number],
  ) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="visit-record-machines sales-card-machines">
      <button
        type="button"
        className="sales-card-machines-heading"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        <Wrench size={20} aria-hidden="true" />
        <span className="visit-record-machines-title">
          Máquinas do cliente{" "}
          <span className="visit-machine-count">
            ({c.equipment?.length || 0})
          </span>
          <small>Consulte as máquinas ou cadastre uma nova</small>
        </span>
        <ChevronDown size={18} aria-hidden="true" />
      </button>
      {expanded && (
        <section
          className="visit-record-machines-body sales-client-machines"
          aria-label={"Máquinas de " + c.name}
        >
          {!c.equipment?.length && (
            <p>Nenhuma máquina integrada para este cliente.</p>
          )}
          {c.equipment?.map((item) => (
            <article className="visit-machine-record-card" key={item.id}>
              <strong>{item.name}</strong>
              <p>Modelo: {item.model || "Não informado"}</p>
              <p>Série: {item.serial || "Não informada"}</p>
              <p>
                Horímetro:{" "}
                <b>
                  {item.meter == null
                    ? "Não informado"
                    : item.meter.toLocaleString("pt-BR") + " h"}
                </b>{" "}
                · Coleta:{" "}
                {item.meterDate
                  ? item.meterDate.split("-").reverse().join("/")
                  : "Não registrada"}
              </p>
              <button
                disabled={!online}
                onClick={() => selectEquipment(c, item)}
              >
                <Gauge size={16} />
                Registrar horímetro
              </button>
            </article>
          ))}
          <VisitMachineRegistration
            customer={c.key}
            name={c.name}
            online={online}
          />
        </section>
      )}
    </div>
  );
}
