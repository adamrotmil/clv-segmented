import { useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import {
  Bot,
  ChevronDown,
  ChevronLeft,
  EyeOff,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import './App.css'
import {
  assets,
  initialMessages,
  initialScalars,
  initialVariants,
  segments,
} from './data'
import type {
  AestheticScalar,
  ChatMessage,
  ImageVariant,
  SegmentAnnotation,
  SegmentSuggestion,
} from './types'

function App() {
  const [selectedAssetId, setSelectedAssetId] = useState(assets[0].id)
  const [selectedVariantId, setSelectedVariantId] = useState('updated')
  const [selectedSegmentId, setSelectedSegmentId] = useState('')
  const [annotationsVisible, setAnnotationsVisible] = useState(true)
  const [zoom, setZoom] = useState(78)
  const [scalars, setScalars] = useState(initialScalars)
  const [variants, setVariants] = useState(initialVariants)
  const [messages, setMessages] = useState(initialMessages)
  const [chatValue, setChatValue] = useState('')
  const [isGenerating, setIsGenerating] = useState(true)
  const [toast, setToast] = useState('')

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0]
  const selectedSegment = segments.find((segment) => segment.id === selectedSegmentId) ?? null
  const totalLift = useMemo(
    () =>
      Math.max(
        0,
        Math.round(
          (scalars.find((scalar) => scalar.id === 'staging')?.value ?? 0) / 20 +
            (100 - (scalars.find((scalar) => scalar.id === 'abstraction')?.value ?? 0)) / 50 +
            ((scalars.find((scalar) => scalar.id === 'novelty')?.value ?? 0) - 50) / 35,
        ),
      ),
    [scalars],
  )

  function updateScalar(id: string, value: number) {
    setScalars((current) =>
      current.map((scalar) => (scalar.id === id ? { ...scalar, value } : scalar)),
    )
    setIsGenerating(true)
  }

  function applySuggestion(segment: SegmentAnnotation, suggestion: SegmentSuggestion) {
    const nextId = `variant-${Date.now()}`
    const nextVariant: ImageVariant = {
      id: nextId,
      title: `Variant ${String.fromCharCode(65 + variants.length - 1)}`,
      kind: 'generated',
      image: initialVariants[1].image,
      score: Math.min(94, 83 + suggestion.impact + totalLift),
      delta: suggestion.impact,
      filter:
        suggestion.id === 'sat'
          ? 'saturate(.84) contrast(1.04)'
          : suggestion.id === 'tone' || suggestion.id === 'warmth'
            ? 'sepia(.14) saturate(1.16) brightness(1.04)'
            : 'contrast(1.08) brightness(1.03)',
    }
    setVariants((current) => [...current, nextVariant])
    setSelectedVariantId(nextId)
    setToast(`${segment.label} updated`)
    setMessages((current) => [
      ...current,
      {
        id: `assistant-${nextId}`,
        role: 'assistant',
        content: `${suggestion.label} applied to ${segment.label.toLowerCase()}. I generated a new variant on the canvas.`,
      },
    ])
    setIsGenerating(false)
    window.setTimeout(() => setToast(''), 1800)
  }

  function remixImage() {
    const nextId = `remix-${Date.now()}`
    const remix: ImageVariant = {
      id: nextId,
      title: `Remix ${variants.length}`,
      kind: 'generated',
      image: initialVariants[1].image,
      score: Math.min(96, 86 + totalLift),
      delta: Math.max(4, totalLift),
      filter: 'contrast(1.08) saturate(1.08) brightness(1.03)',
    }
    setVariants((current) => [...current, remix])
    setSelectedVariantId(nextId)
    setIsGenerating(false)
    setToast('Remix generated')
    window.setTimeout(() => setToast(''), 1800)
  }

  function sendChat(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = chatValue.trim()
    if (!trimmed) return
    const userMessage: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: trimmed,
    }
    setMessages((current) => [...current, userMessage])
    setChatValue('')
    setIsGenerating(true)
    window.setTimeout(() => {
      setMessages((current) => [
        ...current,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          content: 'I updated the working prompt and marked the strongest canvas areas for review.',
        },
      ])
      setIsGenerating(false)
    }, 650)
  }

  return (
    <main className="portfolio-frame">
      <BackgroundChrome />
      <section className="editor-window" aria-label="Edit creative">
        <EditorHeader />
        <div className="editor-body">
          <LeftInspector
            selectedAssetId={selectedAssetId}
            onSelectAsset={setSelectedAssetId}
            scalars={scalars.slice(0, 3)}
            onScalarChange={updateScalar}
          />
          <CanvasWorkspace
            selectedAsset={selectedAsset}
            variants={variants}
            selectedVariantId={selectedVariantId}
            onSelectVariant={setSelectedVariantId}
            annotationsVisible={annotationsVisible}
            onToggleAnnotations={() => setAnnotationsVisible((visible) => !visible)}
            zoom={zoom}
            onZoomChange={setZoom}
            selectedSegment={selectedSegment}
            selectedSegmentId={selectedSegmentId}
            onSelectSegment={setSelectedSegmentId}
            onApplySuggestion={applySuggestion}
            totalLift={totalLift}
          />
          <AssistantPanel
            messages={messages}
            isGenerating={isGenerating}
            chatValue={chatValue}
            onChatValueChange={setChatValue}
            onSubmit={sendChat}
            selectedSegment={selectedSegment}
            scalars={scalars}
            onRemix={remixImage}
          />
        </div>
        {toast ? <div className="toast">{toast}</div> : null}
      </section>
    </main>
  )
}

