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
}

export type AestheticScalar = {
  id: string
  label: string
  lowLabel: string
  highLabel: string
  value: number
  marker?: string
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
}
