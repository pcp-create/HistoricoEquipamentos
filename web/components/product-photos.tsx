"use client";
import { apiFetch } from "@/lib/client-api-cache";
import { companyName } from "@/lib/company-names";
import { useEffect, useRef, useState } from "react";
import { Camera, X, ChevronLeft, ChevronRight } from "lucide-react";
type Gallery = {
  images: { key: string; url: string }[];
  unsupported: number;
  collectedAt: string;
};
export default function ProductPhotos({
  company,
  id,
  name,
}: {
  company: unknown;
  id: unknown;
  name: unknown;
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false),
    [data, setData] = useState<Gallery | null>(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false),
    [index, setIndex] = useState(0),
    [retry, setRetry] = useState(0),
    [broken, setBroken] = useState(false);
  const valid =
    ["1", "2", "27404"].includes(String(company)) &&
    /^[1-9]\d{0,9}$/.test(String(id)) &&
    Number(id) <= 2147483647;
  useEffect(() => {
    if (!open || !valid) return;
    dialog.current?.showModal();
    const controller = new AbortController();
    setLoading(true);
    setError("");
    setData(null);
    setIndex(0);
    setBroken(false);
    apiFetch(`/api/products/${company}/${id}/images`, {
      signal: controller.signal,
    })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok)
          throw new Error(body.error || "Não foi possível carregar as fotos.");
        setData(body);
      })
      .catch((e) => {
        if (e.name !== "AbortError") setError(e.message);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [open, valid, company, id, retry]);
  if (!valid) return null;
  const title = String(name || `Produto ${id}`);
  function close() {
    dialog.current?.close();
    setOpen(false);
    button.current?.focus();
  }
  return (
    <>
      <button
        ref={button}
        type="button"
        className="photo-button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Camera size={15} />
        Ver fotos
      </button>
      {open && (
        <dialog
          ref={dialog}
          className="photo-dialog"
          aria-label={`Fotos de ${title}`}
          onCancel={(e) => {
            e.preventDefault();
            e.stopPropagation();
            close();
          }}
          onClick={(e) => e.stopPropagation()}
          onClose={() => setOpen(false)}
        >
          <header>
            <div>
              <h2>{title}</h2>
              <p>
                Fotos do produto no M8 · {companyName(company)} · Código{" "}
                {String(id)}
              </p>
            </div>
            <button type="button" aria-label="Fechar fotos" onClick={close}>
              <X size={22} />
            </button>
          </header>
          <div className="photo-body">
            {loading ? (
              <p role="status">Carregando fotos…</p>
            ) : error ? (
              <div role="alert">
                <p>{error}</p>
                <button type="button" onClick={() => setRetry((n) => n + 1)}>
                  Tentar novamente
                </button>
              </div>
            ) : (
              data && (
                <>
                  {!data.images.length ? (
                    <p>
                      {data.unsupported
                        ? "As imagens cadastradas têm formato ou tamanho não suportado."
                        : "Produto sem foto cadastrada."}
                    </p>
                  ) : (
                    <>
                      <div className="photo-stage">
                        {broken ? (
                          <p role="alert">
                            Não foi possível exibir esta foto. Reabra a galeria
                            para atualizar.
                          </p>
                        ) : (
                          /* The authenticated route serves validated raster bytes; avoid the shared Next image optimizer cache. */
                          <img
                            key={data.images[index].key}
                            src={data.images[index].url}
                            alt={`${title} — foto ${index + 1}`}
                            onError={() => setBroken(true)}
                          />
                        )}
                      </div>
                      <div className="photo-navigation">
                        <button
                          type="button"
                          aria-label="Foto anterior"
                          disabled={index === 0}
                          onClick={() => {
                            setIndex((n) => n - 1);
                            setBroken(false);
                          }}
                        >
                          <ChevronLeft size={20} />
                        </button>
                        <span>
                          Foto {index + 1} de {data.images.length}
                        </span>
                        <button
                          type="button"
                          aria-label="Próxima foto"
                          disabled={index === data.images.length - 1}
                          onClick={() => {
                            setIndex((n) => n + 1);
                            setBroken(false);
                          }}
                        >
                          <ChevronRight size={20} />
                        </button>
                      </div>
                    </>
                  )}
                  {data.unsupported > 0 && (
                    <p className="muted">
                      {data.unsupported} imagem(ns) não exibida(s). São aceitos
                      JPEG, PNG, GIF e WebP de até 3 MB por foto.
                    </p>
                  )}
                  <small className="muted">
                    Consulta:{" "}
                    {new Date(data.collectedAt).toLocaleString("pt-BR", {
                      timeZone: "America/Sao_Paulo",
                    })}{" "}
                    · As fotos podem levar até 10 minutos para refletir
                    alterações no M8.
                  </small>
                </>
              )
            )}
          </div>
        </dialog>
      )}
    </>
  );
}
