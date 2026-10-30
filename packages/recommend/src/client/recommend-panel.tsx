import type { PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Check,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Settings2,
  X,
} from 'lucide-react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import {
  messageOf,
  reasonOf,
  shown,
  type ArxivRecommendItem,
  type ArxivRecommendResult,
  type RecommendFace,
  type RecommendT,
  type SettingsView,
  type ZhihuSearchItem,
} from './types'

type RecommendPanelProps =
  PropsRuntime<'sidebar.right.pane.tab'> &
  PropsLocale<'agentero.recommend'> &
  RecommendFace

type Tab = 'arxiv' | 'zhihu'
type BusyStep = 'probe' | 'compute'

const DEFAULT_CATEGORIES = ['cs.AI', 'cs.CL', 'cs.LG', 'cs.CV', 'stat.ML']
const CATEGORIES_KEY = 'agentero:recommend:categories'

function loadCategories(): string[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(CATEGORIES_KEY) ?? 'null')
    if (Array.isArray(parsed)) {
      const values = parsed.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
      if (values.length > 0) return values
    }
  } catch {
    // Ignore a malformed local preference.
  }
  return [...DEFAULT_CATEGORIES]
}

function saveCategories(categories: string[]): void {
  try {
    window.localStorage.setItem(CATEGORIES_KEY, JSON.stringify(categories))
  } catch {
    // Local storage can be unavailable in private browsing.
  }
}

function formatTime(value: string): string {
  if (value === '') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString()
}

function IconButton({
  label,
  children,
  onClick,
  disabled,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  disabled?: boolean
}): ReactNode {
  return (
    <button
      type='button'
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className='inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50'
    >
      {children}
    </button>
  )
}

function EmptyState({
  t,
  message,
  onRetry,
  onSettings,
  busy,
  step,
}: {
  t: RecommendT
  message: string
  onRetry: () => void
  onSettings: () => void
  busy: boolean
  step: BusyStep
}): ReactNode {
  const reason = reasonOf(message)
  if (busy) {
    return (
      <div className='flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground'>
        <Loader2 className='size-3.5 animate-spin' />
        {step === 'probe' ? t('probing') : t('computing')}
      </div>
    )
  }
  if (reason === 'noEmbedding' || reason === 'noSecret') {
    return (
      <div className='flex flex-col items-center gap-2 px-4 py-10 text-center'>
        <p className='max-w-sm text-balance text-xs leading-relaxed text-muted-foreground'>
          {shown(message, t)}
        </p>
        <button
          type='button'
          onClick={onSettings}
          className='inline-flex h-7 items-center rounded-md border border-border bg-background px-2.5 text-xs transition-colors hover:bg-muted'
        >
          {t('openSettings')}
        </button>
      </div>
    )
  }
  if (reason === 'probeFailed') {
    return (
      <div className='flex flex-col items-center gap-2 px-4 py-10 text-center'>
        <p className='max-w-sm text-balance text-xs leading-relaxed text-muted-foreground'>
          {t('probeFailed')}
        </p>
        <div className='flex items-center gap-1.5'>
          <button
            type='button'
            onClick={onRetry}
            className='inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs transition-colors hover:bg-muted'
          >
            <RotateCw className='size-3' />
            {t('retry')}
          </button>
          <button
            type='button'
            onClick={onSettings}
            className='inline-flex h-7 items-center rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
          >
            {t('openSettings')}
          </button>
        </div>
      </div>
    )
  }
  return (
    <div className='flex flex-col items-center gap-2 px-4 py-10 text-center'>
      <p className='max-w-sm text-balance text-xs leading-relaxed text-muted-foreground'>
        {message === '' ? t('idle') : shown(message, t)}
      </p>
      <button
        type='button'
        onClick={onRetry}
        className='inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs transition-colors hover:bg-muted'
      >
        <RotateCw className='size-3' />
        {t('retry')}
      </button>
    </div>
  )
}

