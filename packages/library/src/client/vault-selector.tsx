import { Check, ChevronDown, FolderOpen } from 'lucide-react'
import { Popover } from 'radix-ui'
import { useState } from 'react'
import { Button } from './button'
import { Input } from './input'
import { LibraryPopoverContent } from './library-controls'
import type { LibraryT, VaultInfo } from './papers'
import { cn, controlReset } from './utils'

export function VaultSelector({ t, vault, busy, onPick, onSelect, notifyError }: {
  t: LibraryT
  vault: VaultInfo | null
  busy: boolean
  onPick: () => Promise<string | null>
  onSelect: (path: string) => Promise<boolean>
  notifyError: (message: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [path, setPath] = useState('')
  const [picking, setPicking] = useState(false)

  const select = async (next: string): Promise<void> => {
    if (busy || picking || next.trim() === '') return
    if (next.trim() === vault?.path) { setOpen(false); return }
    if (vault?.path && !window.confirm(t('switchVaultConfirm'))) return
    if (await onSelect(next.trim())) setOpen(false)
  }

  return (
    <div className='flex h-9 shrink-0 items-center border-b border-border/40 px-2'>
      <Popover.Root open={open} onOpenChange={(value) => {
        if (picking) return
        if (value) setPath(vault?.path ?? '')
        setOpen(value)
      }}>
        <Popover.Trigger asChild>
          <button
            type='button'
            className={cn(controlReset, 'flex max-w-full cursor-pointer items-center gap-1.5 rounded-md px-1 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50')}
            aria-label={t('selectVault')}
            title={vault?.path || t('selectVault')}
            disabled={busy}
          >
            <FolderOpen className='size-3.5 shrink-0' aria-hidden />
            <span className='min-w-0 truncate'>{vault?.name || t('selectVault')}</span>
            <ChevronDown className='size-3 shrink-0 opacity-60' aria-hidden />
          </button>
        </Popover.Trigger>
        <LibraryPopoverContent align='start' className='w-80' aria-label={t('selectVault')} onEscapeKeyDown={(event) => { if (picking) event.preventDefault() }} onInteractOutside={(event) => { if (picking) event.preventDefault() }}>
          {vault?.recentVaults.length ? <div className='mb-2 flex max-h-48 flex-col gap-0.5 overflow-auto border-b border-border/40 pb-2'>
            {vault.recentVaults.map(item => (
              <button key={item.path} type='button' disabled={busy || picking} className={cn(controlReset, 'flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1.5 text-left text-xs hover:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:opacity-50')} title={item.path} onClick={() => { void select(item.path) }}>
                <FolderOpen className='size-3.5 shrink-0 text-muted-foreground' aria-hidden />
                <span className='min-w-0 flex-1'>
                  <span className='block truncate'>{item.name}</span>
                  <span className='mt-0.5 block truncate text-caption text-muted-foreground'>{item.path}</span>
                </span>
                {item.path === vault.path ? <Check className='size-3.5 shrink-0 text-muted-foreground' aria-hidden /> : null}
              </button>
            ))}
          </div> : null}
          <form className='flex flex-col gap-2' onSubmit={(event) => { event.preventDefault(); void select(path) }}>
            <Input value={path} aria-label={t('vaultPath')} placeholder={t('vaultPath')} disabled={busy || picking} className='h-7 text-xs' onChange={(event) => { setPath(event.target.value) }} />
            <div className='flex items-center justify-between gap-2'>
              {vault?.canPick ? <Button type='button' variant='ghost' size='sm' disabled={busy || picking} onClick={() => {
                setPicking(true)
                void onPick().then((selected) => { if (selected !== null) setPath(selected) })
                  .catch((error: unknown) => { notifyError(error instanceof Error ? error.message : t('actionFailed')) })
                  .finally(() => { setPicking(false) })
              }}><FolderOpen className='size-3.5' aria-hidden />{t('chooseDirectory')}</Button> : <span />}
              <Button type='submit' size='sm' disabled={busy || picking || path.trim() === ''}>{t('openVault')}</Button>
            </div>
          </form>
        </LibraryPopoverContent>
      </Popover.Root>
    </div>
  )
}