function BackgroundChrome() {
  return (
    <div className="background-chrome" aria-hidden="true">
      <div className="left-rail">
        <span />
        <span />
        <span />
        <span />
      </div>
      <div className="background-title">Welcome, Sidia. Let's grow your brand.</div>
      <div className="background-button">+ New Campaign</div>
    </div>
  )
}

function EditorHeader() {
  return (
    <header className="editor-header">
      <div className="breadcrumbs">
        <ChevronLeft size={22} strokeWidth={2} />
        <span>Campaign Plan</span>
        <b>/</b>
        <span>Approvals</span>
        <b>/</b>
        <strong>Edit Creative</strong>
      </div>
      <div className="header-actions">
        <Button variant="secondary">Close</Button>
        <Button variant="secondary" icon={<Plus size={20} />}>
          Add Asset
        </Button>
        <Button>Save Changes</Button>
      </div>
    </header>
  )
}

function LeftInspector({
  selectedAssetId,
  onSelectAsset,
  scalars,
  onScalarChange,
}: {
  selectedAssetId: string
  onSelectAsset: (id: string) => void
  scalars: AestheticScalar[]
  onScalarChange: (id: string, value: number) => void
}) {
  return (
    <aside className="left-panel">
      <button className="asset-select" type="button">
        <span>{assets.find((asset) => asset.id === selectedAssetId)?.name}</span>
        <ChevronDown size={18} />
      </button>

      <section className="styles-section">
        <div className="section-title">
          <span className="spin-mark" />
          <span>Pre-set styles</span>
          <ChevronDown size={17} />
        </div>
        <div className="preset-list">
          <PresetRow active title="Current style" detail="Updated just now" />
          <PresetRow
            title="Meta - Campaign 12-Dec-202..."
            detail="Created 13 Dec 2025"
            onClick={() => onSelectAsset('meta-b')}
          />
          <PresetRow
            title="Original pre-set for Reddit ca..."
            detail="Created 27 Nov 2025"
            onClick={() => onSelectAsset('reddit-c')}
          />
        </div>
        <button className="show-styles" type="button">
          Show All Styles
          <ChevronDown size={17} />
        </button>
      </section>

      <section className="suggestion-card">
        <div className="suggestion-head">
          <Sparkles size={18} />
          <strong>Suggestions</strong>
          <X size={19} />
        </div>
        <p>Increase process materiality and reduce abstraction to create a more authentic look and feel.</p>
      </section>

      <div className="search-box">
        <Search size={18} />
        <span>Search...</span>
      </div>

      <section className="intent-section">
        <div className="section-title compact">
          <span>Intent &amp; Style</span>
          <ChevronDown size={17} />
        </div>
        {scalars.map((scalar) => (
          <ScalarSlider
            key={scalar.id}
            scalar={scalar}
            onChange={(value) => onScalarChange(scalar.id, value)}
          />
        ))}
      </section>
    </aside>
  )
}

