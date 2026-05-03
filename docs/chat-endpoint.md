# Chat Endpoint Contract

The Assistant panel can call a model-backed chat endpoint instead of using local placeholder replies.

## Frontend Configuration

Set this public build variable for GitHub Pages:

```bash
VITE_CHAT_ENDPOINT=https://your-worker.your-subdomain.workers.dev/chat
```

If `VITE_CHAT_ENDPOINT` is not set, the app will try to derive a sibling `/chat` URL from `VITE_IMAGE_GENERATION_ENDPOINT` when that endpoint ends in `/generate`.

Do not expose `OPENAI_API_KEY` to the frontend. Keep provider keys in the Worker or backend service.

## Request Shape

The app sends an `AssistantChatRequest` JSON payload:

```ts
{
  id: string
  createdAt: string
  prompt: string
  editedMessageId?: string
  asset: CreativeAsset
  selectedVariant: ImageVariant
  selectedSegment: SegmentAnnotation
  selectedSegments: SegmentAnnotation[]
  committedScalars: AestheticScalar[]
  draftScalars: AestheticScalar[]
  pendingScalarChanges: ScalarGenerationChange[]
  chatContext: ChatMessage[]
  latestTrace: {
    control: string
    what: string
    why: string
    ingredients: string[]
  }
  savedIdeas: Array<{
    label: string
    score: number
    ingredients: string[]
  }>
}
```

## Response Shape

Return JSON or plain text. JSON is preferred:

```ts
{
  content: string
  activity?: string
  focus?: string
}
```

`content` is streamed into the UI word by word after the model response lands. `activity` becomes the small status line above the response, for example `Thought for 4s >` or `Worked with model >`.
