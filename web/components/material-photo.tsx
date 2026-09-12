"use client";
import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
type Photo = { company: number; images: { key: string; url: string }[] };
export default function MaterialPhoto({
  id,
  name,
  companies,
}: {
  id: string;
  name: string;
  companies: number[];
}) {
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [index, setIndex] = useState(0);
  const [broken, setBroken] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const companyKey = companies.join(",");
  useEffect(() => {
    const controller = new AbortController();
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
    <div className="material-photo">
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
          {/* Images use the existing authenticated endpoint, without a shared optimizer cache. */}
          <div className="material-carousel-window">
            <div
              className="material-carousel-track"
              style={{ transform: `translateX(-${index * 50}%)` }}
            >
              {photo.images.map((image, i) => (
                <div
                  className="material-carousel-slide"
                  key={image.key}
                  aria-hidden={i < index || i > index + 1}
                >
                  {broken.includes(image.key) ? (
                    <small>Não foi possível exibir esta foto.</small>
                  ) : (
                    <img
                      src={image.url}
                      alt={`${name} — foto ${i + 1}`}
                      onError={() =>
                        setBroken((previous) => [...previous, image.key])
                      }
                    />
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
                disabled={index >= Math.max(0, photo.images.length - 2)}
                onClick={() => {
                  setIndex((i) => i + 1);
                  setBroken([]);
                }}
              >
                <ChevronRight size={18} />
              </button>
              <span className="material-photo-count" aria-live="polite">
                {index + 1}–{Math.min(index + 2, photo.images.length)} /{" "}
                {photo.images.length}
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
