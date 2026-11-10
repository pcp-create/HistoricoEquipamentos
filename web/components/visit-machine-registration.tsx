"use client";
import { useEffect, useState } from "react";
import { Plus, Wrench, RefreshCw } from "lucide-react";
import type { ReactNode } from "react";
import type { DraftMachine } from "@/lib/visits/draft-machines";
import { workshopEquipmentTypes } from "@/lib/workshop/equipment-registration-model";
import VisitEquipmentGroup from "./visit-equipment-group";
import EquipmentCreateDialog from "./equipment-create-dialog";
export default function VisitMachineRegistration({
  customer,
  name,
  online,
  renderVisitRecord,
  draftMachines,
  onDraftMachines,
  knownEquipmentIds = [],
}: {
  knownEquipmentIds?: string[];
  customer: string;
  name: string;
  online: boolean;
  renderVisitRecord?: (machine: {
    id: string;
    model: string;
    equipmentId?: string;
  }) => ReactNode;
  draftMachines?: DraftMachine[];
  onDraftMachines?: (machines: DraftMachine[]) => void;
}) {
  const [open, setOpen] = useState(false),
    [machines, setMachines] = useState<any[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState("");
  const [resumeTypes,setResumeTypes]=useState<Record<string,string>>({});
  const knownType=(machine:any)=>!!machine.registration_document?.type||workshopEquipmentTypes.some(type=>type.label.toLocaleUpperCase('pt-BR')===String(machine.equipment_type).toLocaleUpperCase('pt-BR'));
  const drafting = !!onDraftMachines;
  async function load() {
    const r = await fetch(
      "/api/visits/machines?customer=" + encodeURIComponent(customer),
      { cache: "no-store" },
    );
    const b = await r.json();
    if (!r.ok) throw Error(b.error);
    setMachines(b.machines || []);
  }
  useEffect(() => {
    if (drafting || !online) return;
    let active = true;
    const refresh = () => {
      if (active && document.visibilityState === "visible")
        void load().catch((e) => {
          if (active) setError(e.message);
        });
    };
    refresh();
    const timer = setInterval(refresh, 60000);
    window.addEventListener("focus", refresh);
    window.addEventListener("equipment-created", refresh);
    return () => {
      active = false;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("equipment-created", refresh);
    };
  }, [customer, drafting, online]);
  const items = drafting
    ? (draftMachines || []).map((m) => ({
        ...m,
        id: m.requestId,
        equipment_type: m.equipmentType,
      }))
    : machines.filter(m=>!m.equipment_id||!knownEquipmentIds.includes(String(m.equipment_id)));
  return (
    <>
      {error && <p role="alert">{error}</p>}
      <VisitEquipmentGroup
        customer={customer}
        equipment={items}
        online={online && !busy}
        canInactivate={!drafting}
        inlineActions
        equipmentKey={(m) =>
          m.equipment_id ? String(m.equipment_id) : "pending:" + m.id
        }
        render={(m, inactive, actions) => (
          <article className="visit-machine-record-card" key={m.id}>
            <strong>
              {m.equipment_type} - {m.model}
            </strong>
            <small className="visit-equipment-origin is-visits">Incluído pelas Visitas</small>
            <p>Modelo: {m.model}</p>
            <p>Série: {m.serial}</p>
            {m.brand && <p>Marca: {m.brand}</p>}
            {m.meter != null && (
              <p>Horímetro: {Number(m.meter).toLocaleString("pt-BR")} h</p>
            )}
            {m.observations && <p>{m.observations}</p>}
            {drafting ? (
              <>
                <small>
                  O equipamento será cadastrado ao confirmar a visita do novo
                  Lead.
                </small>
                <button
                  className="visit-equipment-remove"
                  type="button"
                  onClick={() =>
                    onDraftMachines?.(
                      (draftMachines || []).filter(
                        (item) => item.requestId !== m.id,
                      ),
                    )
                  }
                >
                  Remover máquina {m.model}
                </button>
              </>
            ) : (
              <>
                <p>
                  {m.equipment_id
                    ? `Equipamento ${m.equipment_id} cadastrado no ERP`
                    : "Cadastro aguardando confirmação"}
                </p>
                {m.integration_pending && (
                  <small className="ws-integration-pending">
                    Vínculo com cliente pendente de integração
                  </small>
                )}
                {m.task_id && m.integration_pending && (
                  <p>
                    <a href={"/tarefas?task=" + m.task_id}>
                      Tarefa TAR-{m.task_id} · Vínculo manual
                    </a>
                  </p>
                )}
                {!m.equipment_id&&!knownType(m)&&<label>Tipo do equipamento para concluir o cadastro<select value={resumeTypes[m.id]||""} disabled={!online||!!busy} onChange={e=>setResumeTypes(current=>({...current,[m.id]:e.target.value}))}><option value="">Selecione o tipo</option>{workshopEquipmentTypes.filter(type=>!("ownOnly" in type)).map(type=><option value={type.id} key={type.id}>{type.label}</option>)}</select></label>}
                <div className="visit-equipment-card-actions">
                {!m.equipment_id && (
                  <button
                    className="visit-equipment-resume"
                    type="button"
                    disabled={!online || !!busy || (!knownType(m)&&!resumeTypes[m.id])}
                    onClick={async () => {
                      setBusy(m.id);
                      setError("");
                      try {
                        const r = await fetch("/api/visits/machines", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({
                            requestId: m.id,
                            customerKey: customer,
                            resume: true,
                            ...(resumeTypes[m.id]?{type:resumeTypes[m.id]}:{}),
                          }),
                        });
                        const body = await r.json();
                        if (!r.ok) throw Error(body.error);
                        if (body.state !== "complete")
                          throw Error(body.message);
                        await load();
                        window.dispatchEvent(new Event("equipment-created"));
                      } catch (e) {
                        setError((e as Error).message);
                      } finally {
                        setBusy("");
                      }
                    }}
                  >
                    <RefreshCw size={14} aria-hidden="true"/>{busy===m.id?'Consultando…':'Concluir cadastro'}
                  </button>
                )}
                {actions}
                </div>
              </>
            )}
            {!inactive &&
              renderVisitRecord?.({
                id: m.id,
                model: m.model,
                equipmentId: m.equipment_id
                  ? String(m.equipment_id)
                  : undefined,
              })}
          </article>
        )}
      />
      <button
        type="button"
        className="sales-machine-create"
        disabled={
          !online || !!busy || (drafting && (draftMachines?.length || 0) >= 20)
        }
        onClick={() => {
          setError("");
          setOpen(true);
        }}
      >
        <Wrench size={18} />
        <span>Cadastrar máquina</span>
        <Plus size={17} />
      </button>
      {open && (
        <EquipmentCreateDialog
          source="visits"
          customer={drafting ? undefined : { id: customer, name }}
          onClose={() => setOpen(false)}
          onCreated={() => {
            setOpen(false);
            void load().catch((e) => setError(e.message));
            window.dispatchEvent(new Event("equipment-created"));
          }}
          onDraft={
            drafting
              ? (input) => {
                  onDraftMachines?.([
                    ...(draftMachines || []),
                    {
                      requestId: crypto.randomUUID(),
                      equipmentType:
                        workshopEquipmentTypes.find(
                          (type) => type.id === input.type,
                        )?.label || input.type,
                      model: input.model,
                      serial: input.serial,
                      brand: input.brand || "",
                      meter: String(input.meter ?? 0),
                      observations: input.notes,
                      registration: input,
                    },
                  ]);
                  setOpen(false);
                }
              : undefined
          }
        />
      )}
    </>
  );
}
