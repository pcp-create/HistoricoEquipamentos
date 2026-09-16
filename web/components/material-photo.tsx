"use client";
import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
type Photo = { company: number; images: { key: string; url: string }[] };
export default function MaterialPhoto({
  id,
  name,
  companies,
  compact = false,
}: {
  id: string;
  name: string;
  companies: number[];
  compact?: boolean;
}) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [index, setIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const [broken, setBroken] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const visibleCount = compact ? 1 : 2;
  const companyKey = companies.join(",");
  useEffect(() => {
    const controller = new AbortController();
    dialog.current?.close();
    setLoading(true);
    setError("");
    setPhoto(null);
    setIndex(0);
    setBroken([]);
    async function load() {
      let failed = false;
      for (const company of companyKey.split(",").filter(Boolean).map(Number)) {
        try {
          const response = await fetch(
            `/api/products/${company}/${id}/images`,
            { signal: controller.signal },
          );
          if (controller.signal.aborted) return;
          if (response.status === 401) {
            window.location.assign("/login");
            return;
          }
          if (!response.ok) {
            failed = true;
            continue;
          }
          const body = await response.json();
          if (controller.signal.aborted) return;
          if (body.images?.length) {
            setPhoto({ company, images: body.images });
            return;
          }
          if (body.unsupported) failed = true;
        } catch {
          if (controller.signal.aborted) return;
          failed = true;
        }
      }
      if (!controller.signal.aborted && failed)
        setError("Não foi possível carregar a foto.");
    }
    load().finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [id, companyKey, retry]);
  return (
    <div className={`material-photo${compact ? " equipment-photo" : ""}`}>
      {loading ? (
        <small role="status">Carregando foto…</small>
      ) : error ? (
        <>
          <small role="alert">{error}</small>
          <button
            type="button"
            className="photo-button"
            onClick={() => setRetry((n) => n + 1)}
          >
            Tentar novamente
          </button>
        </>
      ) : photo ? (
        <>
          <dialog
            ref={dialog}
            className="material-photo-dialog"
            aria-label={`Fotos de ${name}`}
            onClick={(e) => {
              if (e.target === e.currentTarget) e.currentTarget.close();
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") {
                e.preventDefault();
                setExpandedIndex((i) => Math.max(0, i - 1));
              }
              if (e.key === "ArrowRight") {
                e.preventDefault();
                setExpandedIndex((i) =>
                  Math.min(photo.images.length - 1, i + 1),
                );
              }
            }}
          >
            <header>
              <strong>{name}</strong>
              <button
                type="button"
                className="photo-button"
                aria-label="Fechar foto ampliada"
                onClick={() => dialog.current?.close()}
              >
                <X size={22} />
              </button>
            </header>
            <img
              src={photo.images[expandedIndex]?.url}
              alt={`${name} — foto ampliada ${expandedIndex + 1}`}
            />
            <footer>
              <button
                type="button"
                className="photo-button"
                aria-label="Foto anterior ampliada"
                disabled={expandedIndex === 0}
                onClick={() => setExpandedIndex((i) => i - 1)}
              >
                <ChevronLeft />
              </button>
              <span aria-live="polite">
                {expandedIndex + 1} / {photo.images.length}
              </span>
              <button
                type="button"
                className="photo-button"
                aria-label="Próxima foto ampliada"
                disabled={expandedIndex === photo.images.length - 1}
                onClick={() => setExpandedIndex((i) => i + 1)}
              >
                <ChevronRight />
              </button>
            </footer>
          </dialog>
          {/* Images use the existing authenticated endpoint, without a shared optimizer cache. */}
          <div className="material-carousel-window">
            <div
              className="material-carousel-track"
              style={{
                transform: `translateX(-${index * (100 / visibleCount)}%)`,
              }}
            >
              {photo.images.map((image, i) => (
                <div
                  className="material-carousel-slide"
                  key={image.key}
                  aria-hidden={i < index || i >= index + visibleCount}
                >
                  {broken.includes(image.key) ? (
                    <small>Não foi possível exibir esta foto.</small>
                  ) : (
                    <button
                      type="button"
                      className="material-photo-enlarge"
                      tabIndex={i < index || i >= index + visibleCount ? -1 : 0}
                      aria-label={`Ampliar foto ${i + 1}`}
                      onClick={() => {
                        setExpandedIndex(i);
                        dialog.current?.showModal();
                      }}
                    >
                      <img
                        src={image.url}
                        alt={`${name} — foto ${i + 1}`}
                        onError={() =>
                          setBroken((previous) => [...previous, image.key])
                        }
                      />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
          {photo.images.length > 1 && (
            <>
              <button
                type="button"
                className="material-photo-prev"
                aria-label="Foto anterior"
                disabled={index === 0}
                onClick={() => {
                  setIndex((i) => i - 1);
                  setBroken([]);
                }}
              >
                <ChevronLeft size={18} />
              </button>
              <button
                type="button"
                className="material-photo-next"
                aria-label="Próxima foto"
                disabled={
                  index >= Math.max(0, photo.images.length - visibleCount)
                }
                onClick={() => {
                  setIndex((i) => i + 1);
                  setBroken([]);
                }}
              >
                <ChevronRight size={18} />
              </button>
              <span className="material-photo-count" aria-live="polite">
                {index + 1}
                {!compact &&
                  `–${Math.min(index + visibleCount, photo.images.length)}`}{" "}
                / {photo.images.length}
              </span>
            </>
          )}
        </>
      ) : (
        <small>Produto sem foto cadastrada.</small>
      )}
    </div>
  );
}