function PresetRow({
  active = false,
  title,
  detail,
  onClick,
}: {
  active?: boolean
  title: string
  detail: string
  onClick?: () => void
}) {
  return (
    <button className={`preset-row ${active ? 'active' : ''}`} type="button" onClick={onClick}>
      <span className="radio-dot" />
      <span className="preset-copy">
        <strong>{title}</strong>
        <small>{detail}</small>
      </span>
      {active ? <span className="save-pill">Save</span> : <MoreHorizontal size={18} />}
    </button>
  )
}

function ScalarSlider({
  scalar,
  onChange,
}: {
  scalar: AestheticScalar
  onChange: (value: number) => void
}) {
  return (
    <div className="scalar">
      <div className="scalar-top">
        <span>{scalar.label}</span>
        {scalar.marker ? <b>{scalar.marker}</b> : null}
      </div>
      <div className="range-wrap">
        <input
          aria-label={scalar.label}
          type="range"
          min="0"
          max="100"
          value={scalar.value}
          onChange={(event) => onChange(Number(event.target.value))}
          style={{ '--fill': `${scalar.value}%` } as CSSProperties}
        />
      </div>
      <div className="scale-labels">
        <span>{scalar.lowLabel}</span>
        <span>{scalar.highLabel}</span>
      </div>
    </div>
  )
}

function CanvasWorkspace({
  selectedAsset,
  variants,
  selectedVariantId,
  onSelectVariant,
  annotationsVisible,
  onToggleAnnotations,
  zoom,
  onZoomChange,
  selectedSegment,
  selectedSegmentId,
  onSelectSegment,
  onApplySuggestion,
  totalLift,
}: {
  selectedAsset: { version: string }
  variants: ImageVariant[]
  selectedVariantId: string
  onSelectVariant: (id: string) => void
  annotationsVisible: boolean
  onToggleAnnotations: () => void
  zoom: number
  onZoomChange: (value: number) => void
  selectedSegment: SegmentAnnotation | null
  selectedSegmentId: string
  onSelectSegment: (id: string) => void
  onApplySuggestion: (segment: SegmentAnnotation, suggestion: SegmentSuggestion) => void
  totalLift: number
}) {
  const comparisonVariants = variants.slice(0, 2)
  const generatedVariants = variants.slice(2)

  return (
    <section className="canvas-panel">
      <div className="canvas-toolbar">
        <button className="version-select" type="button">
          {selectedAsset.version}
          <ChevronDown size={18} />
        </button>
        <div className="canvas-tools">
          <button className="tool-button" type="button" onClick={onToggleAnnotations}>
            <EyeOff size={18} />
            {annotationsVisible ? 'Hide Annotations' : 'Show Annotations'}
          </button>
          <div className="zoom-control">
            <button type="button" onClick={() => onZoomChange(Math.max(58, zoom - 5))}>
              -
            </button>
            <span>{zoom}%</span>
            <button type="button" onClick={() => onZoomChange(Math.min(118, zoom + 5))}>
              +
            </button>
          </div>
        </div>
      </div>

      <div className="canvas-scroll">
        <div className="artboard-row" style={{ '--zoom': zoom / 78 } as CSSProperties}>
          {comparisonVariants.map((variant, index) => (
            <CreativeArtboard
              key={variant.id}
              variant={variant}
              selected={selectedVariantId === variant.id}
              annotationsVisible={annotationsVisible}
              selectedSegmentId={selectedSegmentId}
              onSelect={() => onSelectVariant(variant.id)}
              onSelectSegment={onSelectSegment}
              totalLift={totalLift}
              focus={index === 1}
            />
          ))}
        </div>

        {selectedSegment && annotationsVisible ? (
          <SegmentFlyout
            segment={selectedSegment}
            onClose={() => onSelectSegment('')}
            onApply={(suggestion) => onApplySuggestion(selectedSegment, suggestion)}
          />
        ) : null}

        {generatedVariants.length > 0 ? (
          <div className="variant-strip">
            {generatedVariants.map((variant) => (
              <button
                key={variant.id}
                type="button"
                className={`variant-thumb ${selectedVariantId === variant.id ? 'selected' : ''}`}
                onClick={() => onSelectVariant(variant.id)}
              >
                <img src={variant.image} alt="" style={{ filter: variant.filter }} />
                <span>{variant.title}</span>
                <ScoreBadge score={variant.score} delta={variant.delta} />
              </button>
            ))}
          </div>
        ) : null}
      </div>
    </section>
  )
}

