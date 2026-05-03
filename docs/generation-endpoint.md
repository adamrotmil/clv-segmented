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
3. Call `gpt-image-2` with the composer-authored final prompt.
4. Return the image and the composer metadata for observability.
5. Run segmentation from `/segment` after the image returns, or let the frontend call `/segment` as it does today.

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

## Observability

The Assistant panel shows a live stream from the generation request:

- `vision`: source-image read and visual DNA
- `prompt`: composer request/output and final prompt tokens
- `image`: final prompt sent to `gpt-image-2`
- `sam`: segmentation request and result summary

Raw composer request/output sections are expandable so the visible stream can stay compact while still exposing the full prompt inputs for debugging.
