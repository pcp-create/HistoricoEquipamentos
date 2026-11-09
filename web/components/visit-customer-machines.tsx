"use client";
import VisitEquipmentGroup from "./visit-equipment-group";
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
          <VisitEquipmentGroup key={c.key} customer={c.key} equipment={c.equipment||[]} online={online} inlineActions render={(item,inactive,actions) => (
            <article className="visit-machine-record-card" key={item.id}>
              <strong>{item.name}</strong>
              <p>{item.integrationPending&&<small className="ws-integration-pending">Vínculo com cliente pendente de integração</small>}</p>
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
              <div className="visit-equipment-card-actions">
              <button
                type="button"
                className="visit-equipment-meter"
                disabled={!online||inactive}
                onClick={() => selectEquipment(c, item)}
              >
                <Gauge size={14} aria-hidden="true"/>
                Registrar horímetro
              </button>
              {actions}
              </div>
            </article>
          )}/>
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
