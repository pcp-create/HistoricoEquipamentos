"use client";
import {useState,useEffect,useRef,useId} from "react";
import "./support-picker.css";
export default function SupportPicker({ position, disabled, users, selected, onChange, label, removeLabel = "Remover apoio", filterLabel, className = "" }: any) {
  const optionsId = useId();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open || disabled || !panel.current) return;
    const place = () => {
      if (!trigger.current || !panel.current) return;
      const r = trigger.current.getBoundingClientRect();
      const width = Math.min(280, window.innerWidth - 16);
      panel.current.style.width = width + "px";
      panel.current.style.left =
        Math.max(8, Math.min(r.left, window.innerWidth - width - 8)) + "px";
      const height = Math.min(240, window.innerHeight - 16);
      panel.current.style.maxHeight = height + "px";
      panel.current.style.top =
        Math.max(8, Math.min(r.bottom + 4, window.innerHeight - height - 8)) +
        "px";
    };
    place();
    panel.current.showPopover();
    panel.current.querySelector("input")?.focus();
    window.addEventListener("resize", place);
    window.addEventListener("scroll", place, true);
    return () => {
      window.removeEventListener("resize", place);
      window.removeEventListener("scroll", place, true);
    };
  }, [open, disabled]);
  const fold = (value: string) =>
    value
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  const filtered = users.filter((u: any) =>
    fold(u.display_name || u.email).includes(fold(query.trim())),
  );
  return (
    <div
      className={"support-picker " + className}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false);
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.stopPropagation();
          setOpen(false);
        }
        // Enter in this picker selects a person without submitting the operation.
        if (e.key === "Enter") { e.stopPropagation(); if(e.target instanceof HTMLInputElement)e.preventDefault(); }
      }}
    >
      <div className="support-selected">
        {selected.map((email: string) => (
          <span key={email}>
            {users.find((u: any) => u.email === email)?.display_name || email}
            <button
              type="button"
              disabled={disabled}
              aria-label={
                removeLabel + " " +
                (users.find((u: any) => u.email === email)?.display_name ||
                  email)
              }
              onClick={() =>
                onChange(selected.filter((v: string) => v !== email))
              }
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <button
        ref={trigger}
        className="support-add"
        type="button"
        aria-label={label || "Equipe de Apoio " + position}
        aria-expanded={open && !disabled}
        aria-controls={optionsId}
        disabled={disabled}
        onClick={() => setOpen(!open)}
      >
        + adicionar
      </button>
      {open && !disabled && (
        <div
          ref={panel}
          popover="auto"
          onToggle={(e) => {
            if (e.newState === "closed") setOpen(false);
          }}
          className="support-options"
          id={optionsId}
        >
          <input
            autoFocus
            aria-label={filterLabel || "Filtrar equipe de apoio " + position}
            placeholder="Pesquisar usuário..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div
            className="support-options-list"
            role="group"
            aria-label={label || "Usuários de apoio"}
          >
            {filtered.map((u: any) => (
              <button
                type="button"
                key={u.email}
                aria-pressed={selected.includes(u.email)}
                onClick={() => {
                  if (!selected.includes(u.email))
                    onChange([...selected, u.email]);
                }}
              >
                <span>{u.display_name || u.email}</span>
                {selected.includes(u.email) && (
                  <span aria-hidden="true">✓</span>
                )}
              </button>
            ))}
            {!filtered.length && <small>Nenhum usuário encontrado.</small>}
          </div>
        </div>
      )}
    </div>
  );
}
