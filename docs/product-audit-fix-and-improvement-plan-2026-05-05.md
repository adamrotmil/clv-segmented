# Product Audit Fix And Improvement Plan

Last updated: 2026-05-05

This is the next-leg implementation plan for the CLV segmented creative editor. It turns the product audit into a practical roadmap for fixing the current weak spots without losing the speed of the prototype.

No code changes are included in this document. It is meant as a handoff for an implementation agent.

## Source Material Used

Existing docs and findings consulted:

- `docs/generation-endpoint.md`
- `docs/segmentation-endpoint.md`
- `docs/chat-endpoint.md`
- `docs/remix-prompt-observability-and-fidelity-plan.md`
- `edit-creative-bughunt-2026-05-03.md`
- Recent commit history through `879bf4d Harden Double Diamond workflow`

Primary code entry points observed:

- `src/App.tsx`
- `src/generation.ts`
- `src/segmentation.ts`
- `src/chat.ts`
- `src/scalars/ontology.ts`
- `src/scalars/translateScalars.ts`
- `tests/prototype.spec.ts`
- `.github/workflows/deploy-pages.yml`

## Executive Summary

The product is now past a simple clickable prototype. It has real generation, prompt provenance, segmentation, chat actions, scalar ontology, media sizing, and Double Diamond exploration behavior. The risk is that these production-like systems are still tightly coupled inside one large frontend surface and still rely on partial fallbacks.

The next work should focus on making the product trustworthy:

1. Make the model-backed paths explicitly real, configurable, and observable.
2. Remove or clearly label heuristic fallbacks.
3. Slim prompt inputs so the composer synthesizes instead of laundering frontend scaffolds.
4. Add regression coverage around the ambitious flows, especially Double Diamond.
5. Start decomposing the monolithic app code into smaller orchestration modules.

## Current High-Risk Issues

### 1. Double Diamond May Not Use A Faster Model Live

Current state:

- `src/App.tsx` defines `fastImageGenerationModel` from `VITE_FAST_IMAGE_GENERATION_MODEL`, falling back to `gpt-image-2`.
- `.github/workflows/deploy-pages.yml` does not pass `VITE_FAST_IMAGE_GENERATION_MODEL`.
- The Double Diamond rough pass may therefore use the same model as the final pass.

Why it matters:

- The user expects 10 rough explorations to be fast and inexpensive.
- If all 20 rough/development generations use the primary high-quality model, the feature may feel slow and expensive.

Plan:

1. Add `VITE_FAST_IMAGE_GENERATION_MODEL` to `.env.example`.
2. Add it to the GitHub Pages build environment in `.github/workflows/deploy-pages.yml`.
3. Surface the configured fast model in Double Diamond observability.
4. Add a runtime warning if Double Diamond is invoked and `fastImageGenerationModel === imageGenerationModel`.
5. Document expected model behavior in `docs/generation-endpoint.md`.

Acceptance criteria:

- Double Diamond rough/development requests clearly show the fast model.
- Final convergence clearly shows `gpt-image-2` or the configured high-quality model.
- The deployed build can receive the fast model from repository variables.

## 2. Double Diamond Downselection Is Heuristic, Not AI-Judged

Current state:

- `bestDoubleDiamondCandidates()` ranks by score, source fidelity status, and delta.
- No model inspects the 10 generated outputs to choose the best 3.
- No model inspects the 9 developed outputs to choose the final winner.

Why it matters:

- The feature promise is creative exploration and convergence.
- A purely numeric scorer can select a high-score but creatively dull output.

Plan:

1. Add a new backend or endpoint action for visual ranking.
2. Send compact references for candidates:
   - image
   - title
   - stage
   - direction
   - prompt summary
   - source-fidelity summary
   - ES score
3. Ask the judge model for structured output:
   - selected candidate ids
   - ranking rationale
   - risk notes
   - what should be preserved in the next stage
