# Design to Tailwind

Generate responsive HTML + Tailwind from Figma, then download a complete ZIP. The deterministic generator works without AI; an optional backend-only Gemini pass can conservatively polish responsive utilities.

## Run

From `backend/`:

```powershell
npm.cmd install
npm.cmd run build:plugin
npm.cmd run dev
```

For optional AI polish, set `GEMINI_API_KEY` directly in the hosting environment (for example, Vercel project environment variables). No `.env` file is used. Never place the key in plugin source or UI. `GEMINI_MODEL` defaults to `gemini-3.8-flash`.

Import `backend/plugin/manifest.json` in Figma > Plugins > Development. The build also synchronizes the top-level `plugin/` copy.
Open **Backend connection** in the plugin and set `http://localhost:3000` for local development, or your deployed backend HTTPS URL. The updated backend must be running for Generate and ZIP export.

For Vercel, set the project Root Directory to `backend` when deploying the outer repository (or `.` when deploying the backend repository itself). Keep its `vercel.json`: `includeFiles` explicitly bundles Tailwind's runtime `lib/css/preflight.css` and the dashboard HTML. Redeploy after changing this configuration; an existing deployment will still have the old function bundle.

## Generate and download

1. Select your mobile frame/section/component and click **Use selection as Mobile**. Select your desktop design and click **Use selection as Desktop**. The pair stays saved while you change the canvas selection. Alternatively, clear the saved pair, select both standalone designs together, and click Generate. Frames, Sections, Groups and component sets with two or three viewport variants are supported.
2. Keep **Responsive** enabled and click **Generate**.
3. Inspect mobile, sm (640), md (768), lg (1024), xl (1280), 2xl (1536), or enter a width from 320 to 4096px.
4. Click **Download ZIP**. Use **Save ZIP** if the automatic download is blocked.

The **Gemini** tab shows the backend/model connection state. After generation, add an optional focused instruction and click **Run Gemini polish**; successful output replaces the current Preview and Code results. The action is disabled with an explicit configuration message when the backend has no Gemini key.

The plugin reads the Figma tree and exports original vector icons and image bytes. It matches shared layers using names, text content, compatible component/instance types and sibling structure, combines references into one HTML tree, and encodes raster images as WebP. Repeated generic Figma names are paired in order rather than automatically reported as errors. Express cleans HTML utilities, optionally runs the server-side Gemini repair pass, compiles Tailwind CSS, and packages the ZIP. No Tailwind runtime CDN is needed. If AI is unavailable, too slow, or the layout exceeds its bounded input size, generation safely falls back to deterministic output.

ZIP contents: `index.html`, `assets/tailwind.css`, `assets/images/*.webp`, `assets/icons/*.svg`, `tailwind.config.js`, `input.css`, and `README.txt`. CSS and assets work from disk. Google Fonts need internet; system fallback fonts work offline. Rebuild edited classes with Tailwind v3 using the included config and input CSS.

## Responsive behavior

Accuracy is the default: spacing, font sizes, radii, fixed widths/heights and page padding retain their measured Figma values. Exact Tailwind scale equivalents are used when available; 17px stays 17px and 19px type stays 19px. Auto Layout retains flex direction, alignment, gaps, fixed/fill/hug sizing and wrapping. Free-positioned layers keep their original coordinates instead of being rearranged into inferred rows or grids.

For one selected design, **Responsive** uses normal document flow, flex/grid stacking and breakpoint utilities; **Exact layout** preserves the design's original pixel geometry. Supply mobile + desktop references for the most accurate adaptation between two intended layouts. A single fixed/freeform design still cannot reveal every unrelated phone-layout decision.

With two references, `sm` and `md` typography and spacing progressively interpolate between the measured mobile and desktop values; structural desktop changes start at `lg`, then carry through `xl` and `2xl` unless a later measured value changes them. On XL and wider screens the page can grow to the selected desktop design width instead of being capped at 1280px. A supplied tablet frame overrides inferred tablet values. Saved reference pairs automatically enable responsive output; clear them to generate an independent exact layout.

Use matching descriptive names and consistent nesting for shared layers. Unmatched layers are hidden outside their source viewport and flagged for review. Freeform compositions and different nesting can need manual adjustments. **Exact layout** exports one fixed frame; it cannot combine multiple references.

## Live dashboard

Click **Open dashboard**, or visit the backend root URL. The dashboard polls every two seconds without reloading the page. Select a run to see timestamped extraction/compilation/packaging stages, errors, duration, and generated HTML. Generate and export also log in the Express terminal. Optional plugin activity logging adds Figma-side stages; server generation/export are always logged.

No database is required locally. History is bounded to the latest 50 runs in process memory and resets on restart. For shared/persistent history across serverless instances, configure `MONGODB_URI` on the server. No credentials are hard-coded. The dashboard and endpoints have no authentication, so use a private deployment for private design data.

## Source and checks

- `plugin/code.js`: Figma traversal, inference and original asset extraction.
- `plugin/ui.source.html`: editable plugin UI, responsive reference merge and asset preparation.
- `plugin/build.js`: bundles Prettier into generated `plugin/ui.html`.
- `src/app.js`: Express generation, compile, export and activity endpoints.
- `src/dashboard.html`: live run list, stage timeline and code viewer.
- `src/export.js`: validates local asset paths, compiles CSS and creates ZIP files.

```powershell
npm.cmd test
npm.cmd run test:browser
```

Browser verification uses installed Chrome (`BROWSER_CHANNEL=msedge` selects Edge). It exercises the plugin UI against local Express, downloads and extracts the ZIP, verifies WebP/SVG assets, and checks the native desktop layout plus paired references from 375 to 1920px. A separate accuracy fixture compares original x/y positions, asymmetric padding, 17px gaps, fixed dimensions, image crop bounds, 19px type, 25px line height and a 7px radius against the browser output. Artifacts are written to `test/artifacts/`. A real Figma session is still needed to verify your own design.