function CreativeArtboard({
  variant,
  selected,
  annotationsVisible,
  selectedSegmentId,
  onSelect,
  onSelectSegment,
  totalLift,
  focus,
}: {
  variant: ImageVariant
  selected: boolean
  annotationsVisible: boolean
  selectedSegmentId: string
  onSelect: () => void
  onSelectSegment: (id: string) => void
  totalLift: number
  focus: boolean
}) {
  return (
    <div className="creative-stack">
      <div className="creative-title">{variant.title}</div>
      <button
        className={`creative-card ${selected ? 'selected' : ''}`}
        type="button"
        onClick={onSelect}
      >
        <img src={variant.image} alt="" style={{ filter: variant.filter }} />
        <ScoreBadge score={variant.score + (focus ? totalLift : 0)} delta={variant.delta} />
        {annotationsVisible ? (
          <div className="segment-hit-layer" aria-label="Image segments">
            {segments.map((segment) => (
              <button
                key={segment.id}
                className={`segment-hotspot ${
                  selectedSegmentId === segment.id && focus ? 'selected' : ''
                }`}
                style={{
                  left: `${segment.x}%`,
                  top: `${segment.y}%`,
                  width: `${segment.width}%`,
                  height: `${segment.height}%`,
                }}
                type="button"
                aria-label={segment.label}
                onClick={(event) => {
                  event.stopPropagation()
                  onSelect()
                  onSelectSegment(segment.id)
                }}
              />
            ))}
            {segments.map((segment) => (
              <span
                key={`${segment.id}-label`}
                className={`segment-label segment-label-${segment.id}`}
                style={{
                  left: `${segment.x}%`,
                  top: `${segment.y}%`,
                }}
              >
                {segment.label === 'Emotional engagement' ? (
                  <>
                    Emotional
                    <br />
                    engagement
                  </>
                ) : (
                  segment.label
                )}
                {focus && segment.delta >= 0 ? <b>+{segment.delta}%</b> : null}
              </span>
            ))}
          </div>
        ) : null}
      </button>
    </div>
  )
}

function ScoreBadge({ score, delta }: { score: number; delta?: number }) {
  return (
    <span className="score-wrap">
      {delta !== undefined ? <span className="delta-badge">+{delta}%</span> : null}
      <span className="score-badge">ES: {score}%</span>
    </span>
  )
}

function SegmentFlyout({
  segment,
  onClose,
  onApply,
}: {
  segment: SegmentAnnotation
  onClose: () => void
  onApply: (suggestion: SegmentSuggestion) => void
}) {
  return (
    <aside className="segment-flyout">
      <div className="flyout-head">
        <div>
          <strong>{segment.label}</strong>
          <small>Projected score {segment.delta >= 0 ? '+' : ''}{segment.delta}%</small>
        </div>
        <button type="button" onClick={onClose} aria-label="Close segment flyout">
          <X size={16} />
        </button>
      </div>
      <div className="suggestion-list">
        {segment.suggestions.map((suggestion) => (
          <div className="suggestion-row" key={suggestion.id}>
            <span>{suggestion.label}</span>
            <button type="button" onClick={() => onApply(suggestion)}>
              Apply
            </button>
          </div>
        ))}
      </div>
      <button className="apply-segment" type="button" onClick={() => onApply(segment.suggestions[0])}>
        Apply to segment
      </button>
    </aside>
  )
}

