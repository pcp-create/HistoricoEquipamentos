"use client";
import { useEffect, useState } from "react";
import { apiFetch, clearApiCache } from "@/lib/client-api-cache";
export default function OrderLinkCaption({ company, id }: { company: number | string; id: string }) {
  const [number, setNumber] = useState<string | null>(null);
  useEffect(() => {
    let controller: AbortController | undefined;
    let active = true;
    setNumber(null);
    async function load() {
      controller?.abort();
      controller = new AbortController();
      try {
        const response = await apiFetch(`/api/orders/${company}/${id}/link`, { signal: controller.signal });
        if (!response.ok) return;
        const { link } = await response.json();
        if (active) setNumber(link?.linked_order_id ? String(link.numero_sequencia || link.linked_order_id) : null);
      } catch { /* The order remains usable when the caption cannot be loaded. */ }
    }
    const refresh = () => { clearApiCache(); void load(); };
    void load();
    window.addEventListener("order-link-updated", refresh);
    return () => { active = false; controller?.abort(); window.removeEventListener("order-link-updated", refresh); };
  }, [company, id]);
  return number ? <small className="order-link-caption">Vinculado à OS {number}</small> : null;
}
