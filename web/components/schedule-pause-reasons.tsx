"use client";
import { useState } from "react";
import { Trash2, Plus } from "lucide-react";
import SaveActionIcon from "./save-action-icon";
export default function SchedulePauseReasons({
  settings,
  onChange,
  onSave,
  busy,
}: any) {
  const [dirty, setDirty] = useState(false);
  const rows = settings.pauseReasons || [];
  const change = (next: any[]) => {
    onChange({ ...settings, pauseReasons: next });
    setDirty(true);
  };
  return (
    <section>
      <p>
        Configure as causas e o limite em minutos para perguntar se o técnico
        continua em pausa. Deixe o limite vazio para não alertar.
      </p>
      <div className="manual-table-scroll">
        <table className="field-pause-settings">
          <thead>
            <tr>
              <th>Causa da pausa</th>
              <th>Limite (minutos)</th>
              <th>Ações</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r: any, i: number) => (
              <tr key={r.id}>
                <td>
                  <input
                    aria-label={`Causa ${i + 1}`}
                    maxLength={160}
                    value={r.name}
                    onChange={(e) =>
                      change(
                        rows.map((v: any) =>
                          v.id === r.id ? { ...v, name: e.target.value } : v,
                        ),
                      )
                    }
                  />
                </td>
                <td>
                  <input
                    aria-label={`Limite da pausa ${i + 1}`}
                    type="number"
                    min="1"
                    max="1440"
                    value={r.minutes ?? ""}
                    onChange={(e) =>
                      change(
                        rows.map((v: any) =>
                          v.id === r.id
                            ? {
                                ...v,
                                minutes:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              }
                            : v,
                        ),
                      )
                    }
                  />
                </td>
                <td>
                  <button
                    type="button"
                    aria-label={`Remover causa ${i + 1}`}
                    onClick={() =>
                      change(rows.filter((v: any) => v.id !== r.id))
                    }
                  >
                    <Trash2 size={16} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3}>
                <button
                  type="button"
                  onClick={() =>
                    change([
                      ...rows,
                      { id: crypto.randomUUID(), name: "", minutes: null },
                    ])
                  }
                >
                  <Plus size={16} /> Adicionar causa
                </button>
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p>{dirty ? "Alterações não salvas" : "Configurações salvas"}</p>
      <button
        type="button"
        disabled={busy || !dirty}
        title="Salvar causas de pausa"
        aria-label="Salvar causas de pausa"
        onClick={async () => {
          if (await onSave(settings)) setDirty(false);
        }}
      >
        <SaveActionIcon />
      </button>
    </section>
  );
}