4. Use score/fidelity only as supporting evidence, not the primary selector.
5. Store ranking decisions in the request workflow metadata and observability.
6. Keep heuristic ranking as a labeled fallback only when the judge endpoint fails.

Suggested response shape:

```ts
type DoubleDiamondJudgeResult = {
  stage: "diverge-selection" | "final-selection"
  selectedCandidateIds: string[]
  rankings: Array<{
    candidateId: string
    rank: number
    rationale: string
    strengths: string[]
    risks: string[]
  }>
  summary: string
  provider: "endpoint" | "heuristic-fallback"
}
```

Acceptance criteria:

- Observability states whether downselection was model-judged or heuristic fallback.
- The selected 3 concepts include model-authored rationales.
- The final high-quality candidate includes a model-authored convergence rationale.

## 3. Prompt Composer Input Is Still Too Heavy

Current state:

- `buildImagePromptPacket()` creates both a readable image prompt and a large `requestScaffold`.
- Tests still assert large scaffold content in `tests/prototype.spec.ts`.
- `imagePrompt.prompt` concatenates prompt draft plus request scaffold for backward compatibility.

Why it matters:

- The composer receives too much repeated material.
- A verbose scaffold can over-weight locks and ontology copy.
- The image model should receive a concise, human-quality prompt, not telemetry.

Plan:

1. Preserve three distinct layers:
   - `composerInput`: structured context for the composer.
   - `composerOutput.finalPrompt`: generated creative prompt.
   - `providerPrompt`: exact prompt sent to the image model.
2. Stop treating `imagePrompt.prompt` as the canonical prompt.
3. Make the worker prefer `promptComposer` and ignore `imagePrompt.prompt` except for fallback compatibility.
4. Reduce `requestScaffold` in composer input:
   - keep source read
   - keep locks once
   - keep changed scalar interpretation
   - keep selected segment context
   - keep recent chat context
   - remove repeated full recipe and duplicated product/type/source blocks
5. Update tests away from asserting scaffold bloat and toward asserting:
   - composer prompt is visible
   - final image prompt is visible
   - provider prompt is visible
   - raw JSON is collapsed/redacted

Acceptance criteria:

- Typical image provider prompt is concise enough to read manually.
- User can copy the exact provider prompt.
- Composer genesis remains inspectable without dumping the whole scaffold into the main view.

## 4. Segmentation Depends Heavily On Endpoint Quality

Current state:

- `src/segmentation.ts` uses `/segment` if configured.
- Without it, the app projects existing or heuristic boxes.
- Projected boxes can drift, cover empty space, or not match new remixes.

Why it matters:

- Segmentation is now part of the creative workflow.
- Bad boxes produce bad focus regions, bad suggestions, and user mistrust.

Plan:

1. Require real endpoint segmentation for generated images in production mode.
2. Keep projected fallback only for local/mock/test mode.
3. Add clear UI state for fallback segmentation:
   - badge: `Projected fallback`
   - no implication that it is SAM or pixel-derived
4. Strengthen endpoint contract:
   - separate people into separate boxes
   - return tight boxes only
   - include confidence
   - include label source
   - include model reasoning summary
5. Add frontend validation:
   - reject boxes with excessive empty area if confidence is low
   - reject duplicate ids without suffixing
   - cap oversized semantic boxes except background
6. Add a segmentation debug view:
   - endpoint/fallback provider
   - confidence
   - label source
   - raw redacted result

Acceptance criteria:

- Generated remixes use pixel-derived boxes when endpoint is configured.
- Fallback boxes are visibly labeled as fallback.
- Clicking a segment uses the new image’s actual segment, not projected source geometry.

## 5. Segment Suggestions Need More Intelligence

Current state:

- Endpoint suggestions are supported by type.
- Fallback suggestions are hard-coded in `src/segmentation.ts`.
- The UI can apply a suggestion and generate a remix.

