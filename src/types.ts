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
  score: number
  delta?: number
  filter?: string
  ingredients?: string[]
  sourceIds?: string[]
  visualContext?: {
    summary: string
    locks: string[]
    textAnchors: string[]
    avoid: string[]
  }
  segments?: SegmentAnnotation[]
  status?: 'ready' | 'generating'
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
  mediaType?: string
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
  prompt: string
  negativePrompt: string
  context: ImagePromptContextItem[]
  promptHints: string[]
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
  segments?: SegmentAnnotation[]
  provider: 'endpoint' | 'mock'
  promptSummary: string
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
}

export type AssistantChatResponse = {
  content: string
  activity?: string
  focus?: string
  provider: 'endpoint' | 'mock'
}
