import { useMemo, useState } from 'react'
import type { CSSProperties, FormEvent, ReactNode } from 'react'
import {
  ArrowUp,
  Bell,
  Bot,
  Bookmark,
  Building2,
  ChartNoAxesColumn,
  ChevronDown,
  ChevronLeft,
  CirclePlus,
  EyeOff,
  LogIn,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings,
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
} from './types'

type EditorMode = 'edit' | 'score' | 'hybrid'

const scoreScalarPreset: Record<string, Pick<AestheticScalar, 'value' | 'marker'>> = {
  staging: { value: 50, marker: 'Constructed' },
  abstraction: { value: 30, marker: 'Literal' },
  novelty: { value: 80, marker: 'Surreal' },
}

function applyScorePreset(scalars: AestheticScalar[]) {
  return scalars.map((scalar) =>
    scoreScalarPreset[scalar.id] ? { ...scalar, ...scoreScalarPreset[scalar.id] } : scalar,
  )
}

function App() {
  const [selectedAssetId, setSelectedAssetId] = useState(assets[0].id)
  const [selectedVariantId, setSelectedVariantId] = useState('updated')
  const [selectedSegmentId, setSelectedSegmentId] = useState('')
  const [annotationsVisible, setAnnotationsVisible] = useState(true)
  const [zoom, setZoom] = useState(78)
  const [scalars, setScalars] = useState(initialScalars)
  const [scoreScalars, setScoreScalars] = useState(() => applyScorePreset(initialScalars))
  const [variants, setVariants] = useState(initialVariants)
  const [messages, setMessages] = useState(initialMessages)
  const [chatValue, setChatValue] = useState('')
  const [isGenerating, setIsGenerating] = useState(true)
  const [toast, setToast] = useState('')
  const [mode, setMode] = useState<EditorMode>('edit')

  const selectedAsset = assets.find((asset) => asset.id === selectedAssetId) ?? assets[0]
  const selectedSegment = segments.find((segment) => segment.id === selectedSegmentId) ?? null
  const activeSegment = selectedSegment ?? segments[0]
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

  function updateScoreScalar(id: string, value: number) {
    setScoreScalars((current) =>
      current.map((scalar) => (scalar.id === id ? { ...scalar, value } : scalar)),
    )
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

  function openScoreMode(segmentId: string) {
    setSelectedSegmentId(segmentId)
    setMode('score')
    setZoom(100)
  }

  function openHybridMode() {
    if (!selectedSegmentId) setSelectedSegmentId('emotion')
    setMode('hybrid')
    setZoom(100)
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
        <EditorHeader mode={mode} />
        {mode === 'edit' ? (
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
              selectedSegmentId={selectedSegmentId}
              onSelectSegment={openScoreMode}
            />
            <AssistantPanel
              messages={messages}
              isGenerating={isGenerating}
              chatValue={chatValue}
              onChatValueChange={setChatValue}
              onSubmit={sendChat}
            />
          </div>
        ) : mode === 'score' ? (
          <div className="editor-body score-editor-body">
            <ScoreControlsPanel scalars={scoreScalars} onScalarChange={updateScoreScalar} />
            <ScoreWorkspace
              selectedAsset={selectedAsset}
              variant={initialVariants[0]}
              selectedSegmentId={activeSegment.id}
              annotationsVisible={annotationsVisible}
              onToggleAnnotations={() => setAnnotationsVisible((visible) => !visible)}
              onSelectSegment={setSelectedSegmentId}
              onOpenHybrid={openHybridMode}
              onZoomChange={setZoom}
              mode="score"
            />
          </div>
        ) : (
          <div className="editor-body hybrid-editor-body">
            <ScoreControlsPanel
              scalars={scoreScalars}
              onScalarChange={updateScoreScalar}
              variant="hybrid"
            />
            <ScoreWorkspace
              selectedAsset={selectedAsset}
              variant={initialVariants[0]}
              selectedSegmentId={activeSegment.id}
              annotationsVisible={annotationsVisible}
              onToggleAnnotations={() => setAnnotationsVisible((visible) => !visible)}
              onSelectSegment={setSelectedSegmentId}
              onOpenHybrid={openHybridMode}
              onZoomChange={setZoom}
              mode="hybrid"
              onReset={() => setMode('score')}
              onRemix={remixImage}
            />
            <HybridInsightsPanel
              segment={activeSegment}
              scoreScalars={scoreScalars}
              editScalars={scalars}
              onScalarChange={updateScalar}
            />
          </div>
        )}
        {toast ? <div className="toast">{toast}</div> : null}
      </section>
    </main>
  )
}

function BackgroundChrome() {
  return (
    <div className="background-chrome" aria-hidden="true">
      <div className="left-rail">
        <LogIn className="rail-top" size={17} strokeWidth={2.1} />
        <CirclePlus className="rail-plus" size={22} strokeWidth={2.4} fill="currentColor" />
        <span className="rail-active">
          <Building2 size={18} strokeWidth={2.2} fill="currentColor" />
        </span>
        <Bookmark className="rail-bookmark" size={17} strokeWidth={2.1} />
        <ChartNoAxesColumn className="rail-chart" size={18} strokeWidth={2.1} />
        <Bell className="rail-bell" size={17} strokeWidth={2.1} />
        <Settings className="rail-settings" size={18} strokeWidth={2.1} />
        <span className="rail-avatar">S</span>
      </div>
      <div className="background-title">Welcome, Sidia. Let's grow your brand.</div>
      <div className="background-button">+ New Campaign</div>
    </div>
  )
}

function EditorHeader({ mode }: { mode: EditorMode }) {
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
        <Button variant="secondary" icon={mode === 'edit' ? <Plus size={20} /> : undefined}>
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
  selectedSegmentId,
  onSelectSegment,
}: {
  selectedAsset: { version: string }
  variants: ImageVariant[]
  selectedVariantId: string
  onSelectVariant: (id: string) => void
  annotationsVisible: boolean
  onToggleAnnotations: () => void
  zoom: number
  onZoomChange: (value: number) => void
  selectedSegmentId: string
  onSelectSegment: (id: string) => void
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
              focus={index === 1}
              showScore
              showDeltas={index === 1}
            />
          ))}
        </div>

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
  focus,
  size = 'normal',
  showScore = false,
  showDeltas = false,
  titleOverride,
}: {
  variant: ImageVariant
  selected: boolean
  annotationsVisible: boolean
  selectedSegmentId: string
  onSelect: () => void
  onSelectSegment: (id: string) => void
  focus: boolean
  size?: 'normal' | 'large'
  showScore?: boolean
  showDeltas?: boolean
  titleOverride?: string
}) {
  return (
    <div className={`creative-stack ${size === 'large' ? 'large' : ''}`}>
      <div className="creative-title">{titleOverride ?? variant.title}</div>
      <button
        className={`creative-card ${selected ? 'selected' : ''}`}
        type="button"
        onClick={onSelect}
      >
        <img src={variant.image} alt="" style={{ filter: variant.filter }} />
        {showScore ? <ScoreBadge score={variant.score} /> : null}
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
                {showDeltas && segment.delta >= 0 ? <b>+{segment.delta}%</b> : null}
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

function AssistantPanel({
  messages,
  isGenerating,
  chatValue,
  onChatValueChange,
  onSubmit,
}: {
  messages: ChatMessage[]
  isGenerating: boolean
  chatValue: string
  onChatValueChange: (value: string) => void
  onSubmit: (event: FormEvent<HTMLFormElement>) => void
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
        {messages.map((message) => (
          <div key={message.id} className={`chat-message ${message.role}`}>
            {message.content}
          </div>
        ))}
        <div className="assistant-status">
          <Bot size={21} />
          <div>
            <strong>AI Assistant</strong>
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
          <ArrowUp size={22} strokeWidth={2.5} />
        </button>
      </form>
    </aside>
  )
}

function ScoreControlsPanel({
  scalars,
  onScalarChange,
  variant = 'score',
}: {
  scalars: AestheticScalar[]
  onScalarChange: (id: string, value: number) => void
  variant?: 'score' | 'hybrid'
}) {
  const scalarMap = new Map(scalars.map((scalar) => [scalar.id, scalar]))
  const groups = [
    { title: 'Intent & Style', ids: ['staging', 'abstraction', 'novelty', 'materiality'] },
    { title: 'Lighting & Tone', ids: ['hardness', 'key', 'chromatics'] },
    { title: 'Composition', ids: ['complexity', 'balance', 'depth', 'groundedness'] },
    { title: 'Subject', ids: ['presence', 'gaze'] },
    { title: 'Psychology', ids: ['valence', 'arousal', 'stopping-power'] },
  ]

  return (
    <aside className={`score-left-panel ${variant === 'hybrid' ? 'hybrid' : ''}`}>
      <button className="asset-select score-title" type="button">
        <span>TikTok - Variant A</span>
        <ChevronDown size={18} />
      </button>
      {variant === 'score' ? (
        <div className="score-tabs" aria-label="Creative tabs">
          <button type="button">Scenes</button>
          <button className="active" type="button">
            Engagement Score
          </button>
          <button type="button">Insights</button>
        </div>
      ) : null}
      <div className="score-groups">
        {groups.map((group) => (
          <section className="score-group" key={group.title}>
            <div className="score-group-title">
              <span>{group.title}</span>
              <ChevronDown size={15} />
            </div>
            {group.ids.map((id) => {
              const scalar = scalarMap.get(id)
              if (!scalar) return null
              return (
                <ScoreScalarRow
                  key={scalar.id}
                  scalar={scalar}
                  expanded={variant === 'score' && scalar.id === 'novelty'}
                  onChange={(value) => onScalarChange(scalar.id, value)}
                />
              )
            })}
          </section>
        ))}
      </div>
    </aside>
  )
}

function ScoreScalarRow({
  scalar,
  expanded,
  onChange,
}: {
  scalar: AestheticScalar
  expanded?: boolean
  onChange: (value: number) => void
}) {
  return (
    <div className={`score-scalar ${expanded ? 'expanded' : ''}`}>
      <div className="score-scalar-row">
        <span>{scalar.label}</span>
        <div>
          {scalar.marker ? <em>{scalar.marker.replace(/^> /, '')}</em> : null}
          <b>{formatScalarValue(scalar.value)}</b>
        </div>
      </div>
      {expanded ? (
        <div className="score-row-slider">
          <span className="score-expanded-value">{formatScalarValue(scalar.value)}</span>
          <div className="range-wrap">
            <input
              aria-label={`${scalar.label} score`}
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
      ) : null}
    </div>
  )
}

function ScoreWorkspace({
  selectedAsset,
  variant,
  selectedSegmentId,
  annotationsVisible,
  onToggleAnnotations,
  onSelectSegment,
  onOpenHybrid,
  onZoomChange,
  mode,
  onReset,
  onRemix,
}: {
  selectedAsset: { version: string }
  variant: ImageVariant
  selectedSegmentId: string
  annotationsVisible: boolean
  onToggleAnnotations: () => void
  onSelectSegment: (id: string) => void
  onOpenHybrid: () => void
  onZoomChange: (value: number) => void
  mode: 'score' | 'hybrid'
  onReset?: () => void
  onRemix?: () => void
}) {
  return (
    <section className={`canvas-panel score-canvas-panel ${mode}`}>
      <div className="canvas-toolbar score-toolbar">
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
            <button type="button" onClick={() => onZoomChange(95)}>
              -
            </button>
            <span>100%</span>
            <button type="button" onClick={() => onZoomChange(105)}>
              +
            </button>
          </div>
          {mode === 'score' ? (
            <button className="tool-button ai-trigger" type="button" onClick={onOpenHybrid}>
              <Sparkles size={15} fill="currentColor" />
              Edit Image with AI
            </button>
          ) : null}
        </div>
      </div>
      <div className="score-canvas-scroll">
        <div className="single-artboard-row">
          <CreativeArtboard
            variant={variant}
            selected
            annotationsVisible={annotationsVisible}
            selectedSegmentId={selectedSegmentId}
            onSelect={() => undefined}
            onSelectSegment={onSelectSegment}
            focus
            size="large"
            titleOverride="325×325 px"
          />
        </div>
      </div>
      {mode === 'hybrid' ? (
        <div className="hybrid-actions">
          <button type="button" onClick={onReset}>
            Reset Changes
          </button>
          <button type="button" onClick={onRemix}>
            <RefreshCw size={18} />
            Remix Image
          </button>
        </div>
      ) : null}
    </section>
  )
}

function ScoreInsights({
  segment,
  scalars,
  onRemix,
  showRemix = true,
  showLabels = false,
}: {
  segment: SegmentAnnotation
  scalars: AestheticScalar[]
  onRemix: () => void
  showRemix?: boolean
  showLabels?: boolean
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
      <div className="radar-shell">
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
        {showLabels ? (
          <div className="radar-labels" aria-hidden="true">
            <span style={{ left: '50%', top: '0%' }}>Staging</span>
            <span style={{ left: '78%', top: '9%' }}>Abstraction</span>
            <span style={{ left: '96%', top: '28%' }}>Novelty</span>
            <span style={{ left: '96%', top: '53%' }}>Hardness</span>
            <span style={{ left: '78%', top: '82%' }}>Key</span>
            <span style={{ left: '48%', top: '96%' }}>Balance</span>
            <span style={{ left: '13%', top: '82%' }}>Groundedness</span>
            <span style={{ left: '0%', top: '54%' }}>Gaze</span>
            <span style={{ left: '5%', top: '30%' }}>Arousal</span>
            <span style={{ left: '18%', top: '10%' }}>Stopping Power</span>
          </div>
        ) : null}
      </div>
      {showRemix ? (
        <button className="remix-button" type="button" onClick={onRemix}>
          <RefreshCw size={18} />
          Remix Image
        </button>
      ) : null}
    </section>
  )
}

function HybridInsightsPanel({
  segment,
  scoreScalars,
  editScalars,
  onScalarChange,
}: {
  segment: SegmentAnnotation
  scoreScalars: AestheticScalar[]
  editScalars: AestheticScalar[]
  onScalarChange: (id: string, value: number) => void
}) {
  return (
    <aside className="hybrid-panel">
      <ScoreInsights
        segment={segment}
        scalars={scoreScalars}
        onRemix={() => undefined}
        showRemix={false}
        showLabels
      />
      <section className="suggestion-card hybrid-suggestion">
        <div className="suggestion-head">
          <Sparkles size={18} />
          <strong>Suggestions</strong>
          <X size={19} />
        </div>
        <p>Increase process materiality and reduce abstraction to create a more authentic look and feel.</p>
      </section>
      <div className="search-box hybrid-search">
        <Search size={18} />
        <span>Search...</span>
      </div>
      <section className="intent-section hybrid-sliders">
        <div className="section-title compact">
          <span>Intent &amp; Style</span>
          <ChevronDown size={17} />
        </div>
        {editScalars.slice(0, 4).map((scalar) => (
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

function formatScalarValue(value: number) {
  if (value === 100) return '1'
  if (value === 0) return '0'
  return (value / 100).toFixed(1)
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