Why it matters:

- The user expects suggestions to be creative directions based on the actual image.
- Hard-coded suggestions feel generic and can mismatch the visual context.

Plan:

1. Move suggestion generation into the segmentation endpoint or a dedicated `/suggest-segments` path.
2. For each segment, ask the model to evaluate:
   - what is in the segment
   - what is working
   - what is weak
   - 3 distinct creative opportunities
3. Return suggestions with:
   - label
   - rationale
   - promptHint
   - responseHint
   - scalarAdjustments
   - estimated impact
   - preservation risk
4. Keep frontend fallback suggestions only as local/test fallback and label them.
5. When user clicks Apply:
   - adjust sliders from `scalarAdjustments`
   - add `promptHint` to the generation request
   - show assistant response from `responseHint`
   - generate the new remix
6. Avoid sending the flyout label as the full prompt.

Acceptance criteria:

- Suggestions differ by image and segment.
- Apply produces both slider movement and a prompt hint.
- Assistant response explains the strategy, not just the literal flyout label.

## 6. Chat Actions Can Silently Fall Back To Heuristics

Current state:

- `normalizeChatResponse()` uses endpoint content but falls back to local actions when endpoint actions are absent.
- The user may see a model-like response while the action came from local heuristics.

Why it matters:

- It blurs the distinction between AI intent and local fallback.
- A model response could accidentally trigger an action it did not select.

Plan:

1. Require endpoint-authored actions when endpoint response is present.
2. If endpoint response has content but no actions, do not graft fallback actions by default.
3. Add `actionSource`:
   - `endpoint`
   - `local-fallback`
   - `none`
4. In observability or chat debug, show which source chose the action.
5. Keep local fallback actions only when the endpoint is unavailable.
6. Add tests for natural paths:
   - compare two remixes
   - generate from a referenced remix
   - apply segment suggestion
   - blend two selected variants
   - ask why fallback happened

Acceptance criteria:

- Endpoint chat content cannot accidentally inherit local fallback actions.
- User-visible behavior stays natural, but debug trace is truthful.

## 7. Image Crop Repair Can Fail Silently

Current state:

- `prepareGeneratedImageForCanvas()` crops model output to the source frame when needed.
- If crop fails, it returns the raw generated image and media size without warning.

Why it matters:

- A crop failure can reintroduce tall-frame mismatch, hidden crop, or blur.
- The user will only see the visual artifact, not the failure reason.

Plan:

1. Return a structured preparation result:
   - image
   - mediaSize
   - rawMediaSize
   - cropApplied
   - cropRect
   - cropStatus
   - warnings
2. Store crop/prep metadata on the generation run.
3. Show crop status in observability.
4. Add a visible warning when crop fails for a non-source-aspect output.
5. Add tests:
   - source-aspect output does not crop
   - wider model bucket crops to visible source frame
   - crop failure is observable

Acceptance criteria:

- No silent media preparation fallback.
- User can tell whether the displayed bitmap is raw or source-frame-cropped.

## 8. `App.tsx` Is Too Large And Too Coupled

Current state:

- `src/App.tsx` is over 10,000 lines.
- It owns state, canvas layout, prompt packets, generation, segmentation, chat, Double Diamond, history, observability, and UI rendering.

Why it matters:

- Changes are increasingly risky.
- It is hard for agents to make scoped edits.
- Product behavior is spread across local closures rather than testable modules.

Plan:

Refactor in thin, low-risk slices:

1. Move prompt assembly to `src/prompting/`.
2. Move media/frame helpers to `src/media/`.
3. Move Double Diamond planning/orchestration helpers to `src/doubleDiamond/`.
4. Move observability payload formatting to `src/observability/`.
5. Move canvas arrangement helpers to `src/canvas/`.
6. Keep React state wiring in `App.tsx` until the helpers are stable.
7. Add unit tests for extracted pure functions before changing behavior.

