# Design to Tailwind

Generate responsive HTML + Tailwind from Figma, then download a complete ZIP. No AI service or API/access keys are used.

## Run

From `backend/`:

```powershell
npm.cmd install
npm.cmd run build:plugin
npm.cmd run dev
```

Import `backend/plugin/manifest.json` in Figma > Plugins > Development. The build also synchronizes the top-level `plugin/` copy.
Open **Backend connection** in the plugin and set `http://localhost:3000` for local development, or your deployed backend HTTPS URL. The updated backend must be running for Generate and ZIP export.

For Vercel, set the project Root Directory to `backend` when deploying the outer repository (or `.` when deploying the backend repository itself). Keep its `vercel.json`: `includeFiles` explicitly bundles Tailwind's runtime `lib/css/preflight.css` and the dashboard HTML. Redeploy after changing this configuration; an existing deployment will still have the old function bundle.

## Generate and download

1. Select a desktop frame, or select matching mobile + desktop frames together. A tablet reference is optional (up to three different widths).
2. Keep **Responsive** enabled and click **Generate**.
3. Inspect mobile, sm (640), md (768), lg (1024), xl (1280), 2xl (1536), or enter a width from 320 to 4096px.
4. Click **Download ZIP**. Use **Save ZIP** if the automatic download is blocked.

The plugin reads the Figma tree and exports original vector icons and image bytes. It matches shared layers by name/type, combines references into one HTML tree, and encodes raster images as WebP. Express cleans HTML utilities, compiles Tailwind CSS, and packages the ZIP. No Tailwind runtime CDN or model call is needed.

ZIP contents: `index.html`, `assets/tailwind.css`, `assets/images/*.webp`, `assets/icons/*.svg`, `tailwind.config.js`, `input.css`, and `README.txt`. CSS and assets work from disk. Google Fonts need internet; system fallback fonts work offline. Rebuild edited classes with Tailwind v3 using the included config and input CSS.

## Responsive behavior

Auto Layout maps to flex/grid. Coordinate layouts are grouped into flow rows; repeated cards become one/two/three-column grids. Typography and spacing adapt at useful thresholds. A phone + desktop card grid receives a two-column tablet step; a supplied tablet reference takes priority. Larger viewports inherit styles until an override is needed, so every element does not need every breakpoint prefix.

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

Browser verification uses installed Chrome (`BROWSER_CHANNEL=msedge` selects Edge). It exercises the plugin UI against local Express, downloads and extracts the ZIP, verifies WebP/SVG assets, and checks overflow/overlap at 12 widths from 375 to 1920px. Artifacts are written to `test/artifacts/`. A real Figma session is still needed to verify your own design.
