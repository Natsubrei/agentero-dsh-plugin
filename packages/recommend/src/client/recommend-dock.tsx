import type { PropsLocale } from '@deepseek-ai/dsh-client-ui-slots'
import {
  Check,
  ChevronDown,
  ChevronUp,
  Download,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  RotateCw,
  Search,
  Settings2,
  Sparkles,
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

type RecommendDockProps = PropsLocale<'agentero.recommend'> & RecommendFace

type Tab = 'arxiv' | 'zhihu'
type BusyStep = 'probe' | 'compute'

const DEFAULT_CATEGORIES = ['cs.AI', 'cs.CL', 'cs.LG', 'cs.CV', 'stat.ML']
const CATEGORIES_KEY = 'agentero:recommend:categories'
const COLLAPSED_KEY = 'agentero:recommend:collapsed'

/** Join conditional classes; the package has no local `cn` helper. */
function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter((part): part is string => typeof part === 'string' && part !== '').join(' ')
}

function readJsonStorage<T>(key: string): T | undefined {
  try {
    const raw = window.localStorage.getItem(key)
    return raw === null ? undefined : JSON.parse(raw) as T
  } catch {
    return undefined
  }
}

function writeStorage(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // Local storage can be unavailable in private browsing.
  }
}

function loadCategories(): string[] {
  const parsed = readJsonStorage<unknown>(CATEGORIES_KEY)
  if (Array.isArray(parsed)) {
    const values = parsed.filter((value): value is string => typeof value === 'string' && value.trim() !== '')
    if (values.length > 0) return values
  }
  return [...DEFAULT_CATEGORIES]
}

function loadCollapsed(): boolean {
  return readJsonStorage<unknown>(COLLAPSED_KEY) === true
}

function formatTime(value: string): string {
  if (value === '') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function IconButton({
  label,
  children,
  onClick,
  disabled,
  pressed,
}: {
  label: string
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  pressed?: boolean
}): ReactNode {
  return (
    <button
      type='button'
      aria-label={label}
      title={label}
      aria-pressed={pressed}
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex size-6 shrink-0 items-center justify-center rounded-md border-0 bg-transparent p-0 text-muted-foreground transition-colors',
        'hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-50',
      )}
    >
      {children}
    </button>
  )
}

function TextButton({
  children,
  onClick,
  disabled,
  primary,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  primary?: boolean
}): ReactNode {
  return (
    <button
      type='button'
      disabled={disabled}
      onClick={onClick}
      className={cx(
        'inline-flex h-6 shrink-0 items-center gap-1 rounded-md px-2 text-caption transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        primary
          ? 'border-0 bg-primary text-primary-foreground hover:bg-primary/80'
          : 'border border-border bg-background hover:bg-muted hover:text-foreground',
      )}
    >
      {children}
    </button>
  )
}

