# Remix Prompt, Observability, Segmentation, And Fidelity Change Report

Last updated: 2026-05-04

This is the implementation report for the eight issues in `docs/remix-prompt-observability-and-fidelity-plan.md`.

Frontend commit:

- `50648ad` - `Fix remix observability and media sizing`

Worker commit:

- `0da3dd4` - `Return truthful generation trace metadata`

Deployments:

- Frontend GitHub Pages deploy completed on `main`.
- Cloudflare Worker deployed to `https://clv-image-worker.adam-rotmil.workers.dev`.
- Worker version: `2b0bcef0-3169-4da5-9a5b-a98912eb52e9`.

## 1. Composer Input Was Overstuffed

Before:

- The worker composer prompt included both the frontend prompt draft and the full deterministic `requestScaffold`.
- The scaffold repeated source DNA, preservation locks, scalar language, scene assembly, and debug labels.
- This made the composer behave too much like a pass-through formatter.

Changed:

- `clv-image-worker/src/index.ts`
  - Reworked `promptComposerText()` to use structured context instead of dumping the full request scaffold.
  - Kept the frontend prompt draft only as orientation text.
  - Explicitly excludes the debug request scaffold from composer input.
  - Adds structured fields for output frame, scalar translation, selected SAM segments, preservation locks, chat direction, and source-fidelity priorities.
  - Expanded the composer JSON schema to return:
    - `ontologyInterpretation`
    - `constraintPriorities`
    - `promptStrategy`
    - `conflictResolutions`
    - `warnings`
    - richer slider interpretation fields.

Result:

- The composer now receives structured creative context and is instructed to produce a concise human image-edit prompt.
- The deterministic scaffold is still available in frontend observability for debugging, but it is not fed wholesale into the composer.

## 2. Synthetic Observability Looked Like A Real Provider Request

Before:

- The frontend inserted an immediate synthetic `image_request`.
- That made deterministic local assembly look like a real completed provider event.

Changed:

- `clv-segmented/src/types.ts`
  - Extended `GenerationTraceEvent` with `origin`, `status`, `startedAt`, `completedAt`, `durationMs`, and `isSynthetic`.
- `clv-segmented/src/App.tsx`
  - Renamed the synthetic frontend payload to `generation_request_preview`.
  - Marks it with `origin=deterministic/frontend`, `status=preview`, and `synthetic=true`.
  - Keeps actual worker/provider events separate.
- `clv-image-worker/src/index.ts`
  - Emits real trace payloads for:
    - `generation_request`
    - `composer_prompt`
    - `composer_output`
    - `image_request`
    - `image_result`

Result:

- The trace now distinguishes local deterministic assembly from composer and provider work.
- Real provider requests are labeled only when the worker returns them.

## 3. Exact Provider Prompt Was Not Visible

Before:

- The UI showed `finalPrompt` and `negativePrompt` separately.
- The actual provider prompt sent to OpenAI Images was the two combined, but that byte-for-byte string was not exposed.

Changed:

- `clv-image-worker/src/index.ts`
  - Added `promptForImageModel()` as the single transformation from composer output to provider prompt.
  - Stores and returns:
    - `composerPrompt`
    - `composerPromptHash`
    - `providerPrompt`
    - `providerPromptHash`
    - `providerPromptMatchesRecipe`
    - redacted `providerRequest`.
  - The `image_request` trace includes the exact provider prompt and hash.
- `clv-segmented/src/types.ts`
  - Expanded `PromptRecipe` and source-fidelity evidence types for those fields.
- `clv-segmented/src/App.tsx`
  - The observability payload now includes:
    - exact composer prompt when returned by the worker
    - structured composer output
    - final image prompt
    - negative prompt
    - exact provider prompt
    - provider prompt hash
    - invariant showing whether provider prompt matches `finalPrompt + Negative guardrails`.

Result:

- You can now inspect and copy the exact prompt sent to the Images provider.
- The trace also shows how the final and negative prompts became the provider prompt.

## 4. Worker Hard-Coded Square Output

Before:

- The frontend could request and display `1024x1536`.
- The worker always sent `1024x1024` to OpenAI Images.

Changed:

- `clv-image-worker/src/index.ts`
  - Added `GenerationOutputFrame` and `OpenAIImageSize`.
  - Added `providerSizeForRequest()`.
  - Uses `request.outputFrame.modelSize` or `promptComposer.outputFrame.modelSize`.
  - Validates against supported sizes:
    - `1024x1024`
    - `1024x1536`
    - `1536x1024`
    - `auto`
  - Sends that size to `callOpenAIImages()` instead of hard-coding square output.
  - Returns `requestedModelSize`, `providerModelSize`, and any size fallback warning.
- `clv-segmented/src/App.tsx`
  - Exposes requested/provider size in observability.

Result:

- BYREDO portrait remixes now request portrait size from the worker instead of silently requesting square output.
- If a size fallback is ever needed, the worker reports it explicitly.

## 5. Generated Images Used Source Dimensions And `object-fit: cover`

Before:

- Generated variants inherited the source image media size.
- A square or different-aspect generated image could be drawn into a source-shaped frame.
- `.creative-card img` used `object-fit: cover`, which could crop the preview.

