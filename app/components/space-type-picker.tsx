"use client";

import { useMemo, useRef, useState } from "react";
import type { SpaceType } from "./nearby-search-types";

export function SpaceTypePicker({
  spaceTypes,
  value,
  onChange,
}: {
  spaceTypes: SpaceType[];
  value: string;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = spaceTypes.find((type) => String(type.id) === value);
  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return spaceTypes;
    return spaceTypes.filter((type) => type.name.toLowerCase().includes(normalized));
  }, [query, spaceTypes]);

  function select(id: string) {
    onChange(id);
    setQuery("");
    setOpen(false);
  }

  return (
    <div className="field field-wide">
      <span className="field-label">Space type</span>
      <div
        className="combo"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) setOpen(false);
        }}
      >
        <button
          type="button"
          className="combo-trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => {
            setOpen((current) => !current);
            requestAnimationFrame(() => inputRef.current?.focus());
          }}
        >
          <span>{selected?.name ?? "Any public type"}</span>
          <span className="chevron">⌄</span>
        </button>
        {open ? (
          <div className="combo-panel">
            <input
              ref={inputRef}
              className="combo-search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search gyms, classrooms, auditoriums..."
            />
            <div className="combo-list" role="listbox">
              <button
                type="button"
                className={!value ? "combo-option active" : "combo-option"}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => select("")}
              >
                Any public type
              </button>
              {filtered.map((type) => (
                <button
                  type="button"
                  role="option"
                  aria-selected={String(type.id) === value}
                  key={String(type.id)}
                  className={String(type.id) === value ? "combo-option active" : "combo-option"}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => select(String(type.id))}
                >
                  {type.name}
                </button>
              ))}
              {filtered.length === 0 ? <div className="combo-empty">No room types match &quot;{query}&quot;.</div> : null}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
