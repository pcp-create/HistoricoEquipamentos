"use client";
import { useEffect, useState } from "react";
import { Plus, Search, ArrowLeft, ListFilter } from "lucide-react";
import SiteHeader from "./site-header";
import EquipmentOccurrenceList from "./equipment-occurrence-list";
async function removeOccurrence(item: any) {
  const response = await fetch(
    "/api/equipment-occurrences?id=" + encodeURIComponent(item.id),
    { method: "DELETE" },
  );
  const body = await response.json();
  if (!response.ok)
    throw Error(body.error || "Não foi possível excluir o B.O.");
}
export function EquipmentOccurrenceHistory({
  equipmentId,
}: {
  equipmentId: string;
}) {
  const [items, setItems] = useState<any[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [canDelete, setCanDelete] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setItems([]);
    setError("");
    fetch(
      "/api/equipment-occurrences?equipment=" + encodeURIComponent(equipmentId),
      { cache: "no-store" },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (active) {
          setItems(d.items);
          setCanDelete(d.canDelete === true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [equipmentId]);
  return (
    <section className="manual-card bo-history">
      <h2>B.O · Histórico de ocorrências</h2>
      {error && <p role="alert">{error}</p>}
      {loading ? (
        <p>Consultando ocorrências…</p>
      ) : (
        <>
          {!items.length && !error && <p>Nenhuma ocorrência registrada.</p>}
          <EquipmentOccurrenceList
            items={items}
            onDelete={
              canDelete
                ? async (b) => {
                    await removeOccurrence(b);
                    setItems((v) => v.filter((item) => item.id !== b.id));
                  }
                : undefined
            }
          />
          <a href={"/bo?equipment=" + encodeURIComponent(equipmentId)}>
            Registrar ou consultar B.O
          </a>
        </>
      )}
    </section>
  );
}
export default function EquipmentOccurrences() {
  const [canDelete, setCanDelete] = useState(false);
  const [query, setQuery] = useState(""),
    [matches, setMatches] = useState<any[]>([]),
    [equipment, setEquipment] = useState<any>(null),
    [items, setItems] = useState<any[]>([]),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false),
    [searching, setSearching] = useState(false),
    [loading, setLoading] = useState(true),
    [form, setForm] = useState(false),
    [revision, setRevision] = useState(0);
  useEffect(() => {
    let active = true;
    const abort = new AbortController();
    setSearching(query.trim().length >= 2);
    const timer = setTimeout(() => {
      if (query.trim().length < 2) {
        setMatches([]);
        return;
      }
      fetch("/api/equipment-occurrences?q=" + encodeURIComponent(query), {
        signal: abort.signal,
        cache: "no-store",
      })
        .then(async (r) => {
          const d = await r.json();
          if (!r.ok) throw Error(d.error);
          if (active) setMatches(d.equipment || []);
        })
        .catch((e) => {
          if (active && e.name !== "AbortError") setError(e.message);
        })
        .finally(() => {
          if (active) setSearching(false);
        });
    }, 250);
    return () => {
      active = false;
      abort.abort();
      clearTimeout(timer);
    };
  }, [query]);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setItems([]);
    fetch(
      "/api/equipment-occurrences" +
        (equipment ? "?equipment=" + encodeURIComponent(equipment.id) : ""),
      { cache: "no-store" },
    )
      .then(async (r) => {
        const d = await r.json();
        if (!r.ok) throw Error(d.error);
        if (active) {
          setItems(d.items || []);
          setCanDelete(d.canDelete === true);
        }
      })
      .catch((e) => {
        if (active) setError(e.message);
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [equipment, revision]);
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get("equipment");
    if (id)
      fetch("/api/equipment-occurrences?lookup=" + encodeURIComponent(id), {
        cache: "no-store",
      })
        .then((r) => r.json())
        .then((d) => {
          if (d.equipment?.[0]) setEquipment(d.equipment[0]);
        })
        .catch(() => setError("Não foi possível consultar o equipamento."));
  }, []);
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!equipment || busy) return;
    const values = new FormData(event.currentTarget);
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const r = await fetch("/api/equipment-occurrences", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          equipmentId: equipment.id,
          title: values.get("title"),
          description: values.get("description"),
          occurredOn: values.get("occurredOn"),
        }),
      });
      const d = await r.json();
      if (!r.ok) throw Error(d.error);
      setForm(false);
      setRevision((v) => v + 1);
      setMessage("B.O registrado no histórico do equipamento.");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível salvar.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <SiteHeader active="occurrences" />
      <main className="module-home-main bo-page">
        <a href="/modulos/operacoes">
          <ArrowLeft size={16} /> Operações
        </a>
        <header>
          <div>
            <span className="module-eyebrow">EQUIPAMENTOS · HISTÓRICO</span>
            <h1>B.O</h1>
            <p>
              Registre particularidades e ocorrências para orientar os próximos
              atendimentos.
            </p>
          </div>
          <button
            disabled={!equipment || busy}
            onClick={() => {
              setForm(true);
              setMessage("");
            }}
          >
            <Plus size={18} /> Registrar B.O
          </button>
        </header>
        <section className="manual-card">
          <label htmlFor="bo-search">Equipamento</label>
          <div className="bo-search">
            <Search size={18} />
            <input
              id="bo-search"
              placeholder="Pesquise por nome, código ou número de série"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setError("");
              }}
            />
          </div>
          {searching && <p>Pesquisando…</p>}
          {!searching && query.trim().length >= 2 && !matches.length && (
            <p>Nenhum equipamento encontrado.</p>
          )}
          {matches.length > 0 && (
            <div className="bo-matches">
              {matches.map((e) => (
                <button
                  key={e.id}
                  onClick={() => {
                    setEquipment(e);
                    setQuery("");
                    setMatches([]);
                    setForm(false);
                    setError("");
                    setMessage("");
                  }}
                >
                  <strong>{e.name}</strong>
                  <small>
                    Código {e.id} · Série {e.serial || "não informada"}
                  </small>
                </button>
              ))}
            </div>
          )}
          {equipment && (
            <div className="bo-selected-equipment">
              <div className="bo-selected-equipment-info">
                <strong>{equipment.name}</strong>
                <small>Série: {equipment.serial || "não informada"}</small>
              </div>
              <button
                className="bo-show-all"
                type="button"
                disabled={busy}
                onClick={() => {
                  setEquipment(null);
                  setForm(false);
                }}
              >
                <ListFilter size={17} aria-hidden="true" />
                Ver todas as ocorrências
              </button>
            </div>
          )}
        </section>
        {error && <p role="alert">{error}</p>}
        {message && <p role="status">{message}</p>}
        {form && equipment && (
          <form className="manual-card bo-form" onSubmit={save}>
            <h2>Nova ocorrência</h2>
            <label>
              Data da ocorrência
              <input
                name="occurredOn"
                type="date"
                required
                defaultValue={new Intl.DateTimeFormat("en-CA", {
                  timeZone: "America/Sao_Paulo",
                }).format(new Date())}
              />
            </label>
            <label>
              Título
              <input name="title" required maxLength={160} />
            </label>
            <label>
              Descrição completa
              <textarea
                name="description"
                required
                maxLength={12000}
                rows={7}
                placeholder="Descreva a particularidade do equipamento e as orientações para o atendimento."
              />
            </label>
            <div className="bo-actions">
              <button type="submit" disabled={busy}>
                {busy ? "Registrando…" : "Salvar ocorrência"}
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setForm(false)}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}
        <section className="manual-card">
          <h2>
            {equipment ? "Ocorrências do equipamento" : "Ocorrências recentes"}
          </h2>
          {loading ? (
            <p>Consultando ocorrências…</p>
          ) : (
            <>
              {!items.length && <p>Nenhuma ocorrência registrada.</p>}
              <EquipmentOccurrenceList
                items={items}
                onDelete={
                  canDelete
                    ? async (b) => {
                        await removeOccurrence(b);
                        setItems((v) => v.filter((item) => item.id !== b.id));
                        setMessage("B.O excluído.");
                      }
                    : undefined
                }
              />
              {!equipment && items.length === 100 && (
                <p>
                  Exibindo as 100 ocorrências mais recentes. Selecione um
                  equipamento para consultar todo o histórico.
                </p>
              )}
            </>
          )}
        </section>
      </main>
    </>
  );
}
