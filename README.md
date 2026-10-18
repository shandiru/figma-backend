# Design to Tailwind

Generate one responsive HTML + Tailwind page from exactly two selected Figma frames: Mobile and Desktop. Each frame is rendered independently with its measured geometry, so the source layouts are not merged, guessed, or rewritten. There is no AI pass.

## Run

From `backend/`:

```powershell
npm.cmd install
npm.cmd run build:plugin
npm.cmd run dev
```

Import `backend/plugin/manifest.json` in Figma > Plugins > Development. The build also synchronizes the top-level `plugin/` copy.

Open **Backend connection** in the plugin and set `http://localhost:3000` for local development, or your deployed backend HTTPS URL. The backend must be running for Generate and ZIP export.

For Vercel, set the project Root Directory to `backend` when deploying the outer repository (or `.` when deploying the backend repository itself). Keep its `vercel.json`; it bundles Tailwind's preflight CSS and the dashboard HTML.

## Generate and download

1. Select exactly two matching Frames, Sections, Components, Instances, or Groups in Figma: a narrower Mobile design and a wider Desktop design.
2. Click **Generate**.
3. Use the Mobile and Desktop preview buttons to inspect both exact layouts, or open the Code tab.
4. Copy the body/full page, or click **Download ZIP**.

The generator preserves measured x/y positions, widths, heights, padding, gaps, typography, colors, radii, image crops, vectors, Auto Layout properties, and free-positioned layers in both trees. Exact Tailwind scale equivalents are used when available; arbitrary values retain measurements such as 17px gaps, 19px type, or 7px radii.

The mobile tree is visible below the `lg` breakpoint and the desktop tree from `lg` upward. Only one exact tree is visible at a time.

ZIP contents: `index.html`, `assets/tailwind.css`, `assets/images/*.webp`, `assets/icons/*.svg`, `tailwind.config.js`, `input.css`, and `README.txt`. CSS and assets work from disk. Google Fonts need internet; system fallback fonts work offline.

## Live dashboard

Click **Open dashboard**, or visit the backend root URL. The dashboard shows extraction, exact compilation, packaging stages, errors, duration, and generated HTML. No database is required locally. Configure `MONGODB_URI` only when persistent shared history is needed.

## Source and checks

- `plugin/code.js`: exact Figma traversal and asset extraction.
- `plugin/ui.source.html`: editable plugin UI and asset preparation.
- `plugin/build.js`: bundles Prettier into generated `plugin/ui.html`.
- `src/app.js`: Express generation, compilation, export and activity endpoints.
- `src/dashboard.html`: live run list, stage timeline and code viewer.

```powershell
npm.cmd test
npm.cmd run test:browser
```
