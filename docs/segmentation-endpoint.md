# Segmentation Endpoint Contract

Segmentation is a separate stage from image generation. The frontend renders a generated or imported image as soon as it is available, sets the variant to `segmentationStatus: "segmenting"`, and only renders segment boxes after `/segment` returns.

If no segmentation endpoint is configured, the app uses projected fallback boxes marked as `source: "projected"` and `labelSource: "heuristic"`. Those fallback boxes are intentionally not presented as real SAM masks.

The bundled Cloudflare Worker now calls OpenAI vision localization from `/segment` and returns pixel-derived boxes marked as `source: "vision"` and `labelSource: "vision"`. This gives the app real per-image boxes without adding another secret. If you later connect SAM/SAM2, return `source: "sam"` and optional `mask` data in the same shape.

## Frontend Configuration

Set either endpoint variable in the deployed app build:

```bash
VITE_IMAGE_GENERATION_ENDPOINT=https://your-worker.your-subdomain.workers.dev/generate
VITE_IMAGE_SEGMENTATION_ENDPOINT=https://your-worker.your-subdomain.workers.dev/segment
```

If `VITE_IMAGE_SEGMENTATION_ENDPOINT` is omitted and `VITE_IMAGE_GENERATION_ENDPOINT` ends in `/generate`, the frontend derives the sibling `/segment` URL.

## Variant State

Generated and imported variants use explicit segmentation state:

```ts
type ImageVariant = {
  segments?: SegmentAnnotation[]
  segmentationStatus?: "idle" | "segmenting" | "ready" | "failed"
  segmentationError?: string
}
```

While `segmenting`, the canvas shows the image plus a scanning overlay and does not render segment boxes. On failure, the image remains visible and segment boxes stay hidden unless a fallback response explicitly returns projected annotations.

## Request Shape

```ts
POST /segment
{
  "variantId": "remix-123",
  "requestId": "remix-123",
  "imageUrl": "https://...",
  "imageWidth": 1024,
  "imageHeight": 1024,
  "semanticHints": [
    "face",
    "headline copy",
    "product",
    "CTA",
    "body",
    "background"
  ],
  "context": {
    "title": "Remix 2",
    "sourceVariantId": "updated",
    "generationIntent": "scalar-remix",
    "selectedSegmentLabel": "Emotional engagement"
  }
}
```

## Response Shape

```ts
{
  "variantId": "remix-123",
  "toolName": "openai.vision-localization",
  "semanticHints": ["face", "product", "CTA"],
  "segments": [
    {
      "id": "emotion",
      "label": "Emotional engagement",
      "x": 62.4,
      "y": 7.2,
      "width": 22.1,
      "height": 20.8,
      "confidence": 0.91,
      "source": "vision",
      "labelSource": "vision",
      "delta": 7,
      "suggestions": []
    }
  ],
  "rawPayload": {}
}
```

Coordinates are percentages relative to the rendered image. `mask` is optional; the current UI renders boxes but keeps the type ready for polygon or RLE masks.

The frontend now sends explicit localization instructions in `context.analysisInstructions`. The endpoint should:

- inspect the actual returned image pixels, not project old source coordinates
- return tight boxes around visible content only
- merge related people/faces/bodies into one `emotion` segment when they form one human moment
- avoid duplicate semantic ids in the final response
- include creative suggestions when possible

Segment suggestions can include model-authored prompt and scalar guidance:

```ts
{
  id: "human-hook",
  label: "Make faces the hook",
  impact: 6,
  promptHint: "make the existing people or faces the emotional hook...",
  responseHint: "I’ll make the human read carry more of the image...",
  rationale: "Use when the segment contains people, faces, bodies, or emotional posture.",
  scalarAdjustments: {
    presence: 12,
    staging: 7,
    valence: 6
  }
}
```

## Important

SAM/SAM2 gives masks, not semantic labels. A production pipeline should run mask generation first, then label or merge masks with a vision model/classifier so UI concepts such as face, CTA, product, headline, and background are reliable.

The current Cloudflare Worker includes `/segment` as a contract endpoint and analyzes the requested image pixels with OpenAI vision by default. It falls back to projected heuristic annotations only when vision localization fails.
