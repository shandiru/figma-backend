# Accurate design conversion

Generated code preserves the selected Figma design before applying viewport changes. The generator no longer rounds nearby values onto the Tailwind scale or adds a standard page container with invented padding.

- A 901px page stays capped at 901px, with its original 37px left and 29px right padding.
- A 17px Auto Layout gap becomes `gap-[17px]`.
- 19px typography with a 25px line height becomes `text-[19px] leading-[25px]`.
- Fixed 31px decorations, 7px radii and 147x83 image boxes retain those measurements.
- Free-positioned layers retain coordinates within a positioned parent. Auto Layout stays in flow with its original fixed/fill/hug behavior.

For one design, check the preview at its native frame width. For responsive output, save mobile and desktop references (or select both together). Matching combines their measured layouts, with tablet typography/spacing interpolated between them. Different nesting and unmatched layers still need review.

`npm.cmd run test:browser` saves `test/artifacts/accuracy-measurements.json` and `accuracy-plugin.png`, alongside ZIP, native-layout and paired-reference artifacts. These verify the controlled fixtures; a user's own design still needs visual comparison in Figma.
