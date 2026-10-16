# Design to Tailwind

The Figma plugin generates HTML and Tailwind code locally. **Generate** builds the layout locally without an AI key. If dashboard logging is enabled and the backend access key is configured, it sends activity stages and generated markup to the backend. **Enhance with AI** is an optional, separate cleanup step. Preview loads Tailwind and Google Fonts; Prettier and JSZip are bundled into the plugin HTML, with no runtime CDN dependency. ZIP exports include compiled CSS and local images/icons, so their layout works without a CDN connection. Custom Google Fonts require an internet connection; otherwise the configured fallback font is used.

## Generate responsive code

1. Run `npm.cmd install` and `npm.cmd run build:plugin`, then import **this backend repository's** `plugin/manifest.json` through Figma > Plugins > Development. There is an older sibling `../plugin/` with the same plugin ID; re-import the manifest under `backend/plugin/` to use this version.
2. Select matching **mobile and desktop frames** together. Optionally include a tablet frame (maximum three frames, at different widths).
3. Keep **Responsive** enabled and click **Generate**.
4. Inspect Base, sm (640), md (768), lg (1024), xl (1280), and 2xl (1536) using the preview buttons or enter any width from 320 to 4096px. Copy the HTML body or full page.

Frames are sorted by width. Shared layers are matched by name and Figma node type within their parent, with a text-content fallback for text layers. The output contains one element per matched layer, mobile-first classes, and media rules for changing inline paints and effects. Classes change only at useful layout thresholds or supplied reference sizes; intermediate widths inherit the active layout. Single-frame spacing and typography use base/md/lg instead of manufacturing classes at every breakpoint. Page containers use `mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8`.

Use matching descriptive layer names (`Header`, `Hero`, `Photo`, etc.) and consistent section nesting. Auto Layout maps direction, alignment, wrapping, gaps and padding to flex/grid. Frames without Auto Layout group children by y-position into rows and sort each row by x-position. Normal content stays in flow; only explicitly named badges, overlays, floating controls and decorations can use coordinates. Repeated cards (by name or matching dimensions/child structure) become a responsive grid. FILL uses fluid sizing, HUG uses content sizing, and fixed layers use maximum widths with content-driven heights. Values close to the Tailwind scale are rounded to that scale. Image-only layers become fluid `img` elements; masks and layered image fills retain the existing raster/background path.

Unmatched layers appear only at their reference viewports and trigger a review message; repeated names are matched in order and also flagged. Different nesting, rich-text segmentation, and complex freeform compositions can need manual adjustment. Inspect the result before using it; deterministic inference cannot infer every design relationship.

Selecting one frame retains the existing single-frame generator. **Exact layout** is available for one frame; combining multiple frames requires Responsive mode.

Click **Download ZIP** after generation. If an automatic download is blocked, use the persistent **Save ZIP** link. If the preview stylesheet is missing, enter the backend access key to compile CSS through `/api/compile`; exporting no longer requires a styled preview. The ZIP contains `index.html`, `tailwind.config.js`, `assets/tailwind.css`, `assets/images/*.webp`, and `assets/icons/*.svg`. Repeated colors become stable `design-1`, `design-2`, etc. tokens, and font families are collected under `theme.extend`. HTML is formatted with the bundled Prettier. Full-page copying includes the same theme configuration inline. The downloaded page uses compiled CSS; after editing its classes, rebuild with `npx tailwindcss -c tailwind.config.js -i input.css -o assets/tailwind.css` (`input.css` is included in the ZIP; Tailwind v3 must be installed to rebuild).

## Verify

From this backend directory:

```powershell
npm.cmd install
npm.cmd run build:plugin
npm.cmd test
npm.cmd run test:browser
npm.cmd run dev
```

