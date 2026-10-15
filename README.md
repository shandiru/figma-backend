# Design to Tailwind

The Figma plugin generates HTML and Tailwind code locally. **Generate** does not call a backend or AI service and requires no API key. **Enhance with AI** is an optional, separate cleanup step. The preview and full-page export still load Tailwind's CDN and Google Fonts.

## Generate responsive code

1. Import `plugin/manifest.json` through Figma > Plugins > Development.
2. Select matching **mobile and desktop frames** together. Optionally include a tablet frame (maximum three frames, at different widths).
3. Keep **Responsive** enabled and click **Generate**.
4. Inspect Base, sm (640), md (768), lg (1024), xl (1280), and 2xl (1536) using the preview buttons. Copy the HTML body or full page.

Frames are sorted by width. Shared layers are matched by name and Figma node type within their parent, with a text-content fallback for text layers. The output contains one element per matched layer, mobile-first classes, and media rules for changing inline paints and effects. Type and spacing are interpolated at intermediate breakpoints; larger widths inherit the final design styles unless another change is needed. The widest frame sets the root maximum width.

Use matching descriptive layer names (`Header`, `Hero`, `Photo`, etc.) and consistent section nesting. Auto Layout gives the best results. Unmatched layers appear only at their reference viewports and trigger a review message; repeated names are matched in order and also flagged. Different nesting, rich-text segmentation, and arbitrary absolute-positioned designs can need manual adjustment. Inspect the result before using it; deterministic matching cannot infer every design relationship.

Selecting one frame retains the existing single-frame generator. **Exact layout** is available for one frame; combining multiple frames requires Responsive mode.

## Verify

Run `npm test` from the repository root (`npm.cmd test` in PowerShell if script execution is disabled). Tests cover merging, responsive typography, SVG paint/gradient/mask preservation, AI request construction, asset protection and truncated output. They use DOM/Figma fixtures and a mocked model API; visual verification in Figma and a live AI request with your configured key are still required.

## Optional AI cleanup

1. Create a key at [Google AI Studio](https://aistudio.google.com/apikey). Do not paste it into chat, plugin code or GitHub.
2. Set `GEMINI_API_KEY` in **Vercel project > Settings > Environment Variables**, then redeploy. This replaces the former hardcoded Gemini credential. Rotate any previously committed key in AI Studio; deleting it from current code does not remove Git history.
3. The defaults are `GEMINI_MODEL=gemini-3.8-flash` and `GEMINI_FALLBACK_MODELS=gemini-3.5-flash-lite`. Both are listed with a limited free tier on [Google's API pricing page](https://ai.google.dev/gemini-api/docs/pricing). Availability and quotas depend on your project; paid projects can incur charges. Override these server variables to use a different available model.
4. Generate locally first. Open **Optional AI settings** in the plugin, confirm the backend URL, and enter the backend access key (`PLUGIN_KEY`, separate from your Gemini API key).
5. Click **Enhance with AI**. Only this action exports screenshots and sends screenshots/markup to the backend. Multiple designs are labeled by viewport so the model can match mobile, tablet and desktop. Regenerate after editing the Figma frames, before requesting cleanup.
6. Inspect the result at every preview width. **Restore local code** returns to the original local generation. Failed, truncated, or asset-damaging responses do not replace your code.

Gemini uses `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`; the plugin calls your backend's `POST /api/refine`. Gemini credentials stay on the server. Free-tier design inputs may be used by Google to improve products; check Google's terms before sending private designs.

## Legacy backend

The repository root retains the existing Express backend (`src/`, `api/`, `package.json`, and `vercel.json`) so its deployment paths stay the same. Its fix and logging endpoints remain available for existing integrations. Backend configuration is unnecessary for local generation and required only for optional AI cleanup.

For the version tracked by Git, edit the files in this repository's `plugin/` folder and import its manifest in Figma. The older sibling `../plugin/` folder is outside this Git repository and is not included by Git commits.
