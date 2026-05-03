# Generation Endpoint Contract

The image generation endpoint is responsible for composing the final model prompt server-side before calling the image model. The frontend sends intent, selected canvas context, slider recipes, SAM context, chat direction, and preservation locks. The Worker should use that packet as structured input, not as the final creative prompt.

## Frontend Configuration

Set this public build variable for GitHub Pages:

```bash
VITE_IMAGE_GENERATION_ENDPOINT=https://your-worker.your-subdomain.workers.dev/generate
```

Do not expose provider keys in the frontend. Keep OpenAI keys in the Worker or backend service.

## Request Shape

The app sends a `CreativeGenerationRequest` payload. The important server-facing field is `promptComposer`:

```ts
{
  id: string
  intent: "scalar-remix" | "segment-remix" | "chat-remix" | "blend" | "delta-remix"
  model: "gpt-image-2"
  sourceVariant: ImageVariant
  sourceIds: string[]
  imageInputs: ImageInputReference[]
  scalars: AestheticScalar[]
  scalarChanges: ScalarGenerationChange[]
  selectedSegment: SegmentAnnotation
  selectedSegments: SegmentAnnotation[]
  chatContext: ChatMessage[]
  imagePrompt: {
    promptDraft: string
    requestScaffold: string
    prompt: string
    negativePrompt: string
    context: ImagePromptContextItem[]
    promptHints: string[]
  }
  promptComposer: {
    requestId: string
    intent: CreativeGenerationIntent
    outputTitle: string
    model: "gpt-image-2"
    composerModel: string
    sourceVariantId: string
    sourceIds: string[]
    imageInputs: ImageInputReference[]
    scalars: AestheticScalar[]
    scalarChanges: ScalarGenerationChange[]
    selectedSegments: SegmentAnnotation[]
    chatContext: ChatMessage[]
    promptDraft: string
    requestScaffold: string
    systemHints: string[]
    preservation: {
      product: string
      copy: string
      typography: string
    }
  }
}
```

`imagePrompt.prompt` remains for backward compatibility. Treat `promptComposer.promptDraft` and `promptComposer.requestScaffold` as source material for the composer LLM.

## Server Pipeline

Use an orchestrated `POST /generate` endpoint:

1. Build a prompt-composer call from `promptComposer`.
2. Use a multimodal model to inspect the source image inputs and write a final creative prompt.
3. Call the image edit route with `gpt-image-2`, the composer-authored final prompt, and actual image bytes for the source/reference images.
4. Retry the edit route with stricter preservation language if the first edit fails or safety blocks.
5. Only enter text-to-image fallback when the Worker explicitly reports `providerMode: "safety-retry-generation"`.
6. Run a post-generation critic for product, copy, typography, identity, and source relation.
7. Return the image, composer metadata, source-fidelity verdict, and evidence for observability.
8. Run segmentation from `/segment` after the image returns, or let the frontend call `/segment` as it does today.

Normal remix requests must not silently use text-to-image generation. If the source image is not attached to the image model call, the Worker should return a warning or failure state rather than a normal passed remix.

## Composer Rules

The composer should:

- inspect the source image before writing the final prompt
- preserve the exact product identity for normal remixes
- preserve exact copywriting unless blending sources with different copy
- preserve typography family, weight, hierarchy, and placement logic
- convert scalar values into natural language instructions
- use midpoint scalar recipes for blends
- change only the qualities implied by sliders, segment edits, and recent chat direction

## Response Shape

Return JSON:

```ts
{
  providerMode: "image-edit" | "image-edit-retry" | "safety-retry-generation" | "failed"
  image: string
  score?: number
  delta?: number
  title?: string
  filter?: string
  ingredients?: string[]
  sourceIds?: string[]
  finalPrompt?: string
  negativePrompt?: string
  visualRead?: string
  composerModel?: string
  sourceFidelity: {
    status: "passed" | "warning" | "failed"
    productLock: "passed" | "warning" | "failed"
    copyLock: "passed" | "warning" | "failed"
    typographyLock: "passed" | "warning" | "failed"
    identityLock: "passed" | "warning" | "failed"
    sourceRelation: "passed" | "warning" | "failed"
    notes: string[]
    evidence: {
      endpoint: "/v1/images/edits" | "/v1/images/generations" | string
      model: "gpt-image-2" | string
      imageInputCount: number
      imageInputRoles: string[]
      imageTokens?: number
      textTokens?: number
      totalTokens?: number
      retryCount?: number
      fallbackReason?: string
    }
    confidence?: "high" | "medium" | "low"
    mode?: "source-preserving-edit" | "fallback-generation"
    summary?: string
    checks?: Array<{
      id: "generation" | "source-edit" | "product-lock" | "copy-lock" | "type-lock" | "identity-lock" | "slider-intent"
      label: string
      status: "passed" | "needs-review" | "failed" | "not-run"
      detail: string
    }>
    warnings?: string[]
    critic?: {
      status: "passed" | "needs-review" | "failed" | "not-run"
      summary: string
      issues?: string[]
    }
  }
  promptRecipe?: {
    visualRead: string
    finalPrompt: string
    negativePrompt: string
    composedAt: string
    model: string
    preservationLocks?: {
      product?: string
      copy?: string
      typography?: string
    }
    sliderInterpretation?: Array<{
      id: string
      label: string
      value: number
      instruction: string
    }>
    observability?: Array<{
      lane: "vision" | "prompt" | "image" | "sam" | "context"
      text: string
    }>
  }
}
```

`promptRecipe` is preferred. If the endpoint only returns top-level `finalPrompt`, `negativePrompt`, `visualRead`, `composerModel`, and `observability`, the frontend will normalize those into a stored prompt recipe.

`sourceFidelity` should be treated as required for production. The frontend will still render endpoint images without it, but it will mark source fidelity as unverified. A passing remix needs `providerMode: "image-edit"` or `"image-edit-retry"`, `evidence.endpoint` for the image edit route, at least one attached image input, and passing lock checks.

## Image Edit Requirement

The Worker is the source-fidelity authority. For `scalar-remix`, `segment-edit`, and source-preserving chat remixes:

- fetch or receive bytes for `imageInputs[0]`
- attach the source image to the image edit request as the primary image
- attach product crops, typography/copy crops, and typeface reference samples when present
- call the image edit route with `model: "gpt-image-2"`
- record the ordered input roles in `sourceFidelity.evidence.imageInputRoles`
- record image-token usage in `sourceFidelity.evidence.imageTokens` when the provider exposes it

Conceptual Worker call:

```ts
const result = await openai.images.edit({
  model: 'gpt-image-2',
  image: [
    sourceImageFile,
    productCropFile,
    typographyCropFile,
    helveticaRegularReference,
    helveticaBoldReference,
  ].filter(Boolean),
  prompt: promptRecipe.finalPrompt,
  quality: 'high',
  size: outputSizeForSourceAspect,
})
```

If using a Responses API image tool instead, force edit behavior and fail closed if no image input is present. The important product rule is the same: a source-preserving remix must have real image inputs in the downstream image call.

## Observability

The Assistant panel shows a live stream from the generation request:

- `vision`: source-image read and visual DNA
- `prompt`: composer request/output and final prompt tokens
- `image`: endpoint, model, source image count, image-token evidence, and final prompt sent to `gpt-image-2`
- `sam`: segmentation request and result summary

Raw composer request/output sections are expandable so the visible stream can stay compact while still exposing the full prompt inputs for debugging.
