import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { Epic, Ticket, TicketState } from '../types'

// Shown in the /board panel. Keep in step with plugin.json's version.
const VERSION = '0.1.0'
const PANE = 'board'
const TITLE = 'Board'
const SETTINGS = 'board-settings'
const SETTINGS_TITLE = 'Board settings'
const ROOT = '.scratch'
const SHOW_DONE_KEY = 'show-done-1'
const VISIBLE_KEY = 'visible-1'
// Read the files again this often, so edits made outside Claude show up too.
const POLL_MS = 15_000

const epics = atom({ plugin: 'board-pane', key: 'epics' } as const, [] as Epic[], { shape: 'epics-1' })
const showDone = atom({ plugin: 'board-pane', key: 'showDone' } as const, false)
const visible = atom({ plugin: 'board-pane', key: 'visible' } as const, true)
const scroll = atom({ plugin: 'board-pane', key: 'scroll' } as const, 0)
const readAt = atom({ plugin: 'board-pane', key: 'readAt' } as const, 0)
let maxScroll = 0

const MARK: Record<TicketState, string> = { open: '[ ]', claimed: '[~]', done: '[x]', other: '[?]' }

const HELP: [string, string][] = [
  ['/board', 'Open this settings panel'],
  ['/board show', 'Show the pane'],
  ['/board hide', 'Hide the pane'],
  ['/board done', 'Show or hide resolved tickets'],
  ['/board refresh', 'Read the ticket files again now'],
]

// ── Parsing ──

