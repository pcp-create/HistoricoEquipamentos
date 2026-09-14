"use client";
import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown } from "lucide-react";
import { versionLabel } from "@/lib/manufacturer/version-label";
type Version = {
  id: string;
  name: string;
  header?: string[];
  suggested?: boolean;
};
export default function VersionPicker({
  value,
  versions,
  placeholder,
  onChange,
  grouped = false,
  label,
}: {
  value: string;
  versions: Version[];
  placeholder: string;
  onChange: (value: string) => void;
  grouped?: boolean;
  label: string;
}) {
  const [open, setOpen] = useState(false),
    [active, setActive] = useState(0);
  const root = useRef<HTMLDivElement>(null),
    list = useRef<HTMLDivElement>(null),
    id = useId();
  const ordered = grouped
    ? [
        ...versions.filter((v) => v.suggested),
        ...versions.filter((v) => !v.suggested),
      ]
    : versions;
  const options: Version[] = [{ id: "", name: placeholder }, ...ordered];
  const selected = options.find((v) => v.id === value) || options[0];
  const detail = (v: Version) =>
    versionLabel(v).slice(v.name.length).replace(/^ — /, "");
  const content = (v: Version) => (
    <>
      <span className="version-picker-name">{v.name}</span>
      {detail(v) && (
        <small className="version-picker-note" title={v.header?.join(" · ")}>
          {detail(v)}
        </small>
      )}
    </>
  );
  const show = () => {
    setActive(
      Math.max(
        0,
        options.findIndex((v) => v.id === value),
      ),
    );
    setOpen(true);
  };
  useEffect(() => {
    if (!open) return;
    const close = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", close);
    return () => document.removeEventListener("pointerdown", close);
  }, [open]);
  useEffect(() => {
    if (open)
      list.current
        ?.querySelector(`[data-index="${active}"]`)
        ?.scrollIntoView({ block: "nearest" });
  }, [active, open]);
  return (
    <div className="version-picker" ref={root}>
      <button
        type="button"
        role="combobox"
        aria-label={label}
        aria-expanded={open}
        aria-controls={id}
        aria-haspopup="listbox"
        aria-activedescendant={open ? `${id}-${active}` : undefined}
        className="version-picker-trigger"
        onClick={() => (open ? setOpen(false) : show())}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
            e.preventDefault();
            return;
          }
          if (e.key === "Tab") {
            setOpen(false);
            return;
          }
          if (["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
            e.preventDefault();
            if (!open) {
              show();
              return;
            }
            setActive((n) =>
              e.key === "Home"
                ? 0
                : e.key === "End"
                  ? options.length - 1
                  : Math.max(
                      0,
                      Math.min(
                        options.length - 1,
                        n + (e.key === "ArrowDown" ? 1 : -1),
                      ),
                    ),
            );
          }
          if ((e.key === "Enter" || e.key === " ") && open) {
            e.preventDefault();
            onChange(options[active]?.id || "");
            setOpen(false);
          }
        }}
      >
        {content(selected)}
        <ChevronDown size={15} aria-hidden="true" />
      </button>
      {open && (
        <div
          ref={list}
          id={id}
          role="listbox"
          aria-label={label}
          className="version-picker-list"
        >
          {options.map((v, i) => (
            <div key={v.id}>
              {grouped &&
                i > 0 &&
                (i === 1 ||
                  Boolean(v.suggested) !==
                    Boolean(options[i - 1].suggested)) && (
                  <div className="version-picker-group">
                    {v.suggested ? "Versões sugeridas" : "Demais versões"}
                  </div>
                )}
              <div
                id={`${id}-${i}`}
                data-index={i}
                role="option"
                aria-selected={v.id === value}
                className={`version-picker-option ${i === active ? "is-active" : ""}`}
                onPointerDown={(e) => e.preventDefault()}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  onChange(v.id);
                  setOpen(false);
                }}
              >
                {content(v)}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
