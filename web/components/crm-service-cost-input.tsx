"use client";
import { useState } from "react";

/** Keep editing natural; format saved values and completed edits to two decimals. */
export default function CrmServiceCostInput({
  value,
  onChange,
  ...props
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  className?: string;
  "aria-label": string;
}) {
  const [editing, setEditing] = useState(false);
  const formatted =
    value !== "" && Number.isFinite(Number(value))
      ? Number(value).toFixed(2)
      : value;
  return (
    <input
      {...props}
      type="number"
      min="0"
      max="99999999.99"
      step="0.01"
      placeholder="Não informado"
      value={editing ? value : formatted}
      onFocus={() => setEditing(true)}
      onChange={(e) => onChange(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (formatted !== value) onChange(formatted);
      }}
    />
  );
}