Candidate modules:

```text
src/prompting/buildImagePromptPacket.ts
src/prompting/sourcePolicies.ts
src/media/outputFrame.ts
src/media/prepareGeneratedImage.ts
src/doubleDiamond/plans.ts
src/doubleDiamond/ranking.ts
src/observability/redaction.ts
src/observability/generationTrace.ts
```

Acceptance criteria:

- `App.tsx` decreases materially without behavior changes.
- Extracted modules have focused tests.
- Future feature edits touch fewer unrelated lines.

## 9. CI Does Not Gate Lint Or Playwright

Current state:

- GitHub Pages workflow runs `npm run build`.
- Local workflow often runs lint/build manually.
- Playwright suite exists but is not in deploy CI.

Why it matters:

- Visual and state regressions can ship.
- Double Diamond and chat regressions are currently manual.

Plan:

1. Add `npm run lint` before build in the deploy workflow.
2. Add a separate CI workflow for Playwright smoke tests.
3. Keep full Playwright optional if runtime is too high, but at minimum include:
   - app boots
   - remix generation mock path
   - segmentation fallback labels
   - chat compare/generate path
   - Double Diamond mock workflow
4. Upload Playwright traces on failure.
5. Decide whether deploy should depend on smoke tests immediately or after the suite is stable.

Acceptance criteria:

- Lint and build run on every push.
- At least one browser smoke workflow runs on PR/push.
- Double Diamond has committed regression coverage.

## 10. Double Diamond Needs First-Class Regression Coverage

Current state:

- Manual browser smoke tests passed.
- No committed test covers the Double Diamond flow.

Plan:

Add Playwright coverage:

1. Right-click Original Image.
2. Verify menu contains exactly one `Double Diamond`.
3. Click it.
4. Verify 10 rough placeholders appear.
5. Wait for all placeholders to resolve.
6. Verify total generated node count:
   - initial source nodes
   - 10 divergent concepts
   - 9 developed variants
   - 1 final convergence
7. Verify final selected node.
8. Verify observability includes:
   - `workflow.kind = double-diamond`
   - final stage
   - final high quality
   - final model
9. Verify assistant completion response.
10. Verify no console errors.

Acceptance criteria:

- Double Diamond cannot regress silently.
- Test runs in mock mode without hitting real image endpoints.

## 11. Responsive And Accessibility Debt Still Exists

Source: `edit-creative-bughunt-2026-05-03.md`.

Current observed issues include:

- hard page min-width
- chat composer offscreen on tablet/mobile
- artboards offscreen on mobile
- primary actions offscreen on narrow widths
- hard min-height clipping
- hidden file input first tab stop
- small interaction targets

Plan:

1. Create a responsive editor strategy instead of one-off CSS fixes:
   - desktop: current three-panel layout
   - tablet: collapsible sidebars
   - mobile: canvas-first tabbed mode
2. Remove global `body` min-width/min-height constraints once the responsive layout exists.
3. Keep primary actions inside visible viewport at all breakpoints.
4. Make hidden upload input `tabIndex={-1}`.
5. Increase hit targets while keeping compact visual styling.
6. Add Playwright viewport tests for:
   - 1440 desktop
   - 1024 tablet
   - 800 short laptop
   - 390 mobile

Acceptance criteria:

- At least one artboard is visible on mobile.
- Chat input is reachable.
- Header actions are reachable.
- Keyboard first tab lands on a visible control.

## 12. Artifact Scores And Draft Scores Can Be Confused

Source: `edit-creative-bughunt-2026-05-03.md`.

Current risk:

- Changing presets or draft scalars can make existing artifacts appear rescored/restyled before generation.

Plan:

1. Separate artifact score from draft projected score in state and UI labels.
2. Keep artboard score fixed until a generated/evaluated artifact exists.
3. Show draft score only in pending action summaries.
4. Add tests for preset selection:
   - existing artboard score stays fixed
   - pending projected score appears separately
   - `Remix Image` or `Generate from preset` appears.

