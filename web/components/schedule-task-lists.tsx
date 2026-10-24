"use client";
import { matchesSearch } from "@/lib/filters";

import { useEffect, useRef, useState } from "react";
import {
  ClipboardPlus,
  ListPlus,
  Plus,
  Save,
  Trash2,
  ArrowUp,
  ArrowDown,
  Pencil,
} from "lucide-react";
import {
  allTaskListFields,
  taskListFields,
  operationSnapshot,
} from "@/lib/service-scheduling/task-list-model";
import { blankOperation } from "@/lib/service-scheduling/model";
import SupportPicker from "./support-picker";
import OperationEquipmentSelect from "./operation-equipment-select";
import "./schedule-task-lists.css";
async function api(body?: any) {
  const response = await fetch(
    "/api/service-scheduling" + (body ? "" : "?taskLists=1"),
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store" },
  );
  const result = await response.json();
  if (!response.ok)
    throw Error(
      result.error || "Não foi possível acessar as listas de tarefas.",
    );
  return result;
}
function fieldValue(key: string, value: any, data: any) {
  if (key === "support")
    return (value || [])
      .map(
        (email: string) =>
          data.users.find((u: any) => u.email === email)?.display_name || email,
      )
      .join(", ");
  if (key === "responsible")
    return (
      data.users.find((u: any) => u.email === value)?.display_name || value
    );
  if (["checklistId", "vehicleId", "calendarId"].includes(key))
    return (
      data.settings.document[
        key === "checklistId"
          ? "checklists"
          : key === "vehicleId"
            ? "vehicles"
            : "calendars"
      ]?.find((item: any) => item.id === value)?.name || value
    );
  return value;
}
function ListPreview({
  operations,
  fields,
  data,
}: {
  operations: any[];
  fields: string[];
  data: any;
}) {
  return (
    <div className="task-list-preview">
      {operations.map((op, index) => (
        <article key={index}>
          <strong>Operação {String(index + 1).padStart(2, "0")}</strong>
          <dl>
            {taskListFields
              .filter(([key]) => fields.includes(key))
              .map(([key, label]) => (
                <div key={key}>
                  <dt>{label}</dt>
                  <dd>
                    {key === "equipmentId" && op.equipmentId
                      ? op.equipment?.name
                        ? `${op.equipmentId} · ${op.equipment.name}`
                        : op.equipmentId
                      : String(fieldValue(key, op[key], data) ?? "") ||
                        "Não definido"}
                  </dd>
                </div>
              ))}
          </dl>
        </article>
      ))}
    </div>
  );
}
function Fields({
  fields,
  onChange,
}: {
  fields: string[];
  onChange: (fields: string[]) => void;
}) {
  return (
    <fieldset className="task-list-field-options">
      <legend>Campos que serão armazenados</legend>
      <label>
        <input
          type="checkbox"
          checked={fields.length === allTaskListFields.length}
          onChange={(e) =>
            onChange(e.target.checked ? [...allTaskListFields] : [])
          }
        />
        Todos os campos de planejamento
      </label>
      <div>
        {taskListFields.map(([key, label]) => (
          <label key={key}>
            <input
              type="checkbox"
              checked={fields.includes(key)}
              onChange={(e) =>
                onChange(
                  e.target.checked
                    ? [...fields, key]
                    : fields.filter((f) => f !== key),
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
      <small>
        Data de programação e horário de início nunca são armazenados. Cargo é
        definido pelo responsável. Relatórios preenchidos, apontamentos e status
        de execução não fazem parte da lista.
      </small>
    </fieldset>
  );
}
function OperationEditor({
  operation,
  index,
  fields,
  data,
  onChange,
}: {
  operation: any;
  index: number;
  fields: string[];
  data: any;
  onChange: (d: any) => void;
}) {
  const settings = data.settings.document;
  const set = (key: string, value: any) =>
    onChange({ ...operation, [key]: value });
  return (
    <>
      {taskListFields
        .filter(([key]) => fields.includes(key))
        .map(([key, label]) => {
          const value = operation[key];
          const options =
            key === "serviceType"
              ? settings.serviceTypes.map((name: string) => ({
                  id: name,
                  name,
                }))
              : key === "checklistId"
                ? settings.checklists
                : key === "vehicleId"
                  ? settings.vehicles
                  : key === "calendarId"
                    ? settings.calendars
                    : key === "responsible"
                      ? data.users
                          .filter((u: any) => u.enabled !== false)
                          .map((u: any) => ({
                            id: u.email,
                            name: u.display_name || u.email,
                          }))
                      : null;
          return (
            <td key={key} data-field={key}>
              <label>
                <span className="sr-only">{label}</span>
                {key === "equipmentId" ? (
                  <OperationEquipmentSelect
                    globalOnly
                    scheduleId="0"
                    disabled={false}
                    value={value}
                    label={operation.equipment?.name || ""}
                    onChange={(id, equipment) =>
                      onChange({ ...operation, equipmentId: id, equipment })
                    }
                  />
                ) : key === "support" ? (
                  <SupportPicker
                    position={index + 1}
                    users={data.users.filter(
                      (u: any) =>
                        u.enabled !== false &&
                        u.email !== operation.responsible,
                    )}
                    selected={operation.support}
                    onChange={(support: string[]) => set(key, support)}
                  />
                ) : key === "internalNote" ? (
                  <textarea
                    rows={1}
                    maxLength={20000}
                    value={value}
                    onChange={(e) => set(key, e.target.value)}
                  />
                ) : options ? (
                  <select
                    value={value}
                    onChange={(e) => set(key, e.target.value)}
                  >
                    {key !== "calendarId" && (
                      <option value="">Não definido</option>
                    )}
                    {options.map((o: any) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    value={value ?? ""}
                    type={key === "duration" ? "number" : "text"}
                    min={key === "duration" ? 0 : undefined}
                    max={key === "duration" ? 10000 : undefined}
                    step={key === "duration" ? "0.001" : undefined}
                    maxLength={key === "description" ? 40 : undefined}
                    onChange={(e) =>
                      set(
                        key,
                        key === "duration"
                          ? e.target.value === ""
                            ? null
                            : Number(e.target.value)
                          : e.target.value,
                      )
                    }
                  />
                )}
              </label>
            </td>
          );
        })}
    </>
  );
}
function ListEditor({
  list,
  source,
  data,
  onSaved,
  onCancel,
}: {
  list?: any;
  source?: any;
  data: any;
  onSaved: (list: any) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState(list?.name || ""),
    [fields, setFields] = useState<string[]>(
      list?.document.fields || [...allTaskListFields],
    ),
    [operations, setOperations] = useState<any[]>(
      list?.document.operations ||
        source?.operations.map((o: any) => o.document) || [blankOperation()],
    );
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [dirty, setDirty] = useState(false);
  const saving = useRef(false);
  const change = (fn: () => void) => {
    setDirty(true);
    fn();
  };
  async function save() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      const result = await api({
        action: "task_list_save",
        id: list?.id,
        version: list?.version,
        name,
        fields,
        operations: source ? undefined : operations,
        ...(source
          ? {
              sourceScheduleId: String(source.schedule.id),
              expectedOperations: operationSnapshot(source.operations),
            }
          : {}),
      });
      onSaved(result.list);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="task-list-editor">
      <h3>
        {list
          ? "Editar lista de tarefas"
          : source
            ? "Criar lista a partir desta OS"
            : "Nova lista de tarefas"}
      </h3>
      <fieldset disabled={busy}>
        <label className="task-list-name">
          Nome da lista
          <input
            autoFocus
            maxLength={120}
            value={name}
            onChange={(e) => change(() => setName(e.target.value))}
            placeholder="Ex.: Preventiva de compressor parafuso"
          />
        </label>
        <Fields
          fields={fields}
          onChange={(value) => change(() => setFields(value))}
        />
        {source ? (
          <>
            <p>
              {operations.length} operação(ões) da OS. Somente os campos
              selecionados serão armazenados.
            </p>
            <ListPreview operations={operations} fields={fields} data={data} />
          </>
        ) : (
          <>
            <div className="scheduling-table task-list-operations-scroll">
              <table
                className="task-list-operations-table"
                aria-label="Operações da lista de tarefas"
              >
                <thead>
                  <tr>
                    <th>Operação</th>
                    {taskListFields
                      .filter(([key]) => fields.includes(key))
                      .map(([key, label]) => (
                        <th key={key}>{label}</th>
                      ))}
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {operations.map((op, index) => (
                    <tr className="task-list-operation" key={index}>
                      <td>
                        <strong>{String(index + 1).padStart(2, "0")}</strong>
                      </td>
                      <OperationEditor
                        operation={op}
                        index={index}
                        fields={fields}
                        data={data}
                        onChange={(value) =>
                          change(() =>
                            setOperations((rows) =>
                              rows.map((row, i) => (i === index ? value : row)),
                            ),
                          )
                        }
                      />
                      <td>
                        <div className="task-list-actions">
                          <button
                            type="button"
                            aria-label={`Subir operação ${index + 1}`}
                            disabled={!index}
                            onClick={() =>
                              change(() =>
                                setOperations((rows) => {
                                  const next = [...rows];
                                  [next[index - 1], next[index]] = [
                                    next[index],
                                    next[index - 1],
                                  ];
                                  return next;
                                }),
                              )
                            }
                          >
                            <ArrowUp size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Descer operação ${index + 1}`}
                            disabled={index === operations.length - 1}
                            onClick={() =>
                              change(() =>
                                setOperations((rows) => {
                                  const next = [...rows];
                                  [next[index + 1], next[index]] = [
                                    next[index],
                                    next[index + 1],
                                  ];
                                  return next;
                                }),
                              )
                            }
                          >
                            <ArrowDown size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Remover operação ${index + 1}`}
                            disabled={operations.length === 1}
                            onClick={() =>
                              change(() =>
                                setOperations((rows) =>
                                  rows.filter((_, i) => i !== index),
                                ),
                              )
                            }
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <button
              type="button"
              disabled={operations.length >= 200}
              onClick={() =>
                change(() =>
                  setOperations((rows) => [...rows, blankOperation()]),
                )
              }
            >
              <Plus size={16} />
              Adicionar operação à lista
            </button>
          </>
        )}
      </fieldset>
      {error && (
        <p role="alert" className="task-list-error">
          {error}
        </p>
      )}
      <footer className="task-list-actions">
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            if (!dirty || confirm("Descartar as alterações da lista?"))
              onCancel();
          }}
        >
          Cancelar
        </button>
        <button
          type="button"
          className="task-list-primary"
          disabled={
            busy || !name.trim() || !fields.length || !operations.length
          }
          onClick={() => void save()}
        >
          <Save size={16} />
          {busy ? "Salvando…" : "Salvar lista"}
        </button>
      </footer>
    </div>
  );
}
export function ScheduleTaskLists({ data }: { data: any }) {
  const [lists, setLists] = useState<any[]>([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [query, setQuery] = useState(""),
    [edit, setEdit] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState("");
  async function load() {
    setLoading(true);
    setError("");
    try {
      setLists((await api()).lists);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    void load();
  }, []);
  async function remove(list: any) {
    if (
      !confirm(
        `Excluir a lista “${list.name}”? As operações já atribuídas às OSs serão mantidas.`,
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api({
        action: "task_list_delete",
        id: list.id,
        version: list.version,
      });
      setLists((rows) => rows.filter((r) => r.id !== list.id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="schedule-task-lists">
      <p>
        Modelos reutilizáveis de operações. Ao atribuir uma lista, data e
        horário de início ficam em branco.
      </p>
      {edit ? (
        <ListEditor
          key={edit.id || "new"}
          list={edit.id ? edit : undefined}
          data={data}
          onCancel={() => setEdit(null)}
          onSaved={(list) => {
            setLists((rows) => [list, ...rows.filter((r) => r.id !== list.id)]);
            setEdit(null);
            setNotice("Lista salva.");
          }}
        />
      ) : (
        <>
          <div className="task-list-actions">
            <label>
              Pesquisar listas
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Nome da lista"
              />
            </label>
            <button
              type="button"
              className="task-list-primary"
              onClick={() => {
                setNotice("");
                setEdit({});
              }}
            >
              <Plus size={16} />
              Nova lista de tarefas
            </button>
            <button
              type="button"
              disabled={loading || busy}
              onClick={() => void load()}
            >
              Atualizar listas
            </button>
          </div>
          {loading ? (
            <p role="status">Carregando listas…</p>
          ) : (
            <div className="task-list-catalog">
              {lists
                .filter((l) =>
                  matchesSearch(l.name
                    .toLocaleLowerCase("pt-BR"), query.toLocaleLowerCase("pt-BR")),
                )
                .map((list) => (
                  <article key={list.id}>
                    <div>
                      <h3>{list.name}</h3>
                      <p>
                        {list.document.operations.length} operação(ões) ·{" "}
                        {list.document.fields.length ===
                        allTaskListFields.length
                          ? "Todos os campos"
                          : `${list.document.fields.length} campos selecionados`}
                      </p>
                    </div>
                    <div className="task-list-actions">
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => setEdit(list)}
                      >
                        <Pencil size={16} />
                        Editar
                      </button>
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void remove(list)}
                      >
                        <Trash2 size={16} />
                        Excluir
                      </button>
                    </div>
                  </article>
                ))}
              {!lists.length && (
                <p>
                  Nenhuma lista cadastrada. Crie uma aqui ou a partir das
                  operações de uma OS.
                </p>
              )}
            </div>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="task-list-error">
          {error}
        </p>
      )}
      {notice && !edit && <p role="status">{notice}</p>}
    </section>
  );
}
function ApplyList({
  source,
  data,
  onApplied,
  onCancel,
  hasDirty,
}: {
  source: any;
  data: any;
  onApplied: () => void;
  onCancel: () => void;
  hasDirty: () => boolean;
}) {
  const [lists, setLists] = useState<any[]>([]),
    [selected, setSelected] = useState(""),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [confirmed, setConfirmed] = useState(false),
    [busy, setBusy] = useState(false);
  const saving = useRef(false);
  useEffect(() => {
    let active = true;
    api()
      .then((result) => {
        if (active) setLists(result.lists);
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
  }, []);
  const list = lists.find((l) => l.id === selected);
  async function apply() {
    if (!list || !confirmed || saving.current) return;
    if (hasDirty()) {
      setError(
        "Salve as alterações das operações antes de atribuir uma lista.",
      );
      return;
    }
    saving.current = true;
    setBusy(true);
    setError("");
    try {
      await api({
        action: "task_list_apply",
        scheduleId: String(source.schedule.id),
        id: list.id,
        version: list.version,
        expectedOperations: operationSnapshot(source.operations),
        confirmReplace: true,
      });
      onApplied();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="task-list-editor">
      <h3>Atribuir Lista de Tarefas</h3>
      {loading ? (
        <p role="status">Carregando listas…</p>
      ) : (
        <fieldset disabled={busy}>
          <label className="task-list-name">
            Lista de tarefas
            <select
              value={selected}
              onChange={(e) => {
                setSelected(e.target.value);
                setConfirmed(false);
              }}
            >
              <option value="">Selecione uma lista</option>
              {lists.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name} ({l.document.operations.length} operações)
                </option>
              ))}
            </select>
          </label>
          {!lists.length && (
            <p>
              Nenhuma lista cadastrada. Utilize Criar Lista de Tarefas ou as
              configurações da programação.
            </p>
          )}
          {list && (
            <>
              <p>
                As {source.operations.length} operação(ões) atuais serão
                substituídas por {list.document.operations.length} operação(ões)
                da lista. Data e horário de início ficarão em branco. Campos não
                incluídos na lista ficarão sem preenchimento, com calendário
                Padrão.
              </p>
              <ListPreview
                operations={list.document.operations}
                fields={list.document.fields}
                data={data}
              />
              <label className="task-list-confirm">
                <input
                  type="checkbox"
                  checked={confirmed}
                  onChange={(e) => setConfirmed(e.target.checked)}
                />
                Confirmo a substituição das operações desta OS.
              </label>
            </>
          )}
        </fieldset>
      )}
      {error && (
        <p role="alert" className="task-list-error">
          {error}
        </p>
      )}
      <footer className="task-list-actions">
        <button type="button" disabled={busy} onClick={onCancel}>
          Cancelar
        </button>
        <button
          type="button"
          className="task-list-primary"
          disabled={busy || loading || !list || !confirmed}
          onClick={() => void apply()}
        >
          <ListPlus size={16} />
          {busy ? "Atribuindo…" : "Substituir operações"}
        </button>
      </footer>
    </div>
  );
}
export function TaskListActions({
  data,
  disabled,
  hasDirty,
  onApplied,
}: {
  data: any;
  disabled: boolean;
  hasDirty: () => boolean;
  onApplied: () => void;
}) {
  const [mode, setMode] = useState(""),
    [source, setSource] = useState<any>(null),
    [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    if (mode) dialog.current?.showModal();
  }, [mode]);
  function open(next: string) {
    if (hasDirty()) {
      setMessage("Salve as alterações das operações antes de continuar.");
      return;
    }
    setMessage("");
    setSource(structuredClone(data));
    setMode(next);
  }
  return (
    <>
      <button
        type="button"
        disabled={disabled || !data.operations.length}
        onClick={() => open("create")}
      >
        <ClipboardPlus size={16} />
        Criar Lista de Tarefas
      </button>
      <button type="button" disabled={disabled} onClick={() => open("apply")}>
        <ListPlus size={16} />
        Atribuir Lista de Tarefas
      </button>
      {message && (
        <p role="status" className="task-list-notice">
          {message}
        </p>
      )}
      {mode && (
        <dialog
          ref={dialog}
          className="task-list-dialog"
          aria-label={
            mode === "create"
              ? "Criar Lista de Tarefas"
              : "Atribuir Lista de Tarefas"
          }
          onCancel={(e) => {
            e.preventDefault();
          }}
        >
          {mode === "create" ? (
            <ListEditor
              source={source}
              data={data}
              onCancel={() => setMode("")}
              onSaved={(list) => {
                setMode("");
                setMessage(
                  `Lista “${list.name}” salva nas configurações da programação.`,
                );
              }}
            />
          ) : (
            <ApplyList
              source={source}
              data={data}
              hasDirty={hasDirty}
              onCancel={() => setMode("")}
              onApplied={() => {
                setMode("");
                setMessage(
                  "Lista atribuída. Preencha as datas e horários das novas operações.",
                );
                onApplied();
              }}
            />
          )}
        </dialog>
      )}
    </>
  );
}
