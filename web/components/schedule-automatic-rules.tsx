"use client";
import SaveActionIcon from "./save-action-icon";
import { useState } from "react";
import { Plus, Trash2, ArrowDown, GitBranch } from "lucide-react";
import {
  automaticFields,
  validateAutomaticRules,
} from "@/lib/service-scheduling/automatic-rules";
import { apiFetch } from "@/lib/client-api-cache";
import "./schedule-automatic-rules.css";
const blank = () => ({
  field: "situacao_nome",
  operator: "eq",
  value: "",
  connector: "and",
});
export default function ScheduleAutomaticRules({
  settings,
  options,
  onChange,
  onSave,
  busy,
  canEdit,
}: {
  settings: any;
  options: any;
  onChange: (v: any) => void;
  onSave: (v: any) => Promise<boolean>;
  busy: boolean;
  canEdit: boolean;
}) {
  const rules = settings.automaticEntry || { enabled: false, rules: [] };
  const [dirty, setDirty] = useState(false),
    [error, setError] = useState(""),
    [preview, setPreview] = useState<any>(null),
    [loading, setLoading] = useState(false);
  function update(next: any) {
    onChange({ ...settings, automaticEntry: next });
    setDirty(true);
    setPreview(null);
    setError("");
  }
  function rule(id: string, next: any) {
    update({
      ...rules,
      rules: rules.rules.map((r: any) => (r.id === id ? next : r)),
    });
  }
  async function inspect() {
    setError("");
    setLoading(true);
    try {
      const document = validateAutomaticRules({ ...rules, enabled: true });
      const r = await apiFetch("/api/service-scheduling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "automatic_preview", document }),
      });
      const b = await r.json();
      if (!r.ok) throw Error(b.error);
      setPreview(b.preview);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <section className="automatic-flow">
      <header>
        <h3>Entrada automática de OSs</h3>
        <p>
          As regras são avaliadas somente na primeira importação de novas OSs.
        </p>
      </header>
      <fieldset disabled={!canEdit || busy || loading}>
        <label className="automatic-enabled">
          <input
            type="checkbox"
            checked={rules.enabled}
            onChange={(e) => update({ ...rules, enabled: e.target.checked })}
          />
          Ativar entrada automática
        </label>
        <div className="automatic-trigger">
          <GitBranch size={18} />
          <span>Nova OS importada no sistema</span>
        </div>
        <ArrowDown className="automatic-arrow" size={18} />
        {rules.rules.map((r: any, index: number) => (
          <div key={r.id}>
            {index > 0 && <div className="automatic-or">OU</div>}
            <article className="automatic-rule">
              <header>
                <label>
                  Regra {index + 1}
                  <input
                    aria-label={`Nome da regra ${index + 1}`}
                    maxLength={120}
                    value={r.name}
                    onChange={(e) => rule(r.id, { ...r, name: e.target.value })}
                  />
                </label>
                <button
                  type="button"
                  aria-label={`Remover regra ${index + 1}`}
                  onClick={() =>
                    update({
                      ...rules,
                      rules: rules.rules.filter((v: any) => v.id !== r.id),
                    })
                  }
                >
                  <Trash2 size={15} />
                </button>
              </header>
              {r.conditions.map((c: any, i: number) => {
                const change = (next: any) =>
                  rule(r.id, {
                    ...r,
                    conditions: r.conditions.map((v: any, j: number) =>
                      j === i ? next : v,
                    ),
                  });
                const values = options?.[c.field] || [];
                return (
                  <div className="automatic-condition" key={i}>
                    {i > 0 ? (
                      <label>
                        Ligação
                        <select
                          aria-label={`Ligação ${index + 1}.${i + 1}`}
                          value={c.connector}
                          onChange={(e) =>
                            change({ ...c, connector: e.target.value })
                          }
                        >
                          <option value="and">E</option>
                          <option value="or">OU</option>
                        </select>
                      </label>
                    ) : (
                      <span className="automatic-if">SE</span>
                    )}
                    <label>
                      Campo
                      <select
                        aria-label={`Campo ${index + 1}.${i + 1}`}
                        value={c.field}
                        onChange={(e) =>
                          change({ ...c, field: e.target.value, value: "" })
                        }
                      >
                        {Object.entries(automaticFields).map(([key, name]) => (
                          <option key={key} value={key}>
                            {name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Comparação
                      <select
                        aria-label={`Comparação ${index + 1}.${i + 1}`}
                        value={c.operator}
                        onChange={(e) =>
                          change({ ...c, operator: e.target.value })
                        }
                      >
                        <option value="eq">Igual</option>
                        <option value="neq">Diferente</option>
                      </select>
                    </label>
                    <label>
                      Valor
                      <select
                        aria-label={`Valor ${index + 1}.${i + 1}`}
                        value={c.value}
                        onChange={(e) =>
                          change({ ...c, value: e.target.value })
                        }
                      >
                        <option value="">Selecione</option>
                        {c.value && !values.includes(c.value) && (
                          <option value={c.value}>
                            {c.value} (fora da lista atual)
                          </option>
                        )}
                        {values.map((v: string) => (
                          <option key={v} value={v}>
                            {v}
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      disabled={r.conditions.length === 1}
                      aria-label={`Remover condição ${index + 1}.${i + 1}`}
                      onClick={() =>
                        rule(r.id, {
                          ...r,
                          conditions: r.conditions.filter(
                            (_: any, j: number) => j !== i,
                          ),
                        })
                      }
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}
              <button
                type="button"
                disabled={r.conditions.length >= 20}
                onClick={() =>
                  rule(r.id, { ...r, conditions: [...r.conditions, blank()] })
                }
              >
                <Plus size={14} />
                Adicionar condição E/OU
              </button>
              <p className="automatic-expression">
                {r.conditions.reduce((text: string, c: any, i: number) => {
                  const term = `${automaticFields[c.field]} ${c.operator === "eq" ? "=" : "≠"} “${c.value || "…"}”`;
                  return i
                    ? `(${text} ${c.connector === "and" ? "E" : "OU"} ${term})`
                    : term;
                }, "")}
              </p>
            </article>
          </div>
        ))}
        <button
          type="button"
          disabled={rules.rules.length >= 30}
          onClick={() =>
            update({
              ...rules,
              rules: [
                ...rules.rules,
                {
                  id: crypto.randomUUID(),
                  name: `Regra ${rules.rules.length + 1}`,
                  conditions: [blank()],
                },
              ],
            })
          }
        >
          <Plus size={15} />
          Adicionar regra
        </button>
        <ArrowDown className="automatic-arrow" size={18} />
        <div className="automatic-destination">
          Se qualquer regra for verdadeira → Incluir na programação com uma
          operação pendente.
        </div>
        <p>
          Dentro de cada regra, E/OU é avaliado na ordem exibida, conforme os
          parênteses. Entre regras, basta uma ser verdadeira. Campos sem
          informação não satisfazem “Igual” nem “Diferente”.
        </p>
        <p>
          Ao salvar, as regras passam a valer somente para novas OSs importadas
          a partir desse momento. OSs já cadastradas e programações existentes
          permanecem como estão, mesmo que sejam atualizadas posteriormente.
        </p>
        {error && <p role="alert">{error}</p>}
        {preview && (
          <p role="status">
            {preview.matching} OSs correspondentes na base atual (simulação).
            Nenhuma dessas OSs será incluída ao salvar a regra.
          </p>
        )}
        <footer>
          <small>
            {dirty
              ? "Alterações não salvas"
              : rules.enabled
                ? "Automação ativa"
                : "Automação desativada"}
          </small>
          <button type="button" onClick={() => void inspect()}>
            Pré-visualizar resultado
          </button>
          <button
            type="button"
            onClick={async () => {
              if (await onSave({ ...settings, automaticEntry: rules }))
                setDirty(false);
            }}
           aria-label="Salvar regras" title="Salvar regras"><SaveActionIcon /></button>
        </footer>
      </fieldset>
    </section>
  );
}
