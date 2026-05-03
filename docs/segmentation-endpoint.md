# Segmentation Endpoint Contract

The frontend already accepts per-image segmentation geometry on generated variants. A Cloudflare Worker can return these `segments` in the same response as image generation, so every new remix can draw SAM-style boxes around the important areas of that specific image.

## Frontend Configuration

Set the deployed app build variable:

```bash
VITE_IMAGE_GENERATION_ENDPOINT=https://your-worker.your-subdomain.workers.dev/generate
```

The endpoint may generate the image, call a segmentation model, and return both the image and normalized segment boxes. If `segments` is missing, the prototype falls back to deterministic projected boxes so the UI remains usable.

## Request Shape

The app sends a `CreativeGenerationRequest` JSON payload. The `imagePrompt` object is the exact downstream generation prompt and context rendered in the Assistant observability box while generation is running. Its prompt text is assembled from the current canvas selection, image inputs, selected SAM segments, scalar values, staged scalar changes, saved ideas, trace state, and recent chat messages. Important fields for generation and segmentation:

```ts
{
  id: string
  model: "gpt-image-2" | string
  intent: "scalar-remix" | "idea-combine" | "segment-edit" | "image-blend"
  outputTitle: string
  sourceVariant: {
    id: string
    title: string
    image: string
    segments?: SegmentAnnotation[]
  }
  sourceIds: string[]
  imageInputs: Array<{
    id: string
    title: string
    url: string
    role: "source" | "reference"
    mediaType?: string
  }>
  selectedSegment: SegmentAnnotation
  scalars: AestheticScalar[]
  scalarChanges: ScalarGenerationChange[]
  chatContext: ChatMessage[]
  promptHints: string[]
  sceneDescription: {
    subject: string
    setting: string
    composition: string
    camera: string
    lighting: string
    color: string
    typography: string
  }
  imagePrompt: {
    prompt: string
    negativePrompt: string
    context: Array<{ label: string; value: string }>
    promptHints: string[]
  }
}
```

## Response Shape

Return as much as the Worker can produce. The app will fill missing optional fields.

```ts
{
  title?: string
  image?: string
  score?: number
  delta?: number
  filter?: string
  ingredients?: string[]
  sourceIds?: string[]
  promptSummary?: string
  segments?: SegmentAnnotation[]
}
```

Each segment should use percent coordinates relative to the rendered image:

```ts
{
  id: "emotion" | "resonance" | "product" | "cta" | string
  label: string
  x: number
  y: number
  width: number
  height: number
  delta: number
  suggestions: Array<{
    id: string
    label: string
    impact: number
  }>
}
```

## Recommended Worker Flow

1. Receive the generation request.
2. Use `imagePrompt.prompt` as the text prompt, `imagePrompt.negativePrompt` as the negative guardrail, and pass `imageInputs` as real image references/uploads to `gpt-image-2`.
3. Generate or fetch the new image.
4. Run segmentation/object localization on the generated image.
5. Map model output to the four product concepts the UI currently expects: emotional engagement, creative resonance, product placement, CTA.
6. Return the generated image plus normalized `segments`.

For true SAM masks, keep pixel masks server-side and return the bounding boxes for the prototype. The UI contract can later add polygon or mask URLs without changing the current interaction model.
