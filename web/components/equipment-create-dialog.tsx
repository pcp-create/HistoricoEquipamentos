"use client";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import RegisterEquipment from "./workshop-register-equipment";
import "./workshop.css";
export default function EquipmentCreateDialog({
  customer,
  source,
  onCreated,
  onClose,
  onDraft,
}: {
  customer?: { id: string; name: string };
  source: "visits" | "service-order";
  onCreated: (equipment: any) => void;
  onClose: () => void;
  onDraft?: (input: any) => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return createPortal(
    <dialog
      ref={ref}
      className="ws-modal equipment-create-dialog"
      aria-label="Cadastrar equipamento"
      onCancel={(e) => {
        if (busy) e.preventDefault();
        else onClose();
      }}
    >
      <header>
        <h2>Cadastrar equipamento</h2>
        <button
          type="button"
          aria-label="Fechar cadastro de equipamento"
          disabled={busy}
          onClick={onClose}
        >
          <X size={20} />
        </button>
      </header>
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
    </dialog>,
    document.body,
  );
}