Acceptance criteria:

- Users never see an existing image’s ES score mutate without a new evaluation/generation event.

## 13. Chat Intent Routing Needs Continued Hardening

Source: `edit-creative-bughunt-2026-05-03.md` and recent chat commits.

Current risk:

- Natural phrases like `compare Original Image and Remix 1` previously triggered generation because `Remix 1` was interpreted as an imperative.
- This has improved, but the route should be protected by tests and endpoint action rules.

Plan:

1. Treat `Remix N` as an entity reference by default.
2. Prioritize explicit compare/blend/select intents before generate intents.
3. Add tests for:
   - compare Original and Remix 1
   - compare selected images
   - remix Remix 2
   - make a new image based on Remix 2
   - blend Original and Remix 1
4. Ensure endpoint-authored actions win over local heuristics when present.

Acceptance criteria:

- Chat actions match user intent across common natural phrasing.

## Recommended Implementation Order

### Phase 1: Stabilize Truth And Tests

1. Add CI lint step.
2. Add Playwright Double Diamond smoke test.
3. Add chat intent smoke tests.
4. Add media crop observability test.
5. Add segmentation provider/fallback labeling test.

Why first:

- The next phases touch important behavior. We need guardrails before deeper refactors.

### Phase 2: Configure And Expose Real Model Paths

1. Add `VITE_FAST_IMAGE_GENERATION_MODEL`.
2. Add deploy variable wiring.
3. Show fast/final model distinction in Double Diamond trace.
4. Add runtime warning when fast model equals final model.

Why second:

- This is low-risk and directly fixes a major product promise issue.

### Phase 3: Make Double Diamond Truly Judged

1. Add judge endpoint contract.
2. Implement model-based diverge downselection.
3. Implement model-based final selection.
4. Store selection rationales.
5. Keep heuristic fallback labeled.

Why third:

- Double Diamond is a flagship feature. It should feel intelligent, not merely procedural.

### Phase 4: Segment And Suggest With Real Intelligence

1. Require/verify pixel-derived segmentation in production.
2. Label fallback segmentation more strongly.
3. Move suggestions to model-generated endpoint output.
4. Apply suggestions through slider deltas plus prompt hints.
5. Add suggestion apply tests.

Why fourth:

- Better segmentation and suggestions improve every downstream remix path.

### Phase 5: Slim The Prompt Pipeline

1. Separate `composerInput`, `composerOutput`, and `providerPrompt`.
2. Remove repeated scaffold blocks from composer input.
3. Update observability around prompt genesis.
4. Update tests away from scaffold-string assertions.

Why fifth:

- This is high impact but riskier. It should happen after tests and endpoint truth are stronger.

### Phase 6: Media Fidelity And Canvas Reliability

1. Make crop prep structured and observable.
2. Add warnings for crop/prep failures.
3. Verify source aspect and 100% pixel paths.
4. Add snapshot or geometry tests for tall source assets.

Why sixth:

- Framing quality is core to trust, but recent fixes reduced urgency. This phase makes the fix robust.

### Phase 7: Refactor The Monolith

1. Extract pure helpers first.
2. Add tests around extracted helpers.
3. Avoid changing behavior during extraction.
4. Defer state architecture refactors until helpers are stable.

Why seventh:

- Refactor after behavior is covered; otherwise the app is too easy to destabilize.

### Phase 8: Responsive And Accessibility Pass

1. Choose responsive editor structure.
2. Fix min-width/min-height.
3. Fix keyboard and hit target issues.
4. Add viewport tests.

Why eighth:

- Important, but less blocking for current desktop creative flow than model/prompt/segmentation truth.

## Suggested Work Tickets

### Ticket A: Wire Fast Image Model

Files:

