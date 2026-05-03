export type CreativeAsset = {
  id: string
  name: string
  channel: string
  version: string
}

export type ImageVariant = {
  id: string
  title: string
  kind: 'original' | 'updated' | 'generated'
  image: string
  mediaSize?: {
    width: number
    height: number
  }
  score: number
  delta?: number
  filter?: string
  ingredients?: string[]
  sourceIds?: string[]
  scalarRecipe?: AestheticScalar[]
  promptRecipe?: PromptRecipe
  sourceFidelity?: SourceFidelityReport
  visualContext?: {
    summary: string
    locks: string[]
    copywriting?: string[]
    product?: {
      identity: string
      packageType?: string
      visualSignature?: string[]
      labelText?: string[]
      placement?: string
      preservation?: string[]
    }
    typography?: {
      family: string
      fallback?: string
      weight?: string
      style?: string
      casing?: string
      tracking?: string
      lineHeight?: string
      textRendering?: string[]
    }
    textAnchors: string[]
    sourceDna?: string[]
    avoid: string[]
  }
  segments?: SegmentAnnotation[]
  status?: 'ready' | 'generating'
  segmentationStatus?: 'idle' | 'segmenting' | 'ready' | 'failed'
  segmentationError?: string
}

export type SourceFidelityCheckStatus = 'passed' | 'needs-review' | 'failed' | 'not-run'

export type SourceFidelityReport = {
  providerMode: string
  confidence: 'high' | 'medium' | 'low'
  mode: 'source-preserving-edit' | 'fallback-generation' | 'mock'
  summary: string
  checks: Array<{
    id: 'generation' | 'source-edit' | 'product-lock' | 'copy-lock' | 'type-lock' | 'identity-lock' | 'slider-intent'
    label: string
    status: SourceFidelityCheckStatus
    detail: string
  }>
  warnings: string[]
  critic?: {
    status: SourceFidelityCheckStatus
    summary: string
    issues?: string[]
  }
}

export type CreativeGenerationIntent =
  | 'scalar-remix'
  | 'idea-combine'
  | 'segment-edit'
  | 'image-blend'

export type AestheticScalar = {
  id: string
  label: string
  lowLabel: string
  highLabel: string
  value: number
  marker?: string
}

export type StylePresetScalarSetting = {
  id: string
  value: number
  marker?: string
}

export type StylePreset = {
  id: string
  title: string
  detail: string
  scalarSettings: StylePresetScalarSetting[]
  context: {
    image: string
    audience: string
    brand: string
    chat: string[]
  }
}

export type SegmentSuggestion = {
  id: string
  label: string
  impact: number
}

export type SegmentAnnotation = {
  id: string
  label: string
  x: number
  y: number
  width: number
  height: number
  mask?: {
    type: 'polygon' | 'rle'
    data: unknown
  }
  confidence?: number
  source?: 'manual' | 'sam' | 'vision' | 'projected'
  labelSource?: 'vision' | 'heuristic' | 'manual'
  delta: number
  suggestions: SegmentSuggestion[]
}

export type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  activity?: string
  streaming?: boolean
}

export type CanvasVariantSnapshot = {
  id: string
  title: string
  kind: ImageVariant['kind']
  imageUrl: string
  score: number
  delta?: number
  mediaSize?: ImageVariant['mediaSize']
  sourceIds?: string[]
  ingredients?: string[]
  visualSummary?: string
  segments: SegmentAnnotation[]
  position?: {
    x: number
    y: number
  }
}

export type CanvasThemeGroup = {
  label: string
  variantIds: string[]
  rationale?: string
}

export type AssistantCanvasAction =
  | {
      type: 'compare-variants'
      variantIds: string[]
      anchorId: string
      segmentIds: string[]
    }
  | {
      type: 'arrange-canvas'
      layout: 'themes' | 'score' | 'source'
      groups: CanvasThemeGroup[]
      selectedIds?: string[]
    }
  | {
      type: 'select-segment'
      segmentIds: string[]
    }
  | {
      type: 'generate-remix'
      sourceVariantId?: string
      segmentIds?: string[]
      promptHint?: string
    }
  | {
      type: 'blend-variants'
      sourceId: string
      targetId: string
    }

export type ScalarGenerationChange = {
  id: string
  label: string
  before: number
  after: number
  lowLabel: string
  highLabel: string
  marker?: string
}

export type ImagePromptContextItem = {
  label: string
  value: string
}

export type ImageInputReference = {
  id: string
  title: string
  url: string
  role: 'source' | 'reference'
  referenceType?: 'creative' | 'typography'
  mediaType?: string
  mediaSize?: {
    width: number
    height: number
  }
  description?: string
  copywriting?: string[]
  scalarRecipe?: AestheticScalar[]
}

export type SceneDescription = {
  subject: string
  setting: string
  composition: string
  camera: string
  lighting: string
  color: string
  typography: string
}

export type ImagePromptPacket = {
  requestScaffold: string
  promptDraft: string
  prompt: string
  negativePrompt: string
  context: ImagePromptContextItem[]
  promptHints: string[]
}

export type PromptRecipe = {
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
    lane: 'vision' | 'prompt' | 'image' | 'sam' | 'context'
    text: string
  }>
  debug?: Record<string, unknown>
}

export type PromptComposerRequest = {
  requestId: string
  intent: CreativeGenerationIntent
  outputTitle: string
  model: string
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
  sourceFidelity: {
    primaryRoute: string
    fallbackPolicy: string
    criticChecks: string[]
    regionLocks: string[]
  }
}

export type CreativeGenerationRequest = {
  id: string
  model: string
  intent: CreativeGenerationIntent
  outputTitle: string
  createdAt: string
  asset: CreativeAsset
  sourceVariant: ImageVariant
  sourceIds: string[]
  imageInputs: ImageInputReference[]
  selectedSegment: SegmentAnnotation
  scalars: AestheticScalar[]
  scalarChanges: ScalarGenerationChange[]
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
  projectedScore: number
  scoreLift: number
  baseFilter: string
  fallbackImage: string
  promptHints: string[]
  sceneDescription: SceneDescription
  imagePrompt: ImagePromptPacket
  promptComposer: PromptComposerRequest
}

export type CreativeGenerationResult = {
  requestId: string
  title: string
  image: string
  score: number
  delta: number
  filter: string
  ingredients: string[]
  sourceIds: string[]
  provider: 'endpoint' | 'mock'
  providerMode: string
  promptSummary: string
  promptRecipe?: PromptRecipe
  sourceFidelity: SourceFidelityReport
}

export type SegmentImageRequest = {
  variantId: string
  requestId?: string
  imageUrl: string
  imageWidth: number
  imageHeight: number
  semanticHints: string[]
  context?: {
    title?: string
    sourceVariantId?: string
    generationIntent?: CreativeGenerationIntent
    selectedSegmentLabel?: string
  }
}

export type SegmentImageResult = {
  variantId: string
  segments: SegmentAnnotation[]
  provider: 'endpoint' | 'mock'
  toolName: string
  semanticHints: string[]
  rawPayload?: unknown
}

export type AssistantChatRequest = {
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
  canvas: {
    variants: CanvasVariantSnapshot[]
    selectedVariantIds: string[]
    comparisonIds: string[]
    selectedSegmentIds: string[]
  }
}

export type AssistantChatResponse = {
  content: string
  activity?: string
  focus?: string
  provider: 'endpoint' | 'mock'
  actions?: AssistantCanvasAction[]
}
