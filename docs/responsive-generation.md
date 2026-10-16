# Responsive generator change

The default generator uses document flow for content. The explicit legacy Exact layout option remains a coordinate export. The backend AI prompt now follows the responsive layout policy instead of requiring fixed Figma dimensions.

These excerpts show the same sample hero, with inner typography and text shortened for readability. The browser check saves complete before/after markup in `test/artifacts/`.

Before:

```html
<div class="w-[1200px] max-w-full relative h-[400px]">
  <div class="absolute left-0 w-[520px] top-0 h-[300px] flex flex-col">
    <h1 class="text-[33px] xl:text-[60px]">Build something remarkable</h1>
    <!-- description and button -->
  </div>
  <div class="absolute left-[600px] w-[560px] top-0 h-[360px] im1"></div>
</div>
```

After:

```html
<section class="flex flex-col lg:flex-row gap-10 md:gap-16 lg:gap-20 min-w-0 w-full max-w-6xl">
  <section class="flex flex-col gap-3 md:gap-5 lg:gap-6 min-w-0 w-full max-w-full">
    <h1 class="text-3xl md:text-5xl lg:text-6xl font-inter font-bold leading-tight text-design-1">
      Build something remarkable
    </h1>
    <!-- description and button -->
  </section>
  <img
    class="min-w-0 w-full max-w-xl h-auto rounded-2xl object-cover"
    src="assets/images/photo.webp"
    width="560"
    height="360"
    alt="Product photo"
  />
</section>
```

The image's HTML dimensions reserve its intrinsic aspect ratio; fluid CSS controls its displayed size. The whole page sits inside the standard responsive container. Repeated cards use `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`; color/font tokens are in `tailwind.config.js`. The ZIP includes compiled Tailwind CSS and individual SVGs with preserved paint/gradient/mask IDs.

The sample was checked in headless Chrome at 375, 640, 768, 1024, 1280 and 1440px: document width matched viewport width, flow siblings did not overlap, the hero changed from column to row, and cards changed from one to two to three columns. Fonts were blocked during the offline check, so it also exercised fallback typography. Coordinate inference remains a heuristic for freeform designs; real designs should also be reviewed in the plugin preview.