/** One-line status card used by every empty and busy state. */
function StatusCard({ text, actions }: {
  text: ReactNode
  actions?: ReactNode
}): ReactNode {
  return (
    <div className='flex w-full flex-wrap items-center gap-x-2 gap-y-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5'>
      <p className='min-w-0 flex-1 text-caption leading-relaxed text-muted-foreground'>{text}</p>
      {actions === undefined ? null : <div className='flex shrink-0 items-center gap-1.5'>{actions}</div>}
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
    <article
      className={cx(
        'group flex w-64 shrink-0 flex-col rounded-lg border bg-background px-2.5 py-2',
        'transition-colors hover:border-border hover:bg-muted/40',
      )}
    >
      <h3 className='line-clamp-2 text-sm font-medium leading-snug' title={item.title}>
        {item.title}
      </h3>
      <p className='mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground'>{item.abstract}</p>
      <div className='mt-auto flex min-w-0 items-center gap-1.5 pt-1.5 text-caption text-muted-foreground'>
        <span className='truncate font-mono'>{item.arxivId}</span>
        {item.publishedAt === undefined ? null : (
          <>
            <span aria-hidden>·</span>
            <span className='truncate'>{item.publishedAt}</span>
          </>
        )}
        <span className='ml-auto flex shrink-0 items-center gap-0.5'>
          <a
            href={item.url}
            target='_blank'
            rel='noreferrer'
            aria-label={t('open')}
            title={t('open')}
            className='inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground'
          >
            <ExternalLink className='size-3' />
          </a>
          {imported ? (
            <span className='inline-flex size-6 items-center justify-center text-muted-foreground' title={t('imported')}>
              <Check className='size-3' />
            </span>
          ) : (
            <IconButton label={importing ? t('importing') : t('import')} onClick={onImport} disabled={importing}>
              {importing ? <Loader2 className='size-3 animate-spin' /> : <Download className='size-3' />}
            </IconButton>
          )}
        </span>
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
      className={cx(
        'group flex w-64 shrink-0 flex-col gap-1 rounded-lg border bg-background px-2.5 py-2 text-left',
        'transition-colors hover:border-border hover:bg-muted/40',
      )}
    >
      <div className='flex items-start justify-between gap-2'>
        <span className='line-clamp-2 text-sm font-medium leading-snug text-foreground'>{item.title}</span>
        <span className='mt-0.5 shrink-0 rounded bg-muted px-1.5 py-0.5 text-caption text-muted-foreground'>
          {item.kind === 'answer' ? t('answer') : t('article')}
        </span>
      </div>
      {item.excerpt === '' ? null : (
        <p className='line-clamp-2 text-xs leading-relaxed text-muted-foreground'>{item.excerpt}</p>
      )}
      <div className='mt-auto flex items-center gap-1.5 pt-0.5 text-caption text-muted-foreground'>
        {item.author === '' ? null : <span className='truncate'>{item.author}</span>}
        {item.author === '' ? null : <span aria-hidden>·</span>}
        <span className='tabular-nums'>{t('votes', { votes: item.votes.toLocaleString() })}</span>
      </div>
    </a>
  )
}

/**
 * Recommendation cards docked under the composer.
 *
 * arXiv daily ranking and Zhihu discussions share one compact strip so the
 * surface never steals the conversation column. Results only refresh on
 * request: mounting reads the host's same-day cache instead of re-embedding
 * the whole library.
 */
