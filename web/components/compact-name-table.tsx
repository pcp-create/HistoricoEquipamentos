"use client";
import SaveActionIcon from "./save-action-icon";
import { useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import "./compact-edit-table.css";
export default function CompactNameTable({
  items,
  label,
  maxLength,
  busy,
  onSave,
  onRemove,
  onAdd,
}: {
  items: { id: string; name: string }[];
  label: string;
  maxLength: number;
  busy: boolean;
  onSave: (id: string, name: string) => Promise<boolean>;
  onRemove: (id: string) => Promise<boolean>;
  onAdd: (name: string) => Promise<boolean>;
}) {
  const [adding, setAdding] = useState(false),
    [name, setName] = useState("");
  const add = async () => {
    if (!name.trim() || busy) return;
    if (await onAdd(name.trim())) {
      setName("");
      setAdding(false);
    }
  };
  return (
    <div className="compact-edit-wrap">
      <table className="compact-edit-table">
        <thead>
          <tr>
            <th>{label}</th>
            <th>Ações</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <NameRow
              key={item.id}
              item={item}
              label={label}
              maxLength={maxLength}
              busy={busy}
              save={onSave}
              remove={onRemove}
            />
          ))}
          {adding && (
            <tr
              className="compact-edit-dirty"
              onKeyDown={(e) => {
                if (
                  e.key === "Enter" &&
                  !e.nativeEvent.isComposing &&
                  e.target instanceof HTMLInputElement
                ) {
                  e.preventDefault();
                  void add();
                }
              }}
            >
              <td>
                <input
                  autoFocus
                  aria-label={`Novo ${label.toLowerCase()}`}
                  maxLength={maxLength}
                  value={name}
                  disabled={busy}
                  onChange={(e) => setName(e.target.value)}
                />
                <small>Não salvo</small>
              </td>
              <td>
                <button
                  disabled={busy || !name.trim()}
                  onClick={() => void add()}
                 aria-label="Salvar" title="Salvar"><SaveActionIcon /></button>
                <button
                  disabled={busy}
                  onClick={() => {
                    setAdding(false);
                    setName("");
                  }}
                >
                  <X size={14} />
                  Cancelar
                </button>
              </td>
            </tr>
          )}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2}>
              <button disabled={busy || adding} onClick={() => setAdding(true)}>
                <Plus size={15} />
                Adicionar {label.toLowerCase()}
              </button>
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
function NameRow({ item, label, maxLength, busy, save, remove }: any) {
  const [name, setName] = useState(item.name);
  const dirty = name !== item.name;
  const persist = async () => {
    if (!busy && dirty && name.trim()) {
      const next = name.trim();
      if (await save(item.id, next)) setName(next);
    }
  };
  return (
    <tr
      className={dirty ? "compact-edit-dirty" : ""}
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          !e.nativeEvent.isComposing &&
          e.target instanceof HTMLInputElement
        ) {
          e.preventDefault();
          void persist();
        }
      }}
    >
      <td>
        <input
          aria-label={`${label} ${item.name}`}
          maxLength={maxLength}
          disabled={busy}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {dirty && <small>Alterações não salvas</small>}
      </td>
      <td>
        <button
          disabled={busy || !dirty || !name.trim()}
          onClick={() => void persist()}
         aria-label="Salvar" title="Salvar"><SaveActionIcon /></button>
        {dirty && (
          <button disabled={busy} onClick={() => setName(item.name)}>
            <X size={14} />
            Cancelar
          </button>
        )}
        <button
          disabled={busy}
          aria-label={`Remover ${item.name}`}
          onClick={() => void remove(item.id)}
        >
          <Trash2 size={14} />
        </button>
      </td>
    </tr>
  );
}