export function stateOf(status: string): TicketState {
  const s = status.toLowerCase()
  if (/^(resolved|done|closed|completed|fixed|wontfix|won't-fix)$/.test(s)) return 'done'
  if (/^(claimed|in-progress|in_progress|doing|wip)$/.test(s)) return 'claimed'
  if (/^(open|todo|ready|ready-for-agent|ready-for-human|needs-triage|needs-info|blocked|new)$/.test(s)) return 'open'
  return 'other'
}

export function parseTicket(file: string, text: string): Ticket {
  const num = /^(\d+)/.exec(file)?.[1] ?? '--'
  const heading = /^#\s+(.+)$/m.exec(text)?.[1]?.trim()
  const slug = file.replace(/\.md$/, '').replace(/^\d+[-_]?/, '').replace(/[-_]+/g, ' ')
  // "# 01: Title" → "Title"
  const title = (heading ?? slug).replace(/^\d+\s*[:.\-]\s*/, '') || slug
  const status = (/^\W*Status\W*:?\**\s*([\w'-]+)/im.exec(text)?.[1] ?? 'unknown').toLowerCase()
  return { num, title, status, state: stateOf(status) }
}

export function epicName(folder: string, map: string | undefined): string {
  return map ? (/^#\s+(.+)$/m.exec(map)?.[1]?.trim() ?? folder) : folder
}

async function scan($: EngineInterface): Promise<void> {
  const root = `${await $.session.root()}/${ROOT}`
  const found: Epic[] = []
  const dirs = (await $.fs.list(root).catch(() => [])).filter(d => d.kind === 'dir')
  for (const dir of dirs) {
    const base = `${root}/${dir.name}`
    const files = (await $.fs.list(`${base}/issues`).catch(() => []))
      .filter(f => f.kind === 'file' && f.name.endsWith('.md'))
    if (files.length === 0) continue
    const map = await $.fs.read(`${base}/map.md`).catch(() => undefined)
    const tickets: Ticket[] = []
    for (const f of files) {
      const text = await $.fs.read(`${base}/issues/${f.name}`).catch(() => '')
      tickets.push(parseTicket(f.name, typeof text === 'string' ? text : ''))
    }
    tickets.sort((a, b) => a.num.localeCompare(b.num))
    found.push({ folder: dir.name, name: epicName(dir.name, typeof map === 'string' ? map : undefined), tickets })
  }
  found.sort((a, b) => a.folder.localeCompare(b.folder))
  await update($, epics, () => found)
  await update($, readAt, () => Date.now())
}

// ── Drawing (plain ASCII) ──

const cut = (s: string, n: number) => (s.length <= n ? s : n <= 3 ? s.slice(0, n) : s.slice(0, n - 3) + '...')

const ORDER: Record<TicketState, number> = { claimed: 0, open: 1, other: 2, done: 3 }

export function boardLines(list: Epic[], cols: number, withDone: boolean): string[] {
  const lines: string[] = []
  for (const ep of list) {
    const n = (s: TicketState) => ep.tickets.filter(t => t.state === s).length
    const counts = [
      n('open') && `open ${n('open')}`,
      n('claimed') && `claimed ${n('claimed')}`,
      n('other') && `other ${n('other')}`,
      n('done') && `done ${n('done')}`,
    ].filter(Boolean).join('  ')
    const label = cut(ep.folder, Math.max(4, cols - counts.length - 1))
    lines.push(label + ' '.repeat(Math.max(1, cols - label.length - counts.length)) + counts)
    const shown = [...ep.tickets]
      .filter(t => withDone || t.state !== 'done')
      .sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.num.localeCompare(b.num))
    for (const t of shown) lines.push(cut(`  #${t.num} ${MARK[t.state]} ${t.title}`, cols))
    const hidden = ep.tickets.length - shown.length
    if (hidden > 0) lines.push(`  (+${hidden} done hidden)`)
    if (shown.length === 0 && hidden === 0) lines.push('  (no tickets)')
    lines.push('')
  }
  return lines
}

const time = (ms: number) => {
  if (!ms) return 'never'
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// ── Pane control ──

const openPane = ($: EngineInterface) => $.ui.open({ id: PANE, title: TITLE, backgroundColor: 'transparent' })
const openSettings = ($: EngineInterface) =>
  $.ui.open({ id: SETTINGS, title: SETTINGS_TITLE, focus: true, closeOnEscape: true, holdToasts: true })

async function setVisible($: EngineInterface, to: boolean): Promise<void> {
  await update($, visible, () => to)
  await $.store.set(VISIBLE_KEY, to)
  if (to) await openPane($)
  else await $.ui.close({ id: PANE })
}

async function setShowDone($: EngineInterface, to: boolean): Promise<void> {
  await update($, showDone, () => to)
  await $.store.set(SHOW_DONE_KEY, to)
}

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    const result = await next(e)
    await $.command.register({
      name: 'board',
      description: 'Open the ticket board settings panel',
      argumentHint: '[show|hide|done|refresh]',
      immediate: true,
    })
    const wantDone = (await $.store.get(SHOW_DONE_KEY)) === true
    await update($, showDone, () => wantDone)
    const isVisible = (await $.store.get(VISIBLE_KEY)) !== false
    await update($, visible, () => isVisible)
    await scan($).catch(() => undefined)
    $.clock.every(POLL_MS, () => void scan($).catch(() => undefined))
    if (isVisible) void openPane($)
    return result
  })

  on('command.run', { command: 'board' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'show' || arg === 'hide') {
      await setVisible($, arg === 'show')
      $.ui.toast(arg === 'show' ? 'Board shown.' : 'Board hidden. /board show brings it back.')
    } else if (arg === 'done') {
      const to = !(await read($, showDone))
      await setShowDone($, to)
      $.ui.toast(to ? 'Board: resolved tickets shown.' : 'Board: resolved tickets hidden.')
    } else if (arg === 'refresh') {
      await scan($)
      $.ui.toast('Board: tickets read again.')
    } else {
      await openSettings($)
    }
    return {}
  })

  // A ticket written by Claude shows up right away.
  on('tool.call', async ($, e, next) => {
    const result = await next(e)
    const path = 'file_path' in e && typeof e.file_path === 'string' ? e.file_path : ''
    const cmd = 'command' in e && typeof e.command === 'string' ? e.command : ''
    if (path.includes(`${ROOT}/`) || cmd.includes(ROOT)) void scan($).catch(() => undefined)
    return result
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    void scan($).catch(() => undefined)
    return result
  })

  // ── Settings panel ──
  on('ui.render', { component: 'Pane', requestId: SETTINGS }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const shown = await read($, visible)
    const done = await read($, showDone)
    const list = await read($, epics)
    const total = list.reduce((m, x) => m + x.tickets.length, 0)
    const close = () => $.ui.close({ id: SETTINGS })
    return (
      <Box flexDirection="column">
        <Text bold>Pane</Text>
        <Box>
          <Button key="show" label={shown ? '(*) Show' : '( ) Show'} hotkey="s" autoFocus onPress={() => setVisible($, true)} />
          <Button key="hide" label={shown ? '( ) Hide' : '(*) Hide'} hotkey="h" onPress={() => setVisible($, false)} />
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Resolved tickets</Text>
          <Box>
            <Button key="done-on" label={done ? '(*) Show' : '( ) Show'} hotkey="d" onPress={() => setShowDone($, true)} />
            <Button key="done-off" label={done ? '( ) Hide' : '(*) Hide'} hotkey="n" onPress={() => setShowDone($, false)} />
          </Box>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Tickets</Text>
          <Text dimColor>  {total} ticket(s) in {list.length} epic(s) under {ROOT}/*/issues</Text>
          <Text dimColor>  Last read {time(await read($, readAt))}, again every {POLL_MS / 1000}s</Text>
          <Box>
            <Button key="refresh" label="Refresh now" hotkey="r" onPress={() => scan($)} />
          </Box>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Commands</Text>
          {HELP.map(([c, d]) => (
            <Text>
              <Text color="claude">{c.padEnd(16)}</Text> <Text dimColor>{d}</Text>
            </Text>
          ))}
          <Text dimColor>  Marks: [ ] open  [~] claimed  [x] done  [?] other</Text>
        </Box>

        <Box marginTop={1}>
          <Button key="close" label="Close" role="dismiss" onPress={close} />
          <Text dimColor>  Esc also closes · board-pane {VERSION}</Text>
        </Box>
      </Box>
    )
  })

  // ── The board ──
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text } = $.ui.resolve(e)
    const list = await read($, epics)
    const done = await read($, showDone)
    const cols = Math.max(20, e.props.bodyColumns)
    const room = Math.max(4, e.props.scroll.bodyRows)

    const open = list.reduce((m, x) => m + x.tickets.filter(t => t.state !== 'done').length, 0)
    const left = `BOARD  ${ROOT}`
    const right = `${open} open  ${time(await read($, readAt))}`
    const header = [
      <Text bold wrap="truncate-end">{left + ' '.repeat(Math.max(1, cols - left.length - right.length)) + right}</Text>,
    ]
    const lines =
      list.length === 0
        ? [`No tickets found in ${ROOT}/*/issues/*.md`, '', 'Make some with /to-tickets.']
        : boardLines(list, cols, done)
    const space = Math.max(1, room - header.length - 1)
    maxScroll = Math.max(0, lines.length - space)
    const from = Math.min(await read($, scroll), maxScroll)
    const shown = lines.slice(from, from + space)
    let rule = '-'.repeat(cols)
    if (maxScroll > 0) {
      const where = ` ${from > 0 ? '^' : ' '}${from < maxScroll ? 'v' : ' '} ${from + 1}-${from + shown.length}/${lines.length} `
      rule = '-'.repeat(Math.max(0, cols - where.length - 2)) + where + '--'
    }
    const rows: RenderElement[] = shown.map(l => <Text wrap="truncate-end">{l || ' '}</Text>)
    return (
      <Box flexDirection="column">
        {header}
        <Text dimColor wrap="truncate-end">{rule}</Text>
        {rows}
      </Box>
    )
  })

  // Closing the pane by hand counts as hide, kept for new sessions.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const result = await next(e)
    if (e.origin.kind === 'person') {
      await update($, visible, () => false)
      await $.store.set(VISIBLE_KEY, false)
    }
    return result
  })

  on('ui.scroll', { requestId: PANE }, async ($, e) => {
    await update($, scroll, s => Math.max(0, Math.min(maxScroll, (s ?? 0) + e.by)))
    return {}
  })
}