export function RecommendDock({
  t,
  loadSettings,
  saveSettings,
  probeEmbedding,
  loadArxiv,
  recommendArxiv,
  searchZhihu,
  importPaper,
}: RecommendDockProps): ReactNode {
  const [collapsed, setCollapsed] = useState(loadCollapsed)
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

  /** Read the host's same-day cache. Never triggers an embedding run. */
  const loadStored = async (nextCategories: string[]): Promise<void> => {
    setArxivBusy(true)
    setArxivStep('probe')
    setArxivMessage('')
    try {
      await probeEmbedding()
      const stored = await loadArxiv(nextCategories)
      if (stored !== null) setArxivResult(stored)
    } catch (error: unknown) {
      setArxivMessage(messageOf(error))
    } finally {
      setArxivBusy(false)
    }
  }

  /** Recompute today's ranking; only an explicit refresh or a category change. */
  const runArxiv = async (nextCategories: string[] = categories): Promise<void> => {
    setArxivBusy(true)
    setArxivStep('probe')
    setArxivMessage('')
    setBanner('')
    try {
      await probeEmbedding()
      setArxivStep('compute')
      const result = await recommendArxiv(nextCategories)
      setArxivResult(result)
    } catch (error: unknown) {
      setArxivMessage(messageOf(error))
    } finally {
      setArxivBusy(false)
    }
  }

  useEffect(() => {
    if (loadedRef.current || settings === null) return
    loadedRef.current = true
    if (!settings.vaultConfigured) {
      setArxivMessage('vault is not configured')
      return
    }
    if (!settings.embedding.configured) {
      setArxivMessage('recommend.no_embedding')
      return
    }
    void loadStored(categories)
    // Only the first settings load seeds the strip; later calls are user-driven.
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

  const toggleCollapsed = (): void => {
    setCollapsed((value) => {
      writeStorage(COLLAPSED_KEY, !value)
      return !value
    })
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
    writeStorage(CATEGORIES_KEY, next)
    setCategoryDraft('')
    void runArxiv(next)
  }

  const removeCategory = (category: string): void => {
    if (categories.length <= 1) return
    const next = categories.filter(value => value !== category)
    setCategories(next)
    writeStorage(CATEGORIES_KEY, next)
    void runArxiv(next)
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
        if (next.embedding.configured) void loadStored(categories)
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

  const retry = (): void => {
    setArxivMessage('')
    if (settings !== null && !settings.embedding.configured) {
      setSettingsOpen(true)
      return
    }
    void runArxiv()
  }

  let arxivBody: ReactNode
  if (arxivBusy) {
    arxivBody = (
      <StatusCard
        text={arxivStep === 'probe' ? t('probing') : t('computing')}
        actions={<Loader2 className='size-3 animate-spin text-muted-foreground' />}
      />
    )
  } else if (hasArxivResult && arxivResult !== null) {
    arxivBody = (
      <>
        {banner === '' ? null : (
          <p className='mb-1 text-caption text-destructive'>{banner}</p>
        )}
        {arxivMessage === '' ? null : (
          <p className='mb-1 text-caption text-destructive'>{shown(arxivMessage, t)}</p>
        )}
        <div className='flex items-stretch gap-2 overflow-x-auto pb-0.5'>
          {arxivResult.items.map(item => (
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
      </>
    )
  } else {
    const reason = reasonOf(arxivMessage)
    const canSettings = reason === 'noEmbedding'
    // A missing Vault is host configuration, which this panel cannot fix.
    const quiet = arxivMessage === 'vault is not configured'
    arxivBody = (
      <StatusCard
        text={arxivMessage === '' ? t('idle') : shown(arxivMessage, t)}
        actions={quiet ? undefined : canSettings ? (
          <TextButton onClick={() => { setSettingsOpen(true) }} primary>{t('openSettings')}</TextButton>
        ) : (
          <TextButton onClick={retry} primary>
            {reason === 'probeFailed' ? <RotateCw className='size-3' /> : <RefreshCw className='size-3' />}
            {arxivMessage === '' ? t('refresh') : t('retry')}
          </TextButton>
        )}
      />
    )
  }

  let zhihuBody: ReactNode
  if (settings !== null && !settings.zhihu.configured) {
    zhihuBody = (
      <StatusCard
        text={t('zhihuNoSecret')}
        actions={<TextButton onClick={() => { setSettingsOpen(true) }}>{t('openSettings')}</TextButton>}
      />
    )
  } else if (zhihuBusy) {
    zhihuBody = (
      <StatusCard
        text={t('zhihuLoading')}
        actions={<Loader2 className='size-3 animate-spin text-muted-foreground' />}
      />
    )
  } else if (zhihuMessage !== '') {
    zhihuBody = (
      <StatusCard
        text={shown(zhihuMessage, t)}
        actions={(
          <TextButton onClick={() => { void runZhihu(zhihuQuery) }}>
            <RotateCw className='size-3' />
            {t('retry')}
          </TextButton>
        )}
      />
    )
  } else if (zhihuItems === null) {
    zhihuBody = <StatusCard text={t('zhihuHint')} />
  } else if (zhihuItems.length === 0) {
    zhihuBody = (
      <StatusCard
        text={t('zhihuEmpty')}
        actions={(
          <TextButton onClick={() => { void runZhihu(zhihuQuery) }}>
            <RefreshCw className='size-3' />
            {t('zhihuRefresh')}
          </TextButton>
        )}
      />
    )
  } else {
    zhihuBody = (
      <>
        <p className='mb-1 text-caption text-muted-foreground'>{t('zhihuNote')}</p>
        <div className='flex items-stretch gap-2 overflow-x-auto pb-0.5'>
          {zhihuItems.map(item => <ZhihuCard key={item.url} t={t} item={item} />)}
        </div>
        <div className='mt-1 flex justify-center'>
          <TextButton onClick={() => { void runZhihu(zhihuQuery) }}>
            <RefreshCw className='size-3' />
            {t('zhihuRefresh')}
          </TextButton>
        </div>
      </>
    )
  }

  return (
    <section className='agentero-recommend agentero-surface order-1 w-full min-w-0 pb-1 text-foreground [&_*]:box-border'>
      <div className='flex min-w-0 items-center gap-1.5'>
        <Sparkles className='size-3.5 shrink-0 text-[#C792EA]' aria-hidden />
        <span className='shrink-0 text-caption font-medium text-foreground/80'>{t('title')}</span>
        <div className='flex shrink-0 items-center gap-0.5'>
          {(['arxiv', 'zhihu'] as const).map(value => (
            <button
              key={value}
              type='button'
              aria-pressed={tab === value}
              onClick={() => { setTab(value) }}
              className={cx(
                'inline-flex h-6 items-center rounded-md border-0 p-0 px-2 text-caption transition-colors',
                tab === value
                  ? 'bg-muted text-foreground'
                  : 'text-muted-foreground hover:bg-muted/60 hover:text-foreground',
              )}
            >
              {value === 'arxiv' ? t('arxivTab') : t('zhihuTab')}
            </button>
          ))}
        </div>
        <div className='ml-auto flex min-w-0 items-center gap-1.5 text-caption text-muted-foreground'>
          {tab === 'arxiv' && hasArxivResult && arxivResult !== null ? (
            <span className='truncate'>
              {t('corpusCount', { count: arxivResult.corpusSize })}
              {formatTime(arxivResult.computedAt) === ''
                ? ''
                : ` · ${t('updatedAt', { time: formatTime(arxivResult.computedAt) })}`}
            </span>
          ) : null}
          {tab === 'arxiv' ? (
            <IconButton
              label={t('refresh')}
              disabled={arxivBusy}
              onClick={() => { void runArxiv() }}
            >
              {arxivBusy ? <Loader2 className='size-3.5 animate-spin' /> : <RefreshCw className='size-3.5' />}
            </IconButton>
          ) : null}
          <IconButton
            label={t('settings')}
            pressed={settingsOpen}
            onClick={() => { setSettingsOpen(value => !value) }}
          >
            <Settings2 className='size-3.5' />
          </IconButton>
          <IconButton label={collapsed ? t('expand') : t('collapse')} onClick={toggleCollapsed}>
            {collapsed ? <ChevronUp className='size-3.5' /> : <ChevronDown className='size-3.5' />}
          </IconButton>
        </div>
      </div>

      {collapsed ? null : (
        <>
          {settingsOpen ? (
            <div className='mt-1.5 rounded-lg border bg-background p-2'>
              <div className='mb-1.5 flex items-start justify-between gap-2'>
                <p className='text-caption leading-relaxed text-muted-foreground'>{t('settingsDescription')}</p>
                <IconButton label={t('close')} onClick={() => { setSettingsOpen(false) }}>
                  <X className='size-3.5' />
                </IconButton>
              </div>
              <div className='mt-1.5 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4'>
                <label className='grid min-w-0 gap-0.5 text-caption text-muted-foreground'>
                  <span className='truncate'>{t('baseUrl')}</span>
                  <input
                    value={baseUrl}
                    onChange={event => { setBaseUrl(event.target.value) }}
                    placeholder='https://api.openai.com/v1'
                    spellCheck={false}
                    className='h-6 w-full rounded-md border border-input bg-transparent px-1.5 text-caption text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
                  />
                </label>
                <label className='grid min-w-0 gap-0.5 text-caption text-muted-foreground'>
                  <span className='truncate'>{t('model')}</span>
                  <input
                    value={model}
                    onChange={event => { setModel(event.target.value) }}
                    placeholder='text-embedding-3-small'
                    spellCheck={false}
                    className='h-6 w-full rounded-md border border-input bg-transparent px-1.5 text-caption text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
                  />
                </label>
                <label className='grid min-w-0 gap-0.5 text-caption text-muted-foreground'>
                  <span className='truncate'>
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
                    className='h-6 w-full rounded-md border border-input bg-transparent px-1.5 text-caption text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
                  />
                </label>
                <label className='grid min-w-0 gap-0.5 text-caption text-muted-foreground'>
                  <span className='truncate'>
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
                    className='h-6 w-full rounded-md border border-input bg-transparent px-1.5 text-caption text-foreground outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
                  />
                </label>
              </div>
              <div className='mt-1.5 flex min-w-0 flex-wrap items-center gap-1'>
                <span className='shrink-0 text-caption text-muted-foreground'>{t('categories')}</span>
                {categories.map(category => (
                  <span
                    key={category}
                    className='group inline-flex shrink-0 items-center gap-0.5 rounded-full border border-primary/40 bg-primary/10 py-0.5 pl-2 pr-0.5 font-mono text-caption text-foreground'
                  >
                    {category}
                    <button
                      type='button'
                      disabled={categories.length <= 1 || arxivBusy}
                      aria-label={t('removeCategory', { category })}
                      onClick={() => { removeCategory(category) }}
                      className='rounded-full border-0 bg-transparent p-0.5 hover:bg-foreground/10 disabled:pointer-events-none disabled:opacity-30'
                    >
                      <X className='size-2.5' />
                    </button>
                  </span>
                ))}
                <form
                  className='inline-flex shrink-0 items-center gap-1'
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
                    className='h-5 w-20 rounded-md border border-dashed border-border bg-transparent px-1.5 font-mono text-caption outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
                  />
                  <IconButton label={t('addCategory')} onClick={addCategory} disabled={arxivBusy}>
                    <Plus className='size-3' />
                  </IconButton>
                </form>
              </div>
              <div className='mt-1.5 flex items-center gap-2'>
                <button
                  type='button'
                  disabled={settingsBusy}
                  onClick={save}
                  className='inline-flex h-6 items-center gap-1 rounded-md border-0 bg-primary px-2 text-caption text-primary-foreground transition-colors hover:bg-primary/80 disabled:pointer-events-none disabled:opacity-50'
                >
                  {settingsBusy ? <Loader2 className='size-3 animate-spin' /> : null}
                  {settingsBusy ? t('saving') : t('save')}
                </button>
                {settingsSaved ? <span className='text-caption text-muted-foreground'>{t('saved')}</span> : null}
                {settingsError === '' ? null : (
                  <span className='min-w-0 truncate text-caption text-destructive' title={settingsError}>
                    {shown(settingsError, t)}
                  </span>
                )}
              </div>
            </div>
          ) : null}

          {tab === 'arxiv' ? (
            <div className='mt-1.5'>{arxivBody}</div>
          ) : (
            <>
              <form
                className='mt-1.5 flex items-center gap-1.5'
                onSubmit={(event) => {
                  event.preventDefault()
                  void runZhihu(zhihuQuery)
                }}
              >
                <div className='relative min-w-0 flex-1'>
                  <Search className='pointer-events-none absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground' />
                  <input
                    value={zhihuQuery}
                    onChange={event => { setZhihuQuery(event.target.value) }}
                    placeholder={t('zhihuSearchPlaceholder')}
                    className='h-6 w-full rounded-md border border-input bg-transparent pl-7 pr-2 text-caption outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/40'
                  />
                </div>
                <TextButton onClick={() => { void runZhihu(zhihuQuery) }} disabled={zhihuBusy}>
                  {t('zhihuSearch')}
                </TextButton>
              </form>
              <div className='mt-1.5'>{zhihuBody}</div>
            </>
          )}
        </>
      )}
    </section>
  )
}
