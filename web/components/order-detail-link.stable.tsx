"use client";
import {
  lazy,
  Suspense,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/lib/client-api-cache";
import { companyName } from "@/lib/company-names";
const OrderDetails = lazy(() =>
  import("./dashboard").then((m) => ({ default: m.OrderDetails })),
);
type Selection = {
  company_id: number;
  id: string;
  number: string;
  customer?: string;
};
export default function OrderDetailLink({
  id,
  company,
  number,
  equipment,
  children,
}: {
  id: string;
  company?: number | string;
  number?: string;
  equipment?: string;
  children?: ReactNode;
}) {
  const [selection, setSelection] = useState<Selection | null>(null),
    [choosing, setChoosing] = useState(false),
    [orders, setOrders] = useState<Selection[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const requestVersion = useRef(0);
  const dismiss = () => {
    requestVersion.current++;
    setChoosing(false);
  };
  useEffect(
    () => () => {
      requestVersion.current++;
    },
    [],
  );
  useEffect(() => {
    if (choosing) dialog.current?.showModal();
  }, [choosing]);
  async function open() {
    if (company) {
      setSelection({
        id: String(id),
        company_id: Number(company),
        number: number || id,
      });
      return;
    }
    const version = ++requestVersion.current;
    setChoosing(true);
    setLoading(true);
    setError("");
    setOrders([]);
    try {
      const q = new URLSearchParams({
        number: number || id,
        ...(equipment ? { equipment } : {}),
      });
      const r = await apiFetch("/api/orders/resolve?" + q);
      const b = await r.json();
      if (version !== requestVersion.current) return;
      if (!r.ok) throw Error(b.error);
      if (b.orders.length === 1) {
        setChoosing(false);
        setSelection(b.orders[0]);
      } else {
        setOrders(b.orders);
        if (!b.orders.length) setError("OS não encontrada para este vínculo.");
      }
    } catch (e) {
      if (version === requestVersion.current) setError((e as Error).message);
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }
  return (
    <>
      <a
        className="quote-order-link"
        href={
          "/historico?" +
          new URLSearchParams({
            view: "orders",
            orderNumber: number || id,
            ...(company ? { company: String(company) } : {}),
          })
        }
        title="Abrir detalhes da OS"
        onClick={(e) => {
          if (e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
          e.preventDefault();
          e.stopPropagation();
          void open();
        }}
      >
        {children || `OS ${number || id}`}
      </a>
      {choosing && (
        <dialog
          ref={dialog}
          className="linked-task-dialog"
          onCancel={dismiss}
          aria-label="Localizar OS"
        >
          <header>
            <h2>Detalhes da OS</h2>
            <button type="button" onClick={dismiss}>
              Fechar
            </button>
          </header>
          {loading ? (
            <p>Localizando OS…</p>
          ) : error ? (
            <p role="alert">{error}</p>
          ) : (
            <>
              <p>Selecione a OS e a empresa:</p>
              {orders.map((o) => (
                <p key={o.company_id + ":" + o.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setChoosing(false);
                      setSelection(o);
                    }}
                  >
                    OS {o.number} · {companyName(o.company_id)} ·{" "}
                    {o.customer || "Cliente não informado"}
                  </button>
                </p>
              ))}
            </>
          )}
        </dialog>
      )}
      {selection && (
        <Suspense fallback={<span role="status"> Abrindo detalhes…</span>}>
          <OrderDetails
            selection={selection}
            onClose={() => setSelection(null)}
          />
        </Suspense>
      )}
    </>
  );
}
