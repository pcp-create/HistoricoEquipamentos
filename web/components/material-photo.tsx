"use client";
import useModalScrollLock from "./use-modal-scroll-lock";
import M8PhotoUpload from "./m8-photo-upload";
import ActionNotice from "./action-notice";
import { apiFetch } from "@/lib/client-api-cache";
import { useEffect, useRef, useState } from "react";
import {m8ProductPhotoUrl} from "@/lib/m8-product-photo-url";
import { ChevronLeft, ChevronRight, X, Plus, RotateCw } from "lucide-react";
type Photo = { company: number; images: { key: string; url: string }[] };
export default function MaterialPhoto({
  id,
  name,
  companies,
  compact = false,
  allowAddPhotos = false,
}: {
  id: string;
  name: string;
  companies: number[];
  compact?: boolean;
  allowAddPhotos?: boolean;
}) {
  const [expandedOpen,setExpandedOpen]=useState(false);
  useModalScrollLock(expandedOpen);
  const [rotations,setRotations]=useState<Record<string,number>>({});
  const touch=useRef<{x:number;y:number}|null>(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [index, setIndex] = useState(0);
  const [expandedIndex, setExpandedIndex] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const [broken, setBroken] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const uploadUrl = allowAddPhotos ? m8ProductPhotoUrl(id) : null;
  const itemCount = (photo?.images.length || 0) + (uploadUrl ? 1 : 0);
  const addPhoto = (tabIndex = 0) => uploadUrl && <button type="button" className="material-photo-add" tabIndex={tabIndex} aria-label={`Adicionar fotos de ${name} no M8`} title="Adicionar fotos no M8" onClick={e=>{e.stopPropagation();dialog.current?.close();setUploadOpen(true);}}><Plus size={30} aria-hidden="true"/><span>Adicionar fotos</span></button>;

  const swipe=(expanded:boolean)=>({
    onTouchStart:(e:React.TouchEvent)=>{touch.current=e.touches.length===1?{x:e.touches[0].clientX,y:e.touches[0].clientY}:null;},
    onTouchEnd:(e:React.TouchEvent)=>{const start=touch.current;touch.current=null;if(!start||e.changedTouches.length!==1)return;const dx=e.changedTouches[0].clientX-start.x,dy=e.changedTouches[0].clientY-start.y;if(Math.abs(dx)<45||Math.abs(dx)<Math.abs(dy)*1.5)return;const step=dx<0?1:-1;if(expanded)setExpandedIndex(i=>Math.max(0,Math.min(itemCount-1,i+step)));else setIndex(i=>Math.max(0,Math.min(Math.max(0,itemCount-visibleCount),i+step)));},
    onTouchCancel:()=>{touch.current=null;}
  });
  const visibleCount = compact ? 1 : 2;
  const companyKey = companies.join(",");
  useEffect(() => {
    const controller = new AbortController();
    dialog.current?.close();
    setExpandedOpen(false);
    setLoading(true);
    setError("");
    setPhoto(null);
    setIndex(0);
    setBroken([]);
    async function load() {
      let failed = false;
      for (const company of companyKey.split(",").filter(Boolean).map(Number)) {
        try {
          const response = await apiFetch(
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
      {uploadOpen && uploadUrl && <M8PhotoUpload key={id} id={id} name={name} url={uploadUrl} onClose={()=>setUploadOpen(false)} onPhotos={images=>{setPhoto({company:1,images});setIndex(0);setExpandedIndex(0);setBroken([]);}}/>}
      {loading ? (
        <small role="status">Carregando foto…</small>
      ) : error ? (
        <>
          <ActionNotice type="error" autoCloseMs={3000}>{error}</ActionNotice>
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
            onClose={()=>setExpandedOpen(false)}
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
                  Math.min(itemCount - 1, i + 1),
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
            <div className="material-photo-stage" {...swipe(true)}>
            {expandedIndex === photo.images.length && uploadUrl ? <div className="material-photo-add-stage">{addPhoto()}</div> : <img
              style={{transform:`rotate(${rotations[photo.images[expandedIndex]?.key]||0}deg)`}}
              draggable={false}
              src={photo.images[expandedIndex]?.url}
              alt={`${name} — foto ampliada ${expandedIndex + 1}`}
            />}
            </div>
            <footer>
              {expandedIndex < photo.images.length && <button type="button" className="photo-button material-photo-rotate" aria-label="Girar foto 90 graus" title="Girar na visualização; não altera o arquivo no M8" onClick={()=>{const key=photo.images[expandedIndex].key;setRotations(previous=>({...previous,[key]:((previous[key]||0)+90)%360}));}}><RotateCw size={20}/><span>Girar</span></button>}
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
                {expandedIndex === photo.images.length ? "Adicionar fotos" : `${expandedIndex + 1} / ${photo.images.length}`}
              </span>
              <button
                type="button"
                className="photo-button"
                aria-label="Próxima foto ampliada"
                disabled={expandedIndex === itemCount - 1}
                onClick={() => setExpandedIndex((i) => i + 1)}
              >
                <ChevronRight />
              </button>
            </footer>
          </dialog>
          {/* Images use the existing authenticated endpoint, without a shared optimizer cache. */}
          <div className="material-carousel-window" {...swipe(false)}>
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
                        setExpandedOpen(true);
                        dialog.current?.showModal();
                      }}
                    >
                      <img
                        style={{transform:`rotate(${rotations[image.key]||0}deg)`}}
                        draggable={false}
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
              {uploadUrl && <div className="material-carousel-slide" aria-hidden={photo.images.length < index || photo.images.length >= index + visibleCount}>{addPhoto(photo.images.length < index || photo.images.length >= index + visibleCount ? -1 : 0)}</div>}
            </div>
          </div>
          {itemCount > 1 && (
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
                  index >= Math.max(0, itemCount - visibleCount)
                }
                onClick={() => {
                  setIndex((i) => i + 1);
                  setBroken([]);
                }}
              >
                <ChevronRight size={18} />
              </button>
              <span className="material-photo-count" aria-live="polite">
                {index === photo.images.length ? "Adicionar" : `${index + 1}${!compact ? `–${Math.min(index + visibleCount, photo.images.length)}` : ""} / ${photo.images.length}`}
              </span>
            </>
          )}
        </>
      ) : (
        uploadUrl ? addPhoto() : <small>Produto sem foto cadastrada.</small>
      )}
    </div>
  );
}