function ArxivCard({
  t,
  item,
  imported,
  importing,
  onImport,
}: {
  t: RecommendT
  item: ArxivRecommendItem
  imported: boolean
  importing: boolean
  onImport: () => void
}): ReactNode {
  return (
    <article className='group relative rounded-lg border bg-background p-2.5 pr-24 transition-colors hover:border-foreground/20 hover:bg-muted/40'>
      <h3 className='line-clamp-2 min-w-0 font-medium text-sm leading-snug' title={item.title}>
        {item.title}
      </h3>
      <p className='mt-1 line-clamp-3 text-xs leading-snug text-muted-foreground'>{item.abstract}</p>
      <div className='mt-1.5 flex items-center gap-2 text-[11px] text-muted-foreground'>
        <span className='font-mono'>{item.arxivId}</span>
        {item.publishedAt !== undefined ? <span className='truncate'>{item.publishedAt}</span> : null}
      </div>
      <div className='absolute right-1.5 top-1.5 flex items-center gap-0.5'>
        <a
          href={item.url}
          target='_blank'
          rel='noreferrer'
          aria-label={t('open')}
          title={t('open')}
          className='inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
        >
          <ExternalLink className='size-3.5' />
        </a>
        {imported ? (
          <span className='inline-flex size-7 items-center justify-center text-muted-foreground' title={t('imported')}>
            <Check className='size-3.5' />
          </span>
        ) : (
          <IconButton label={importing ? t('importing') : t('import')} onClick={onImport} disabled={importing}>
            {importing ? <Loader2 className='size-3.5 animate-spin' /> : <Download className='size-3.5' />}
          </IconButton>
        )}
      </div>
    </article>
  )
}

function ZhihuCard({ t, item }: { t: RecommendT, item: ZhihuSearchItem }): ReactNode {
  return (
    <a
      href={item.url}
      target='_blank'
      rel='noreferrer'
      className='group flex flex-col gap-1.5 rounded-lg border border-border/70 bg-card px-3 py-2.5 text-left transition-colors hover:border-border hover:bg-muted/40'
    >
      <div className='flex items-start justify-between gap-2'>
        <span className='line-clamp-2 font-medium text-sm text-foreground'>{item.title}</span>
        <span className='mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground'>
          {item.kind === 'answer' ? t('answer') : t('article')}
        </span>
      </div>
      {item.excerpt !== '' ? (
        <p className='line-clamp-2 text-xs leading-relaxed text-muted-foreground'>{item.excerpt}</p>
      ) : null}
      <div className='flex items-center gap-1.5 text-[11px] text-muted-foreground'>
        {item.author !== '' ? <span className='truncate'>{item.author}</span> : null}
        {item.author !== '' ? <span aria-hidden>·</span> : null}
        <span className='tabular-nums'>{t('votes', { votes: item.votes.toLocaleString() })}</span>
      </div>
    </a>
  )
}

