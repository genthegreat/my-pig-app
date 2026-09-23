"use client";

// Tags are colours, often in pairs — "pink", "blue + red". The farm's own
// scheme, supported as a first-class input rather than free text.

export const TAG_COLOURS: { name: string; hex: string }[] = [
  { name: "pink", hex: "#f28cb1" },
  { name: "red", hex: "#d7263d" },
  { name: "orange", hex: "#f28c28" },
  { name: "yellow", hex: "#f2d43d" },
  { name: "green", hex: "#3c9a5f" },
  { name: "blue", hex: "#2f6db5" },
  { name: "purple", hex: "#7a4fbf" },
  { name: "white", hex: "#f7f7f2" },
  { name: "black", hex: "#222222" },
  { name: "brown", hex: "#8a5a2b" },
];

export function parseTagColour(tag?: string): string[] {
  if (!tag) return [];
  return tag
    .split(/\s*[+&,/]\s*|\s+and\s+/i)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

export function joinTagColour(parts: string[]): string | undefined {
  return parts.length ? parts.join(" + ") : undefined;
}

function hexFor(name: string): string {
  return TAG_COLOURS.find((c) => c.name === name)?.hex ?? "#cfcfcf";
}

export function TagSwatch({ colour, size }: { colour?: string; size?: "lg" }) {
  const parts = parseTagColour(colour);
  if (!parts.length) return <span className={`swatch empty ${size ?? ""}`} aria-label="no tag" />;
  return (
    <span className={`swatch ${size ?? ""}`} aria-label={`tag ${colour}`} title={colour}>
      {parts.map((p, i) => (
        <span key={i} style={{ background: hexFor(p) }} />
      ))}
    </span>
  );
}

/** Pick one or two colours. Tapping a selected colour removes it. */
export function TagPicker({ value, onChange }: { value?: string; onChange: (v?: string) => void }) {
  const parts = parseTagColour(value);
  const toggle = (name: string) => {
    if (parts.includes(name)) onChange(joinTagColour(parts.filter((p) => p !== name)));
    else if (parts.length >= 2) onChange(joinTagColour([parts[1], name]));
    else onChange(joinTagColour([...parts, name]));
  };
  return (
    <div className="stack-sm">
      <div className="hstack">
        <TagSwatch colour={value} size="lg" />
        <div>
          <div className="bold">{value ? value : "No tag colour"}</div>
          <div className="small muted">Tap one colour, or two for a pair</div>
        </div>
      </div>
      <div className="colour-grid">
        {TAG_COLOURS.map((c) => (
          <button
            key={c.name}
            type="button"
            aria-pressed={parts.includes(c.name)}
            style={{ background: c.hex, color: c.name === "black" ? "#fff" : "#111", textShadow: c.name === "black" ? "none" : undefined }}
            onClick={() => toggle(c.name)}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