function AssistantPanel({
  messages,
  isGenerating,
  chatValue,
  onChatValueChange,
  onSubmit,
  selectedSegment,
  scalars,
  onRemix,
}: {
  messages: ChatMessage[]
  isGenerating: boolean
  chatValue: string
  onChatValueChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
  selectedSegment: SegmentAnnotation | null
  scalars: AestheticScalar[]
  onRemix: () => void
}) {
  return (
    <aside className="assistant-panel">
      <header className="assistant-header">
        <div>
          <Sparkles size={18} fill="currentColor" />
          <strong>Edit Image with AI</strong>
        </div>
        <button type="button" aria-label="Close assistant">
          <X size={19} />
        </button>
      </header>
      <div className="chat-log">
        <div className="chat-spacer" />
        {selectedSegment ? (
          <ScoreInsights segment={selectedSegment} scalars={scalars} onRemix={onRemix} />
        ) : null}
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role}`}>
            {message.content}
          </div>
        ))}
        <div className="assistant-status">
          <Bot size={21} />
          <div>
            <strong>AI Asssistant</strong>
            <span>{isGenerating ? 'Generating image...' : 'Ready'}</span>
            {isGenerating ? (
              <i>
                <b />
                <b />
                <b />
              </i>
            ) : null}
          </div>
        </div>
      </div>
      <form className="chat-input" onSubmit={onSubmit}>
        <input
          value={chatValue}
          onChange={(event) => onChatValueChange(event.target.value)}
          placeholder="Ask anything..."
          aria-label="Ask anything"
        />
        <button type="submit" aria-label="Send message">
          <Send size={19} />
        </button>
      </form>
    </aside>
  )
}

function ScoreInsights({
  segment,
  scalars,
  onRemix,
}: {
  segment: SegmentAnnotation
  scalars: AestheticScalar[]
  onRemix: () => void
}) {
  const plotScalars = scalars.slice(0, 12)
  const points = plotScalars
    .map((scalar, index) => {
      const angle = (Math.PI * 2 * index) / plotScalars.length - Math.PI / 2
      const radius = 18 + (scalar.value / 100) * 62
      return `${90 + Math.cos(angle) * radius},${90 + Math.sin(angle) * radius}`
    })
    .join(' ')

  return (
    <section className="score-insights" aria-label="Engagement score">
      <div className="score-copy">
        <strong>{segment.label}</strong>
        <span>ES: {74 + Math.max(segment.delta, 0)}%</span>
      </div>
      <svg className="radar" viewBox="0 0 180 180" aria-hidden="true">
        {[28, 46, 64, 82].map((radius) => (
          <circle key={radius} cx="90" cy="90" r={radius} />
        ))}
        {plotScalars.map((_, index) => {
          const angle = (Math.PI * 2 * index) / plotScalars.length - Math.PI / 2
          return (
            <line
              key={index}
              x1="90"
              y1="90"
              x2={90 + Math.cos(angle) * 82}
              y2={90 + Math.sin(angle) * 82}
            />
          )
        })}
        <polygon points={points} />
      </svg>
      <button className="remix-button" type="button" onClick={onRemix}>
        <RefreshCw size={18} />
        Remix Image
      </button>
    </section>
  )
}

function Button({
  children,
  icon,
  variant = 'primary',
}: {
  children: ReactNode
  icon?: ReactNode
  variant?: 'primary' | 'secondary'
}) {
  return (
    <button className={`button ${variant}`} type="button">
      {icon}
      {children}
    </button>
  )
}

export default App
