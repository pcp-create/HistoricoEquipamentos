"use client";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, X } from "lucide-react";
import EquipmentWarrantyDetails from "./equipment-warranty-details";
import "./equipment-warranty-alert.css";
export default function EquipmentWarrantyAlert({
  equipmentId,
  company,
  orderId,
  compact = false,
  hover = false,
}: {
  equipmentId: string;
  company?: string;
  orderId?: string;
  compact?: boolean;
  hover?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [preview, setPreview] = useState(false);
  const skipFocus=useRef(false);
  const trigger = useRef<HTMLButtonElement>(null),
    leaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const showPreview = () => {
    if (leaveTimer.current) clearTimeout(leaveTimer.current);
    setPreview(true);
  };
  const hidePreview = () => {
    leaveTimer.current = setTimeout(() => setPreview(false), 150);
  };
  useEffect(
    () => () => {
      if (leaveTimer.current) clearTimeout(leaveTimer.current);
    },
    [],
  );
  const [state, setState] = useState<{
    equipment: string;
    warranty: any;
    error: string;
    loading: boolean;
  }>({ equipment: "", warranty: null, error: "", loading: false });
  useEffect(() => {
    setOpen(false);
    setPreview(false);
    if (!equipmentId) {
      setState({ equipment: "", warranty: null, error: "", loading: false });
      return;
    }
    const controller = new AbortController();
    setState({
      equipment: equipmentId,
      warranty: null,
      error: "",
      loading: true,
    });
    const params = new URLSearchParams({ equipment: equipmentId });
    if (company && orderId) {
      params.set("excludeCompany", company);
      params.set("excludeOrder", orderId);
    }
    fetch("/api/equipment/warranty?" + params, {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw Error(body.error);
        return body.warranty;
      })
      .then((warranty) => {
        if (!controller.signal.aborted)
          setState({
            equipment: equipmentId,
            warranty,
            error: "",
            loading: false,
          });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setState({
            equipment: equipmentId,
            warranty: null,
            error: e.message,
            loading: false,
          });
      });
    return () => controller.abort();
  }, [equipmentId, company, orderId]);
  if (!equipmentId || state.equipment !== equipmentId) return null;
  if (hover && state.loading) return null;
  if (hover && state.error)
    return (
      <span
        className="equipment-warranty-error-icon"
        title={state.error}
        aria-label={state.error}
      >
        <AlertTriangle size={18} />
      </span>
    );
  if (state.loading)
    return (
      <small className="equipment-warranty-loading" role="status">
        Consultando garantia do equipamento…
      </small>
    );
  if (state.error)
    return (
      <small className="equipment-warranty-error" role="status">
        {state.error}
      </small>
    );
  const warranty = state.warranty;
  if (!warranty) return null;
  const details = <EquipmentWarrantyDetails warranty={warranty} />;
  if (!compact && !hover) return details;
  return (
    <>
      <button
        ref={trigger}
        type="button"
        className="equipment-warranty-trigger"
        aria-label="Ver alerta de garantia do equipamento"
        title={hover ? undefined : "Equipamento dentro do período de garantia"}
        aria-haspopup="dialog"
        aria-expanded={open || preview}
        onMouseEnter={hover ? showPreview : undefined}
        onMouseLeave={hover ? hidePreview : undefined}
        onFocus={hover ? ()=>{if(skipFocus.current){skipFocus.current=false;return;}showPreview();} : undefined}
        onBlur={hover ? hidePreview : undefined}
        onKeyDown={(e) => {
          if (e.key === "Escape") setPreview(false);
        }}
        onClick={(e) => {
          e.preventDefault();
          setPreview(false);
          setOpen(true);
        }}
      >
        <AlertTriangle size={21} aria-hidden="true" />
      </button>
      {hover && preview && !open && (
        <WarrantyPreview
          anchor={trigger}
          onEnter={showPreview}
          onLeave={hidePreview}
          onClose={() => setPreview(false)}
        >
          {details}
        </WarrantyPreview>
      )}
      {open && (
        <WarrantyPopup onClose={() => {skipFocus.current=true;setPreview(false);setOpen(false);}}>{details}</WarrantyPopup>
      )}
    </>
  );
}
function WarrantyPopup({
  children,
  onClose,
}: {
  children: React.ReactNode;
  onClose: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    element.showModal();
    return () => element.close();
  }, []);
  const close = () => {
    onClose();
    dialog.current?.close();
  };
  return createPortal(
    <dialog
      ref={dialog}
      className="equipment-warranty-popup"
      aria-label="Detalhes da garantia do equipamento"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <button
        type="button"
        className="equipment-warranty-close"
        aria-label="Fechar alerta de garantia"
        onClick={close}
      >
        <X size={20} aria-hidden="true" />
      </button>
      {children}
    </dialog>,
    document.body,
  );
}

function WarrantyPreview({
  anchor,
  children,
  onEnter,
  onLeave,
  onClose,
}: {
  anchor: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
  onEnter: () => void;
  onLeave: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null),
    [position, setPosition] = useState({ left: 8, top: 8 });
  useLayoutEffect(() => {
    const rect = anchor.current?.getBoundingClientRect(),
      card = ref.current;
    if (!rect || !card) return;
    const width = card.offsetWidth,
      height = card.offsetHeight;
    setPosition({
      left: Math.max(8, Math.min(rect.left, window.innerWidth - width - 8)),
      top:
        rect.bottom + height + 8 < window.innerHeight
          ? rect.bottom + 6
          : Math.max(8, rect.top - height - 6),
    });
  }, [anchor]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const move = (e: Event) => {
      if (!(e.target instanceof Node)||!ref.current?.contains(e.target)) onClose();
    };
    document.addEventListener("keydown", key);
    window.addEventListener("resize", onClose);
    window.addEventListener("scroll", move, true);
    return () => {
      document.removeEventListener("keydown", key);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("scroll", move, true);
    };
  }, [onClose]);
  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-label="Detalhes da garantia do equipamento"
      className="equipment-warranty-preview"
      style={position}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onFocusCapture={onEnter}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) onLeave();
      }}
    >
      <button
        type="button"
        className="equipment-warranty-close"
        aria-label="Fechar alerta de garantia"
        onClick={onClose}
      >
        <X size={18} />
      </button>
      {children}
    </div>,
    document.body,
  );
}
