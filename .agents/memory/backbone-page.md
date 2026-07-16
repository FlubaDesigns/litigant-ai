---
name: Backbone layout reference
description: Backbone.tsx is the canonical layout template for all pages — the pattern every page must follow
---

The canonical layout reference is at `artifacts/gh-brain/src/pages/Backbone.tsx`.

**Pattern:**
```jsx
<div className="app-page">
  <SiteHeader variant="app" />
  <main>
    <div className="row">...</div>
    <div className="row">...</div>
  </main>
  <SiteFooter variant="app" />
</div>
```

**Rules:**
- Root element is `div.app-page` (flex-col, min-h-screen, flex:1 on > main)
- Header and footer are INSIDE app-page, not in a separate layout wrapper
- Content lives in `<main>` → `.row` divs directly (no extra wrappers)
- Full-width pages: rows go directly in main (NO .main-inner)
- Guttered/max-width pages: use `.main-inner` inside rows
- Session page is full-width — NO .main-inner

**Why:** Session page was losing height and width because it was wrapped in AppLayout's extra `<main>` creating a double-main structure that broke flex height propagation.

**How to apply:** Every new app page must start from Backbone.tsx pattern. Search "backbone" to find this file before building any new page.
