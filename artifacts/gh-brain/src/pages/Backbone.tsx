function Block({ label, muted }: { label: string; muted?: boolean }) {
  return (
    <div style={{
      padding: "1rem",
      background: muted ? "hsl(var(--muted)/0.3)" : "hsl(var(--primary)/0.08)",
      border: `1px solid ${muted ? "hsl(var(--border))" : "hsl(var(--primary)/0.3)"}`,
      borderRadius: "0.5rem",
      fontSize: "0.75rem",
      fontFamily: "monospace",
      color: muted ? "hsl(var(--muted-foreground))" : "hsl(var(--primary))",
      textAlign: "center",
      minHeight: "3.5rem",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    }}>
      {label}
    </div>
  );
}

function DemoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: "2rem" }}>
      <p style={{
        fontSize: "0.7rem",
        fontFamily: "monospace",
        color: "hsl(var(--muted-foreground))",
        marginBottom: "0.5rem",
        textTransform: "uppercase",
        letterSpacing: "0.1em",
      }}>
        {label}
      </p>
      {children}
    </div>
  );
}

export default function BackbonePage() {
  return (
    <div>
      <main>

        {/* ── Row 1: Title ── */}
        <div className="row">
          <h1 style={{ fontSize: "1.5rem", fontWeight: 800, marginBottom: "0.25rem" }}>
            Backbone Reference
          </h1>
          <p style={{ fontSize: "0.875rem", color: "hsl(var(--muted-foreground))" }}>
            The canonical HTML + CSS structure every page on this site must follow.
            This page is the example — its own markup uses the backbone throughout.
          </p>
        </div>

        {/* ── Row 2: HTML Hierarchy ── */}
        <div className="row">
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem", fontFamily: "monospace" }}>
            HTML Hierarchy
          </h2>
          <div style={{
            fontFamily: "monospace",
            fontSize: "0.8rem",
            lineHeight: 2,
            padding: "1.5rem",
            background: "hsl(var(--card)/0.5)",
            border: "1px solid hsl(var(--border))",
            borderRadius: "0.75rem",
            color: "hsl(var(--foreground))",
          }}>
            <div><span style={{ color: "hsl(var(--primary))" }}>&lt;body</span> <span style={{ color: "hsl(38 92% 50%)" }}>class="stage"</span><span style={{ color: "hsl(var(--primary))" }}>&gt;</span> <span style={{ color: "hsl(var(--muted-foreground))" }}>← universal page surface · base bg · flex-col</span></div>
            <div style={{ paddingLeft: "1.5rem" }}><span style={{ color: "hsl(var(--primary))" }}>&lt;div</span> <span style={{ color: "hsl(38 92% 50%)" }}>id="root"</span><span style={{ color: "hsl(var(--primary))" }}>&gt;</span> <span style={{ color: "hsl(var(--muted-foreground))" }}>← React mount · flex:1 · flex-col · pass-through</span></div>
            <div style={{ paddingLeft: "3rem" }}><span style={{ color: "hsl(var(--primary))" }}>&lt;header&gt;</span> <span style={{ color: "hsl(var(--muted-foreground))" }}>← sticky · full width · natural height</span></div>
            <div style={{ paddingLeft: "4.5rem" }}><span style={{ color: "hsl(var(--primary))" }}>&lt;div</span> <span style={{ color: "hsl(38 92% 50%)" }}>class="row flex-between"</span><span style={{ color: "hsl(var(--primary))" }}>&gt;</span> <span style={{ color: "hsl(var(--muted-foreground))" }}>← logo · nav · actions</span></div>
            <div style={{ paddingLeft: "3rem" }}><span style={{ color: "hsl(var(--primary))" }}>&lt;main&gt;</span> <span style={{ color: "hsl(var(--muted-foreground))" }}>← flex:1 · fills space between header + footer</span></div>
            <div style={{ paddingLeft: "4.5rem" }}><span style={{ color: "hsl(var(--primary))" }}>&lt;div</span> <span style={{ color: "hsl(38 92% 50%)" }}>class="row"</span><span style={{ color: "hsl(var(--primary))" }}>&gt;</span> <span style={{ color: "hsl(var(--muted-foreground))" }}>← first row: padding-top:--sv auto</span></div>
            <div style={{ paddingLeft: "4.5rem" }}><span style={{ color: "hsl(var(--primary))" }}>&lt;div</span> <span style={{ color: "hsl(38 92% 50%)" }}>class="row"</span><span style={{ color: "hsl(var(--primary))" }}>&gt;</span> <span style={{ color: "hsl(var(--muted-foreground))" }}>← subsequent rows: margin-top auto</span></div>
            <div style={{ paddingLeft: "4.5rem" }}><span style={{ color: "hsl(var(--primary))" }}>&lt;div</span> <span style={{ color: "hsl(38 92% 50%)" }}>class="row"</span><span style={{ color: "hsl(var(--primary))" }}>&gt;</span> <span style={{ color: "hsl(var(--muted-foreground))" }}>← last row: padding-bottom:--sv auto</span></div>
            <div style={{ paddingLeft: "3rem" }}><span style={{ color: "hsl(var(--primary))" }}>&lt;footer&gt;</span> <span style={{ color: "hsl(var(--muted-foreground))" }}>← full width · natural height</span></div>
            <div style={{ paddingLeft: "4.5rem" }}><span style={{ color: "hsl(var(--primary))" }}>&lt;div</span> <span style={{ color: "hsl(38 92% 50%)" }}>class="row flex-between"</span><span style={{ color: "hsl(var(--primary))" }}>&gt;</span> <span style={{ color: "hsl(var(--muted-foreground))" }}>← brand · disclaimer · links</span></div>
          </div>
        </div>

        {/* ── Row 3: Layout Grid Family ── */}
        <div className="row">
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem", fontFamily: "monospace" }}>
            Layout Grid Family — <span style={{ color: "hsl(var(--muted-foreground))", fontWeight: 400 }}>inside a row, at ≥ 768px</span>
          </h2>

          <DemoRow label='layout__split-2 — 1fr 1fr'>
            <div className="layout__split-2">
              <Block label="1fr" /><Block label="1fr" />
            </div>
          </DemoRow>

          <DemoRow label='layout__split-3 — 1fr 1fr 1fr'>
            <div className="layout__split-3">
              <Block label="1fr" /><Block label="1fr" /><Block label="1fr" />
            </div>
          </DemoRow>

          <DemoRow label='layout__split-4 — repeat(4,1fr) → 2-col tablet'>
            <div className="layout__split-4">
              <Block label="1fr" /><Block label="1fr" /><Block label="1fr" /><Block label="1fr" />
            </div>
          </DemoRow>

          <DemoRow label='layout__split-2-1 — 2fr 1fr (wide left)'>
            <div className="layout__split-2-1">
              <Block label="2fr" /><Block label="1fr" muted />
            </div>
          </DemoRow>

          <DemoRow label='layout__split-1-2 — 1fr 2fr (wide right)'>
            <div className="layout__split-1-2">
              <Block label="1fr" muted /><Block label="2fr" />
            </div>
          </DemoRow>

          <DemoRow label='layout__split-3-2 — 3fr 2fr (hero: copy + visual)'>
            <div className="layout__split-3-2">
              <Block label="3fr" /><Block label="2fr" muted />
            </div>
          </DemoRow>

          <DemoRow label='layout__auto — auto-fill, minmax(280px, 1fr)'>
            <div className="layout__auto">
              <Block label="auto" /><Block label="auto" /><Block label="auto" />
              <Block label="auto" muted /><Block label="auto" muted />
            </div>
          </DemoRow>

          <DemoRow label='layout__center — max-width 640px centred'>
            <div className="layout__center">
              <Block label="640px max · centred · forms · auth · reading" />
            </div>
          </DemoRow>

          <DemoRow label='layout__sidebar — 240px fixed + 1fr fluid'>
            <div className="layout__sidebar">
              <Block label="240px" muted /><Block label="1fr" />
            </div>
          </DemoRow>
        </div>

        {/* ── Row 4: Flex Helpers ── */}
        <div className="row">
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem", fontFamily: "monospace" }}>
            Flex Helpers — <span style={{ color: "hsl(var(--muted-foreground))", fontWeight: 400 }}>used on a row or inside a row</span>
          </h2>

          <DemoRow label="flex-row — items centred, 8px gap">
            <div className="flex-row" style={{ padding: "0.75rem", background: "hsl(var(--card)/0.5)", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem" }}>
              <Block label="item" /><Block label="item" /><Block label="item" />
            </div>
          </DemoRow>

          <DemoRow label="flex-between — space-between, 12px gap">
            <div className="flex-between" style={{ padding: "0.75rem", background: "hsl(var(--card)/0.5)", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem" }}>
              <Block label="left" /><Block label="right" muted />
            </div>
          </DemoRow>

          <DemoRow label="row-sb — space-between, no gap (heading / CTA pairs)">
            <div className="row-sb" style={{ padding: "0.75rem", background: "hsl(var(--card)/0.5)", border: "1px solid hsl(var(--border))", borderRadius: "0.5rem" }}>
              <Block label="heading" /><Block label="CTA" muted />
            </div>
          </DemoRow>
        </div>

        {/* ── Row 5: Layout Tokens ── */}
        <div className="row">
          <h2 style={{ fontSize: "1rem", fontWeight: 700, marginBottom: "1rem", fontFamily: "monospace" }}>
            Layout Tokens
          </h2>
          <div className="layout__split-3">
            {[
              ["--sv", "Section vertical padding", "1.25rem → 2rem → 3rem"],
              ["--gutter", "Horizontal page padding", "1.25rem → 2rem → 3rem"],
              ["--col-gap", "Column gap", "1.5rem → 2rem → 2.5rem"],
              ["--max-w", "Max content width", "1200px"],
              ["--main-offset", "Header height clearance", "4rem (64px)"],
            ].map(([token, desc, value]) => (
              <div key={token} style={{
                padding: "1rem",
                background: "hsl(var(--card)/0.5)",
                border: "1px solid hsl(var(--border))",
                borderRadius: "0.5rem",
              }}>
                <p style={{ fontFamily: "monospace", fontSize: "0.75rem", color: "hsl(var(--primary))", marginBottom: "0.25rem" }}>{token}</p>
                <p style={{ fontSize: "0.75rem", color: "hsl(var(--foreground))", marginBottom: "0.25rem" }}>{desc}</p>
                <p style={{ fontFamily: "monospace", fontSize: "0.7rem", color: "hsl(var(--muted-foreground))" }}>{value}</p>
              </div>
            ))}
          </div>
        </div>

      </main>
    </div>
  );
}
