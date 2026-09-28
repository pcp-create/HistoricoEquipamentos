"use client";
import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { apiFetch } from "@/lib/client-api-cache";
export default function TaskStageSelect({
  task,
  onChange,
  disabled,
}: {
  task: any;
  onChange: (id: string | null) => void;
  disabled: boolean;
}) {
  const [stages, setStages] = useState<any[]>([]),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true);
  async function load() {
    setLoading(true);
    setError("");
    try {
      const r = await apiFetch("/api/task-stages");
      const b = await r.json();
      if (!r.ok) throw Error(b.error || "Não foi possível carregar as etapas.");
      setStages(b.stages);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  const groups = new Map<string, { name: string; stages: any[] }>();
  for (const stage of [...stages].sort(
    (a, b) =>
      a.job_title.localeCompare(b.job_title, "pt-BR") ||
      a.sort_order - b.sort_order,
  )) {
    const key = stage.job_title.trim().toLowerCase();
    if (!groups.has(key))
      groups.set(key, { name: stage.job_title, stages: [] });
    groups.get(key)!.stages.push(stage);
  }
  const selected = stages.find((s) => s.id === task.stage_id),
    same = selected
      ? groups.get(selected.job_title.trim().toLowerCase())!.stages
      : [],
    index = same.findIndex((s) => s.id === task.stage_id),
    next = index >= 0 ? same[index + 1] : null;
  return (
    <div className="task-stage-field">
      <label>
        Etapa
        <div className="task-stage-picker">
          <select
            aria-label="Etapa da tarefa"
            value={task.stage_id || ""}
            disabled={disabled || loading || !!error}
            onChange={(e) => onChange(e.target.value || null)}
          >
            <option value="">
              {loading ? "Carregando etapas…" : "Sem etapa"}
            </option>
            {task.stage_id && !selected && (
              <option value={task.stage_id}>Etapa atual</option>
            )}
            {[...groups.entries()].map(([key, g]) => (
              <optgroup key={key} label={g.name}>
                {g.stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.sort_order}. {s.name}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <button
            type="button"
            aria-label="Avançar para a próxima etapa"
            title={
              next
                ? `Avançar para ${next.name}`
                : selected
                  ? "Última etapa deste cargo"
                  : "Selecione uma etapa"
            }
            disabled={disabled || loading || !!error || !next}
            onClick={() => next && onChange(next.id)}
          >
            <ArrowRight size={18} />
          </button>
        </div>
      </label>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" disabled={disabled} onClick={() => void load()}>
            Tentar novamente
          </button>
        </p>
      ) : !loading && !stages.length ? (
        <small>Nenhuma etapa cadastrada nas configurações de tarefas.</small>
      ) : (
        <small>
          {selected
            ? `Cargo: ${selected.job_title}${!next ? " · Última etapa" : ""}`
            : "Selecione uma etapa entre os cargos configurados."}
        </small>
      )}
    </div>
  );
}
