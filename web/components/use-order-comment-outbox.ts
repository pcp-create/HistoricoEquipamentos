"use client";
import { useEffect, useRef, useState } from "react";
type Job = {
  company: string;
  order: string;
  number: string;
  comment: string;
  requestId: string;
  ownerId: string;
};
const scope = () =>
  document.querySelector<HTMLMetaElement>('meta[name="app-cache-scope"]')
    ?.content || "";
const prefix = () => `order-comment-outbox-v1:${scope()}:`;
const queuedKeys = () => {
  try {
    return Object.keys(localStorage).filter((key) => key.startsWith(prefix()));
  } catch {
    return [];
  }
};
export function useOrderCommentOutbox() {
  const [pending, setPending] = useState(0),
    [error, setError] = useState(""),
    [counts, setCounts] = useState<Record<string, number>>({});
  const run = useRef<() => Promise<void>>(async () => {});
  useEffect(() => {
    let disposed = false,
      running = false;
    const controller = new AbortController();
    const drain = async () => {
      if (running || !scope()) return;
      running = true;
      setError("");
      const attempted = new Set<string>();
      try {
        const keys = queuedKeys();
        setPending(keys.length);
        for (const key of keys) {
          attempted.add(key);
          let job: Job | null = null;
          try {
            job = JSON.parse(localStorage.getItem(key) || "null");
            if (!job || job.ownerId !== scope().split(":")[0]) continue;
            const response = await fetch("/api/service-orders/comments", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(job),
              signal: AbortSignal.any([
                controller.signal,
                AbortSignal.timeout(45000),
              ]),
            });
            const data = await response.json();
            if (!response.ok || !data.id)
              throw Error(
                data.error || "Não foi possível confirmar o comentário.",
              );
            localStorage.removeItem(key);
            const countKey=`${job.company}:${job.order}`;
            if (!disposed) {
              setPending((n) => Math.max(0, n - 1));
              if (Number.isInteger(data.total))
                setCounts((old) => ({
                  ...old,
                  [countKey]: data.total,
                }));
            }
          } catch (e) {
            if (!disposed)
              setError(
                `OS ${job?.number || ""}: ${(e as Error).message}. O comentário está salvo neste navegador. Tente enviar novamente.`,
              );
          }
          if (disposed) break;
        }
      } finally {
        running = false;
        if (!disposed && queuedKeys().some((key) => !attempted.has(key)))
          void drain();
      }
    };
    run.current = drain;
    void drain();
    const retry = () => void drain();
    window.addEventListener("online", retry);
    return () => {
      disposed = true;
      controller.abort();
      window.removeEventListener("online", retry);
    };
  }, []);
  function enqueue(job: Omit<Job, "ownerId">) {
    if (!scope())
      throw Error("Atualize a página e confirme sua sessão antes de salvar.");
    try {
      localStorage.setItem(
        prefix() + job.requestId,
        JSON.stringify({ ...job, ownerId: scope().split(":")[0] }),
      );
    } catch {
      throw Error(
        "Não foi possível salvar o comentário neste navegador. Libere espaço e tente novamente.",
      );
    }
    setPending((n) => n + 1);
    void run.current();
  }
  return {
    enqueue,
    pending,
    error,
    counts,
    setCount: (key: string, total: number) =>
      setCounts((old) => ({ ...old, [key]: total })),
    retry: () => void run.current(),
  };
}