- `.env.example`
- `.github/workflows/deploy-pages.yml`
- `src/App.tsx`
- `docs/generation-endpoint.md`

Deliverables:

- fast model env var documented and deployed
- Double Diamond trace shows fast model vs final model
- warning if same model is used for both

### Ticket B: Add Double Diamond Regression Test

Files:

- `tests/prototype.spec.ts` or new `tests/double-diamond.spec.ts`

Deliverables:

- right-click menu test
- full mock workflow test
- final observability and assistant completion assertions

### Ticket C: Add Double Diamond Judge Contract

Files:

- `docs/generation-endpoint.md`
- possibly new `docs/double-diamond-endpoint.md`
- `src/types.ts`

Deliverables:

- structured judge request/response types
- frontend support for model-judged and heuristic-fallback selection

### Ticket D: Segment Suggestions From Vision

Files:

- `docs/segmentation-endpoint.md`
- `src/segmentation.ts`
- `src/App.tsx`
- tests

Deliverables:

- endpoint suggestions preserved
- fallback suggestions labeled
- apply path uses responseHint, promptHint, scalarAdjustments

### Ticket E: Chat Action Source Truth

Files:

- `src/chat.ts`
- `src/types.ts`
- `src/App.tsx`
- `docs/chat-endpoint.md`
- tests

Deliverables:

- endpoint actions are not silently replaced
- actionSource visible in debug trace
- natural intent tests

### Ticket F: Crop Preparation Metadata

Files:

- `src/App.tsx`
- candidate new `src/media/prepareGeneratedImage.ts`
- `src/types.ts`
- tests

Deliverables:

- structured crop prep metadata
- observability display
- warning on crop failure

### Ticket G: Prompt Pipeline Slimming

Files:

- `src/App.tsx`
- candidate new `src/prompting/*`
- `src/generation.ts`
- `docs/generation-endpoint.md`
- tests

Deliverables:

- composer input and final provider prompt are distinct
- repeated scaffold blocks reduced
- exact provider prompt copyable

### Ticket H: CI Hardening

Files:

- `.github/workflows/deploy-pages.yml`
- candidate new `.github/workflows/ci.yml`

Deliverables:

- lint in deploy workflow
- Playwright smoke workflow
- trace artifact upload on failure

### Ticket I: App Decomposition

Files:

- `src/App.tsx`
- new feature modules

Deliverables:

- pure helper modules extracted
- unit or Playwright coverage retained
- no behavior change

### Ticket J: Responsive Editor Follow-Up

Files:

- `src/App.css`
- `src/App.tsx`
- tests

Deliverables:

- mobile/tablet strategy implemented
- first tab stop visible
- primary actions visible
- viewport tests pass

## Product-Level Acceptance Criteria

The next major milestone should be considered complete when:

1. A user can run Double Diamond and see whether rough passes used the fast model.
2. Double Diamond selections are model-judged or clearly marked heuristic fallback.
3. A generated remix has truthful observability from request through composer, provider, media prep, and segmentation.
4. Segment boxes are pixel-derived in production or visibly marked projected fallback.
5. Segment suggestions are context-aware and model-authored when endpoint is available.
6. Applying a suggestion adjusts sliders, adds a prompt hint, produces an assistant strategy response, and generates a remix.
7. Chat model responses do not silently inherit local heuristic actions.
8. Cropping/media preparation cannot fail silently.
9. CI catches basic regressions before deploy.
10. The most ambitious flows have committed Playwright coverage.

## Notes For The Next Agent

- Do not try to solve everything in one patch. Start with tests and configuration.
- Preserve the existing user-facing flow while making provenance more truthful.
- Be careful with existing untracked files in this workspace; inspect status before staging.
- Prefer adding explicit metadata over inferring from strings in observability.
- Keep the model-backed path and fallback path visually and structurally separate.
- When in doubt, optimize for user trust: show what was actually sent, what actually returned, and what was guessed locally.