export function RecommendPanel({
  t,
  loadSettings,
  saveSettings,
  probeEmbedding,
  loadArxiv,
  recommendArxiv,
  searchZhihu,
  importPaper,
}: RecommendPanelProps): ReactNode {
  const [tab, setTab] = useState<Tab>('arxiv')
  const [settings, setSettings] = useState<SettingsView | null>(null)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [settingsError, setSettingsError] = useState('')
  const [settingsBusy, setSettingsBusy] = useState(false)
  const [settingsSaved, setSettingsSaved] = useState(false)
  const [baseUrl, setBaseUrl] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('')
  const [zhihuSecret, setZhihuSecret] = useState('')

  const [categories, setCategories] = useState<string[]>(loadCategories)
  const [categoryDraft, setCategoryDraft] = useState('')
  const [arxivBusy, setArxivBusy] = useState(false)
  const [arxivStep, setArxivStep] = useState<BusyStep>('probe')
  const [arxivResult, setArxivResult] = useState<ArxivRecommendResult | null>(null)
  const [arxivMessage, setArxivMessage] = useState('')
  const [banner, setBanner] = useState('')
  const [importingId, setImportingId] = useState('')
  const [imported, setImported] = useState<Record<string, boolean>>({})

  const [zhihuQuery, setZhihuQuery] = useState('')
  const [zhihuBusy, setZhihuBusy] = useState(false)
  const [zhihuItems, setZhihuItems] = useState<ZhihuSearchItem[] | null>(null)
  const [zhihuMessage, setZhihuMessage] = useState('')

  const loadedRef = useRef(false)
  const hasArxivResult = arxivResult !== null && arxivResult.items.length > 0

  useEffect(() => {
    let cancelled = false
    loadSettings()
      .then((next) => {
        if (cancelled) return
        setSettings(next)
        setBaseUrl(next.embedding.baseUrl)
        setModel(next.embedding.model)
        setSettingsError('')
      })
      .catch((error: unknown) => {
        if (cancelled) return
        const message = messageOf(error)
        setSettingsError(message)
        setArxivMessage(message)
      })
    return () => { cancelled = true }
  }, [loadSettings])

  const runArxiv = async (force: boolean, nextCategories: string[] = categories): Promise<void> => {
    setArxivBusy(true)
    setArxivStep('probe')
    setArxivMessage('')
    setBanner('')
    try {
      await probeEmbedding()
      if (!force) {
        const stored = await loadArxiv(nextCategories)
        if (stored !== null) {
          setArxivResult(stored)
          setArxivMessage('')
          return
        }
      }
      setArxivStep('compute')
      const result = await recommendArxiv(nextCategories)
      setArxivResult(result)
      setArxivMessage('')
    } catch (error: unknown) {
      setArxivMessage(messageOf(error))
    } finally {
      setArxivBusy(false)
    }
  }

  useEffect(() => {
    if (loadedRef.current || settings === null) return
    loadedRef.current = true
    if (!settings.embedding.configured) {
      setArxivMessage('recommend.no_embedding')
      return
    }
    void runArxiv(false)
    // runArxiv only closes over the initial category list here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings])

  const runZhihu = async (query: string): Promise<void> => {
    const trimmed = query.trim()
    if (trimmed === '') {
      setZhihuMessage('zhihu.empty_query')
      return
    }
    if (settings !== null && !settings.zhihu.configured) {
      setZhihuMessage('zhihu.no_secret')
      return
    }
    setZhihuBusy(true)
    setZhihuMessage('')
    try {
      setZhihuItems(await searchZhihu(trimmed, 10))
    } catch (error: unknown) {
      setZhihuItems(null)
      setZhihuMessage(messageOf(error))
    } finally {
      setZhihuBusy(false)
    }
  }

  const addCategory = (): void => {
    const value = categoryDraft.trim()
    if (value === '' || value.length > 40) return
    if (categories.some(category => category.toLowerCase() === value.toLowerCase())) {
      setCategoryDraft('')
      return
    }
    const next = [...categories, value]
    setCategories(next)
    saveCategories(next)
    setCategoryDraft('')
    void runArxiv(true, next)
  }

  const removeCategory = (category: string): void => {
    if (categories.length <= 1) return
    const next = categories.filter(value => value !== category)
    setCategories(next)
    saveCategories(next)
    void runArxiv(true, next)
  }

  const save = (): void => {
    setSettingsBusy(true)
    setSettingsSaved(false)
    const patch: Parameters<typeof saveSettings>[0] = {}
    if (baseUrl.trim() !== '') patch.embeddingBaseUrl = baseUrl.trim()
    if (model.trim() !== '') patch.embeddingModel = model.trim()
    if (apiKey.trim() !== '') patch.embeddingApiKey = apiKey.trim()
    if (zhihuSecret.trim() !== '') patch.zhihuAccessSecret = zhihuSecret.trim()
    saveSettings(patch)
      .then((next) => {
        setSettings(next)
        setBaseUrl(next.embedding.baseUrl)
        setModel(next.embedding.model)
        setApiKey('')
        setZhihuSecret('')
        setSettingsError('')
        setSettingsSaved(true)
        if (next.embedding.configured) {
          void runArxiv(false)
        }
      })
      .catch((error: unknown) => { setSettingsError(messageOf(error)) })
      .finally(() => { setSettingsBusy(false) })
  }

  const importArxiv = (item: ArxivRecommendItem): void => {
    setImportingId(item.arxivId)
    setBanner('')
    importPaper(item.url)
      .then(() => { setImported(current => ({ ...current, [item.arxivId]: true })) })
      .catch((error: unknown) => { setBanner(shown(messageOf(error), t)) })
      .finally(() => { setImportingId('') })
  }

  let arxivBody: ReactNode
  if (arxivBusy || (!hasArxivResult && arxivMessage === '')) {
    arxivBody = (
      <EmptyState
        t={t}
        message={arxivMessage}
        onRetry={() => { void runArxiv(true) }}
        onSettings={() => { setSettingsOpen(true) }}
        busy={arxivBusy}
        step={arxivStep}
      />
    )
  } else if (!hasArxivResult) {
    arxivBody = (
      <EmptyState
        t={t}
        message={arxivMessage}
        onRetry={() => { void runArxiv(true) }}
        onSettings={() => { setSettingsOpen(true) }}
        busy={false}
        step={arxivStep}
      />
    )
  } else {
    arxivBody = (
      <div className='grid gap-2'>
        {arxivResult?.items.map(item => (
          <ArxivCard
            key={item.arxivId}
            t={t}
            item={item}
            imported={imported[item.arxivId] === true}
            importing={importingId === item.arxivId}
            onImport={() => { importArxiv(item) }}
          />
        ))}
      </div>
    )
  }

  let zhihuBody: ReactNode
  if (settings !== null && !settings.zhihu.configured) {
    zhihuBody = (
      <EmptyState
        t={t}
        message='zhihu.no_secret'
        onRetry={() => { void runZhihu(zhihuQuery) }}
        onSettings={() => { setSettingsOpen(true) }}
        busy={false}
        step={arxivStep}
      />
    )
  } else if (zhihuBusy) {
    zhihuBody = (
      <div className='flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground'>
        <Loader2 className='size-3.5 animate-spin' />
        {t('zhihuLoading')}
      </div>
    )
  } else if (zhihuMessage !== '') {
    zhihuBody = (
      <EmptyState
        t={t}
        message={zhihuMessage}
        onRetry={() => { void runZhihu(zhihuQuery) }}
        onSettings={() => { setSettingsOpen(true) }}
        busy={false}
        step={arxivStep}
      />
    )
  } else if (zhihuItems === null) {
    zhihuBody = (
      <div className='flex flex-col items-center gap-2 px-4 py-10 text-center'>
        <p className='max-w-sm text-balance text-xs leading-relaxed text-muted-foreground'>{t('zhihuHint')}</p>
      </div>
    )
  } else if (zhihuItems.length === 0) {
    zhihuBody = (
      <div className='flex flex-col items-center gap-2 px-4 py-10 text-center'>
        <p className='text-xs text-muted-foreground'>{t('zhihuEmpty')}</p>
        <button
          type='button'
          onClick={() => { void runZhihu(zhihuQuery) }}
          className='inline-flex h-7 items-center gap-1 rounded-md border border-border bg-background px-2.5 text-xs transition-colors hover:bg-muted'
        >
          <RefreshCw className='size-3' />
          {t('zhihuRefresh')}
        </button>
      </div>
    )
  } else {
    zhihuBody = (
      <div className='grid gap-2'>
        <p className='text-[11px] text-muted-foreground'>{t('zhihuNote')}</p>
        {zhihuItems.map(item => <ZhihuCard key={item.url} t={t} item={item} />)}
        <button
          type='button'
          onClick={() => { void runZhihu(zhihuQuery) }}
          className='mx-auto inline-flex h-7 items-center gap-1 rounded-md px-2.5 text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
        >
          <RefreshCw className='size-3' />
          {t('zhihuRefresh')}
        </button>
      </div>
    )
  }

  return (
    <div className='agentero-recommend agentero-surface box-border flex h-full min-h-0 min-w-0 flex-col font-sans text-foreground [&_*]:box-border'>
      <div className='flex shrink-0 items-center gap-1 border-b px-2.5 py-1.5'>
        <button
          type='button'
          onClick={() => { setTab('arxiv') }}
          className={`inline-flex h-7 items-center rounded-md px-2.5 text-xs transition-colors ${
            tab === 'arxiv' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          }`}
        >
          {t('arxivTab')}
        </button>
        <button
          type='button'
          onClick={() => { setTab('zhihu') }}
          className={`inline-flex h-7 items-center rounded-md px-2.5 text-xs transition-colors ${
            tab === 'zhihu' ? 'bg-muted text-foreground' : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground'
          }`}
        >
          {t('zhihuTab')}
        </button>
        <div className='ml-auto flex items-center gap-0.5'>
          {tab === 'arxiv' ? (
            <IconButton
              label={t('refresh')}
              disabled={arxivBusy}
              onClick={() => { void runArxiv(true) }}
            >
              {arxivBusy ? <Loader2 className='size-3.5 animate-spin' /> : <RefreshCw className='size-3.5' />}
            </IconButton>
          ) : null}
          <IconButton
            label={t('settings')}
            onClick={() => { setSettingsOpen(value => !value) }}
          >
            <Settings2 className='size-3.5' />
          </IconButton>
        </div>
      </div>

      {settingsOpen ? (
        <div className='shrink-0 border-b bg-muted/20 p-2.5'>
          <div className='mb-2 flex items-start justify-between gap-2'>
            <div>
              <p className='text-xs font-medium'>{t('settingsTitle')}</p>
              <p className='mt-0.5 text-[11px] leading-relaxed text-muted-foreground'>{t('settingsDescription')}</p>
            </div>
            <IconButton label={t('close')} onClick={() => { setSettingsOpen(false) }}>
              <X className='size-3.5' />
            </IconButton>
          </div>
          <div className='grid gap-1.5'>
            <label className='grid gap-0.5 text-[11px] text-muted-foreground'>
              <span>{t('baseUrl')}</span>
              <input
                value={baseUrl}
                onChange={event => { setBaseUrl(event.target.value) }}
                placeholder='https://api.openai.com/v1'
                spellCheck={false}
                className='h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
              />
            </label>
            <label className='grid gap-0.5 text-[11px] text-muted-foreground'>
              <span>
                {t('apiKey')}
                {' · '}
                {settings?.embedding.keyPresent === true ? t('keyConfigured') : t('keyMissing')}
              </span>
              <input
                type='password'
                value={apiKey}
                onChange={event => { setApiKey(event.target.value) }}
                placeholder={t('keepBlank')}
                autoComplete='off'
                spellCheck={false}
                className='h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
              />
            </label>
            <label className='grid gap-0.5 text-[11px] text-muted-foreground'>
              <span>{t('model')}</span>
              <input
                value={model}
                onChange={event => { setModel(event.target.value) }}
                placeholder='text-embedding-3-small'
                spellCheck={false}
                className='h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
              />
            </label>
            <label className='grid gap-0.5 text-[11px] text-muted-foreground'>
              <span>
                {t('zhihuSecret')}
                {' · '}
                {settings?.zhihu.configured === true ? t('secretConfigured') : t('secretMissing')}
              </span>
              <input
                type='password'
                value={zhihuSecret}
                onChange={event => { setZhihuSecret(event.target.value) }}
                placeholder={t('keepBlank')}
                autoComplete='off'
                spellCheck={false}
                className='h-7 rounded-md border border-input bg-background px-2 text-xs text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
              />
            </label>
          </div>
          <div className='mt-2 flex items-center gap-2'>
            <button
              type='button'
              disabled={settingsBusy}
              onClick={save}
              className='inline-flex h-7 items-center gap-1 rounded-md bg-primary px-2.5 text-xs text-primary-foreground transition-colors hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50'
            >
              {settingsBusy ? <Loader2 className='size-3 animate-spin' /> : null}
              {settingsBusy ? t('saving') : t('save')}
            </button>
            {settingsSaved ? <span className='text-[11px] text-muted-foreground'>{t('saved')}</span> : null}
            {settingsError !== '' ? (
              <span className='min-w-0 truncate text-[11px] text-destructive' title={settingsError}>
                {shown(settingsError, t)}
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {tab === 'arxiv' ? (
        <>
          <div className='flex shrink-0 flex-wrap items-center gap-1 border-b px-2.5 py-1.5'>
            {categories.map(category => (
              <span
                key={category}
                className='group inline-flex items-center gap-0.5 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2 pr-0.5 font-mono text-[11px] text-foreground'
              >
                {category}
                <button
                  type='button'
                  disabled={categories.length <= 1 || arxivBusy}
                  aria-label={t('removeCategory', { category })}
                  onClick={() => { removeCategory(category) }}
                  className='rounded-full p-0.5 opacity-0 transition-opacity hover:bg-foreground/10 group-hover:opacity-100 disabled:pointer-events-none disabled:opacity-0'
                >
                  <X className='size-2.5' />
                </button>
              </span>
            ))}
            <form
              className='inline-flex items-center gap-1'
              onSubmit={(event) => {
                event.preventDefault()
                addCategory()
              }}
            >
              <input
                value={categoryDraft}
                onChange={event => { setCategoryDraft(event.target.value) }}
                placeholder={t('categoryPlaceholder')}
                spellCheck={false}
                className='h-6 w-24 rounded-md border border-input bg-transparent px-1.5 font-mono text-[11px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
              />
              <IconButton label={t('addCategory')} onClick={addCategory} disabled={arxivBusy}>
                <Plus className='size-3.5' />
              </IconButton>
            </form>
            <span className='ml-auto flex items-center gap-2'>
              {hasArxivResult && arxivResult !== null ? (
                <span className='text-[11px] text-muted-foreground'>
                  {t('corpusCount', { count: arxivResult.corpusSize })}
                  {formatTime(arxivResult.computedAt) !== ''
                    ? ` · ${t('updatedAt', { time: formatTime(arxivResult.computedAt) })}`
                    : ''}
                </span>
              ) : null}
            </span>
          </div>
          <div className='min-h-0 flex-1 overflow-y-auto p-2.5'>
            {banner !== '' ? (
              <p className='mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive'>
                {banner}
              </p>
            ) : null}
            {arxivMessage !== '' && hasArxivResult ? (
              <p className='mb-2 rounded-md border border-destructive/30 bg-destructive/10 px-2 py-1.5 text-[11px] text-destructive'>
                {shown(arxivMessage, t)}
              </p>
            ) : null}
            {arxivBody}
          </div>
        </>
      ) : (
        <>
          <form
            className='flex shrink-0 items-center gap-1 border-b px-2.5 py-1.5'
            onSubmit={(event) => {
              event.preventDefault()
              void runZhihu(zhihuQuery)
            }}
          >
            <div className='relative min-w-0 flex-1'>
              <Search className='pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground' />
              <input
                value={zhihuQuery}
                onChange={event => { setZhihuQuery(event.target.value) }}
                placeholder={t('zhihuSearchPlaceholder')}
                className='h-7 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-xs outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
              />
            </div>
            <button
              type='submit'
              disabled={zhihuBusy}
              className='inline-flex h-7 items-center rounded-md bg-primary px-2.5 text-xs text-primary-foreground transition-colors hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50'
            >
              {t('zhihuSearch')}
            </button>
          </form>
          <div className='min-h-0 flex-1 overflow-y-auto p-2.5'>{zhihuBody}</div>
        </>
      )}
    </div>
  )
}
