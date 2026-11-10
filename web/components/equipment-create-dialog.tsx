"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import OrderSearchSelect, { type OrderChoice } from "./order-search-select";
import { clearApiCache } from "@/lib/client-api-cache";
import { Link2, Plus, X } from "lucide-react";
import RegisterEquipment from "./workshop-register-equipment";
import "./workshop.css";
export default function EquipmentCreateDialog({
  customer,
  source,
  onCreated,
  onClose,
  onDraft,
  equipmentOptions,
}: {
  customer?: { id: string; name: string };
  source: "visits" | "service-order" | "workshop";
  equipmentOptions?: OrderChoice[];
  onCreated: (equipment: any) => void;
  onClose: () => void;
  onDraft?: (input: any) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false);
  const [mode, setMode] = useState("create"),
    [selectedEquipment, setSelectedEquipment] = useState<OrderChoice | null>(
      null,
    ),
    [selectedCustomer, setSelectedCustomer] = useState(
      customer || { id: "", name: "" },
    ),
    [error, setError] = useState("");
  const title = equipmentOptions
    ? "Cadastrar / incluir equipamento ao cliente"
    : "Cadastrar equipamento";
  async function linkExisting() {
    if (busy || !selectedEquipment || !selectedCustomer.id) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/workshop/equipment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "link-existing",
          equipmentId: selectedEquipment.id,
          customerKey: selectedCustomer.id,
          source,
        }),
      });
      const result = await response.json();
      if (!response.ok)
        throw Error(result.error || "Não foi possível incluir o equipamento.");
      clearApiCache();
      window.dispatchEvent(new Event("equipment-created"));
      if (result.equipment?.integrationPending) {
        const detail = String(result.equipment.integrationError || "");
        throw Error(
          "O vínculo foi salvo como pendência no sistema, mas não foi confirmado no M8. " +
          (detail.includes("falhahttp_URL_")
            ? "O M8 apresentou uma falha interna ao cadastrar o vínculo. Encaminhe o erro ao suporte M8."
            : detail || "Aguarde a confirmação da integração antes de considerar o equipamento vinculado."),
        );
      }
      onCreated({ ...result.equipment, customerKey: selectedCustomer.id });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="ws-modal equipment-create-dialog"
      aria-label={title}
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2>{title}</h2>
        <button
          type="button"
          aria-label="Fechar cadastro de equipamento"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
      {equipmentOptions && (
        <nav className="app-section-tabs" aria-label="Inclusão de equipamento">
          <button
            type="button"
            disabled={busy}
            aria-pressed={mode === "create"}
            onClick={() => {
              setMode("create");
              setError("");
            }}
          >
            <Plus size={15} />
            Cadastrar novo
          </button>
          <button
            type="button"
            disabled={busy}
            aria-pressed={mode === "existing"}
            onClick={() => {
              setMode("existing");
              setError("");
            }}
          >
            <Link2 size={15} />
            Incluir existente
          </button>
        </nav>
      )}
      {mode === "existing" ? (
        <section className="equipment-client-link-form">
          <p>
            Selecione um equipamento já cadastrado para vincular a este cliente,
            sem criar outro cadastro.
          </p>
          {customer ? (
            <label>
              Cliente
              <input readOnly value={customer.name} />
            </label>
          ) : (
            <label>
              Cliente *
              <OrderSearchSelect
                label="Cliente do equipamento"
                value={selectedCustomer.id}
                selectedLabel={selectedCustomer.name}
                endpoint="/api/visits/customers"
                disabled={busy}
                onChange={(row) =>
                  setSelectedCustomer({ id: row.id, name: row.name })
                }
              />
            </label>
          )}
          <label>
            Equipamento *
            <OrderSearchSelect
              label="Equipamento existente"
              value={selectedEquipment?.id || ""}
              selectedLabel={selectedEquipment?.name || ""}
              options={equipmentOptions}
              placeholder="Pesquise por código, modelo ou série"
              disabled={busy}
              onChange={setSelectedEquipment}
            />
          </label>
          {error && <p role="alert">{error}</p>}
          <button
            type="button"
            className="ws-primary"
            disabled={busy || !selectedCustomer.id || !selectedEquipment}
            onClick={() => void linkExisting()}
          >
            <Link2 size={16} />
            {busy ? "Incluindo…" : "Incluir equipamento ao cliente"}
          </button>
        </section>
      ) : (
        <RegisterEquipment
          key={customer?.id || "draft"}
          endpoint={source === "visits" ? "/api/visits/machines" : undefined}
          customer={customer}
          source={source}
          customerOnly
          onCreated={onCreated}
          onBusy={setBusy}
          onCancel={onClose}
          onDraft={onDraft}
        />
      )}
    </dialog>,
    document.body,
  );
}