The browser check uses an installed Chrome; use `$env:BROWSER_CHANNEL = 'msedge'` for Edge. It generates a sample Figma payload, runs it through the actual plugin UI, formats the result, builds and extracts the ZIP, opens its `index.html` from disk, and checks 12 widths from 375 to 1920px, including either side of the major breakpoints. It asserts no horizontal scroll or overlapping flow siblings, correct hero direction/card columns, valid WebP bytes, and loaded SVG/image assets. It clicks Download ZIP and Save ZIP, verifies dashboard activity against a local Express backend, then removes the preview styles and confirms backend CSS compilation still produces a downloadable ZIP. Formatter/ZIP scripts are bundled; it does not depend on live CDN access or Figma. Artifacts are saved to `test/artifacts/`: `design.zip`, `export/index.html`, before/after HTML, viewport screenshots and measurements. Unit/integration tests also cover the dashboard, fix/log/health endpoints, viewport merging, overlay inference, theme tokens, SVG paints and protected AI assets. A live Figma session and an actual AI response still need manual verification.

See [the before/after hero example](docs/responsive-generation.md).

## Optional AI cleanup

1. Create a key at [Google AI Studio](https://aistudio.google.com/apikey). Do not paste it into chat, plugin code or GitHub.
2. Set `GEMINI_API_KEY` in **Vercel project > Settings > Environment Variables**, then redeploy. This replaces the former hardcoded Gemini credential. Rotate any previously committed key in AI Studio; deleting it from current code does not remove Git history.
3. The defaults are `GEMINI_MODEL=gemini-3.8-flash` and `GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite`. Both are listed with a limited free tier on [Google's API pricing page](https://ai.google.dev/gemini-api/docs/pricing). Availability and quotas depend on your project; paid projects can incur charges. Override these server variables to use a different available model.
4. Generate locally first. Open **Backend connection & optional AI settings** in the plugin, confirm the backend URL, and enter the backend access key (`PLUGIN_KEY`, separate from your Gemini API key).
5. Click **Enhance with AI**. Only this action exports screenshots. Dashboard logging sends markup separately when enabled. Multiple designs are labeled by viewport so the model can match mobile, tablet and desktop. Regenerate after editing the Figma frames, before requesting cleanup.
6. Inspect the result at every preview width. **Restore local code** returns to the original local generation. Failed, truncated, or asset-damaging responses do not replace your code.

Gemini uses `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`; the plugin calls your backend's `POST /api/refine`. Gemini credentials stay on the server. Free-tier design inputs may be used by Google to improve products; check Google's terms before sending private designs.

## Legacy backend

The repository root retains the existing Express backend (`src/`, `api/`, `package.json`, and `vercel.json`) so its deployment paths stay the same. Its fix and logging endpoints remain available for existing integrations. Backend configuration enables live generation/export logs, export CSS compilation when preview CSS is unavailable, and optional AI cleanup.

For the version tracked by Git, edit the files in this repository's `plugin/` folder and import its manifest in Figma. The older sibling `../plugin/` folder is outside this Git repository and is not included by Git commits.


## Backend activity and source structure

Enter the deployed backend URL and the server's `PLUGIN_KEY` in **Backend connection & optional AI settings**. Keep **Show Generate / ZIP activity and code on backend dashboard** enabled. These connection settings are remembered through Figma client storage. Click **Open dashboard** to inspect processing/done/error stages, elapsed time and generated code. A visible status line reports authentication/network errors; local layout generation still succeeds if logging is unavailable. The backend deployment must include this update for `/api/events` and `/api/compile` to exist. MongoDB persists activity across serverless instances; without it, only the current process's memory history is available.

- `plugin/code.js`: Figma tree traversal, layout inference, assets and semantic markup.
- `plugin/ui.source.html`: editable UI, responsive merge, activity reporting and ZIP export.
- `plugin/build.js`: bundles installed Prettier/JSZip into `plugin/ui.html` (generated, checked in, ready for Figma).
- `src/app.js`: dashboard and authenticated HTTP endpoints.
- `src/compile.js`: validates export theme tokens and compiles Tailwind v3 CSS.
- `src/models/Generation.js`: persists Generate, export, fix and AI activity.

Breakpoints are minimum widths: `sm` 640px, `md` 768px, `lg` 1024px, `xl` 1280px, `2xl` 1536px. Unprefixed classes apply from mobile upward; larger screens inherit them until a breakpoint overrides them. Responsive output does **not** need all five prefixes on every element. Viewport controls inspect the same HTML tree, not separate generated pages.