Changed:

- `clv-segmented/src/App.tsx`
  - Added `mediaSizeForGeneratedImage()`.
  - Uses `generation.mediaSize` when returned by the worker.
  - Falls back to reading image natural dimensions in the browser.
  - Falls back again to the requested model size if needed.
  - Stores the resolved media size on the generated variant and generation run.
  - Passes the same resolved size into segmentation requests.
  - Adds `canvasPreview` metadata to observability:
    - `rawImageSize`
    - `canvasNodeSize`
    - `displayFit`
    - `scaleFactor`
    - `cropPercent`
    - `sourceFramePolicy`
- `clv-segmented/src/generation.ts`
  - Carries endpoint `mediaSize`.
  - Mock generation now uses the requested model size.
- `clv-segmented/src/App.css`
  - Changed generated image rendering from `object-fit: cover` to `object-fit: contain`.

Result:

- Generated nodes now use actual or provider-reported output dimensions.
- The canvas preview reports its fit behavior instead of hiding crop/scale assumptions.

## 6. Selected Segments Were Mislabeled

Before:

- Observability appended all source segments into `selectedSegments`.
- If only `Emotional engagement` was selected, `resonance`, `product`, and `cta` could also appear selected.

Changed:

- `clv-segmented/src/App.tsx`
  - Reworked `observabilityPayloadDataForRequest()`.
  - Separates:
    - `availableSegments`
    - `selectedSegments`
    - `focusSegments`
    - `sourceSegments`
    - `projectedFallbackPreview`
  - `selectedSegments` now only reflects the actual selected/focus segments from the composer request.
  - Other source regions remain visible under source/available segment fields.

Result:

- Segment observability now matches the actual prompt focus.
- Unselected source regions no longer pollute the selected segment list.

## 7. SAM Logging Could Leak Data URLs And Base64

Before:

- The segmentation/SAM payload could include full `data:image/png;base64,...` URLs.
- This could dump binary image data into the text trace.

Changed:

- `clv-segmented/src/App.tsx`
  - Added `redactTraceImageRef()`.
  - Added recursive `redactTracePayload()`.
  - Redacts:
    - `data:image/*` URLs
    - `blob:` URLs
    - large base64-looking strings
    - image URL fields inside nested payloads.
  - Replaces binary refs with metadata:
    - `kind`
    - `mimeType`
    - `byteLength`
    - short hash
    - redacted preview label.
  - `formatTracePayload()` applies redaction before rendering JSON.
- `clv-image-worker/src/index.ts`
  - Added provider-side redaction helpers for image refs.
  - Worker traces redact image inputs and result image refs instead of dumping raw image data.

Result:

- Default observability no longer dumps raw base64/data URLs.
- The trace keeps enough metadata to identify which image was used.

## 8. Projected Segmentation Looked Like Real SAM

Before:

- The frontend could fall back to projected source boxes.
- Observability still used SAM-like language such as `sam_request`, which implied true model segmentation.

Changed:

- `clv-segmented/src/App.tsx`
  - Renamed fallback trace behavior:
    - endpoint segmentation uses `segmentation_request` / `segmentation_result`
    - projected fallback uses `segmentation_fallback`
  - The fallback payload now shows:
    - `provider: "mock"`
    - `toolName: "projected-fallback"`
    - `fallbackReason`
    - `projectedFallbackPreview`
    - final segments and raw redacted result.
  - The observability lane exposes semantic hints, selected segment IDs, actual media size, and fallback status.
- `clv-segmented/tests/prototype.spec.ts`
  - Updated the stale assertion from `sam_request` to `segmentation_fallback`.

Result:

- The app no longer labels projected fallback boxes as real SAM output.
- Real endpoint segmentation and projected fallback are visibly different in the trace.

## Additional Stability Changes

- Extended the `Images blended` toast duration because the larger observability payload can make the test path take longer than the old toast lifetime.
- Added a minimum visible streaming duration for simulated assistant replies so streaming state is observable and stable under full-suite load.
- Fixed worker provider request metadata so safety fallback generation reports the actual second provider request image list, not the original edit image list.

## Verification

Frontend:

```bash
npm run build
npm run test:e2e -- --reporter=line
```

Results:

- Build passed.
- Playwright passed: `44 passed`.

Worker:

```bash
npm test -- --run
npm run deploy
```

Results:

- Worker tests passed: `8 passed`.
- Cloudflare deploy succeeded.

Deployment confirmation:

- GitHub Pages workflow completed successfully for frontend `main`.
- Public app HTML loaded from `https://adamrotmil.github.io/clv-segmented/`.
- Deployed JS contains the new trace markers:
  - `generation_request_preview`
  - `segmentation_fallback`
  - `providerPromptInvariant`
  - `canvasPreview`

## Remaining Notes

- This work makes fallback segmentation truthful; it does not add a new SAM/SAM2 model endpoint.
- The worker is ready to log true endpoint segmentation distinctly when such an endpoint returns masks.
- The frontend worktree still contains pre-existing untracked docs/images that were not included in the commits for this implementation.
