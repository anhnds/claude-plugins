import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register, RenderElement } from 'claude-code'

import type { GlossaryEntry, GlossarySize, GlossaryStatus, GlossaryView } from '../types'

// Shown in the /glossary panel. Keep in step with plugin.json's version.
const VERSION = '0.7.1'
const PANE = 'glossary'
const TITLE = 'Glossary'
// A small dialog, like /usage: opens on /glossary, Esc closes it, nothing goes in the chat.
const SETTINGS = 'glossary-settings'
const SETTINGS_TITLE = 'Glossary settings'
const STORE_KEY = 'entries-1'
const KNOWN_KEY = 'known-1'
// The pane's size (full or mini), and whether it is shown at all.
const SIZE_KEY = 'size-2'
const VISIBLE_KEY = 'visible-1'
// Keys from older versions, read once to pick the first size.
// 0.5.0/0.6.0 kept the size as mode 'show' (full) or 'hide' (mini).
const OLD_MODE_KEY = 'mode-1'
const OLD_SIZE_KEY = 'size-1'
const OLD_HIDDEN_KEY = 'hidden-1'
const MAX_ENTRIES = 500
// How many known words we tell the model to skip.
const MAX_KNOWN_IN_PROMPT = 300

// Change the shape tag when a stored type changes, so old stored values are dropped.
const entries = atom(
  { plugin: 'glossary-pane', key: 'entries' } as const,
  [] as GlossaryEntry[],
  { shape: 'entries-1' },
)
const known = atom({ plugin: 'glossary-pane', key: 'known' } as const, [] as string[], {
  shape: 'known-1',
})
const status = atom({ plugin: 'glossary-pane', key: 'status' } as const, {
  kind: 'idle',
  text: '',
} as GlossaryStatus)
const batch = atom({ plugin: 'glossary-pane', key: 'batch' } as const, 0)
const view = atom({ plugin: 'glossary-pane', key: 'view' } as const, 'main' as GlossaryView)
const size = atom({ plugin: 'glossary-pane', key: 'size' } as const, 'full' as GlossarySize)
const visible = atom({ plugin: 'glossary-pane', key: 'visible' } as const, true)
// The pane draws its buttons in a header that stays put, and scrolls the rows
// under it itself: this is the first of those rows on screen.
const scroll = atom({ plugin: 'glossary-pane', key: 'scroll' } as const, 0)
// The furthest the rows can scroll, as last drawn.
let maxScroll = 0

const SYSTEM = `You help a non-native English reader (about B1 level) understand a text written by an AI coding assistant.
Pick the words or short phrases in the text that such a reader may not know: uncommon words, idioms, phrasal verbs, and technical terms that are not obvious.
Skip very common words, code, file paths, command names and product names.
Pick at most 10, in the order they appear.
For each, give:
- "word": the word as it appears (base form is fine)
- "meaning": a very simple English meaning, under 12 words, using only common words
- "ipa": the IPA pronunciation (American English) between slashes, like /ˈmɪt.ɪ.ɡeɪt/
- "translation": a short translation into {LANG}
- "example": a very short example sentence using the word
Reply with a JSON array only, no other text. Reply [] if nothing is hard.`

type Raw = { word?: unknown; meaning?: unknown; ipa?: unknown; translation?: unknown; example?: unknown }

function parse(text: string): Raw[] {
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return []
  try {
    const data = JSON.parse(text.slice(start, end + 1))
    return Array.isArray(data) ? data : []
  } catch {
    return []
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const low = (w: string) => w.trim().toLowerCase()
// Always shown as /…/, whatever brackets the model used.
const ipa = (v: string) => {
  const core = v.replace(/^[\s/\[]+|[\s/\]]+$/g, '')
  return core ? `/${core}/` : ''
}

// Word-wrap a text into lines of at most `width` characters, so each line is one row.
function wrapLines(text: string, width: number): string[] {
  const out: string[] = []
  let line = ''
  for (const w of text.split(/\s+/).filter(Boolean)) {
    if (!line) line = w
    else if (line.length + 1 + w.length <= width) line += ' ' + w
    else {
      out.push(line)
      line = w
    }
  }
  if (line) out.push(line)
  return out
}

function day(ms: number | undefined): string {
  if (!ms) return 'Older'
  const d = new Date(ms)
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

async function explain(
  $: EngineInterface,
  answer: string,
  language: string,
  model: string,
): Promise<void> {
  await update($, status, () => ({ kind: 'working', text: 'Finding hard words…' }))
  const knownNow = (await read($, known)).slice(-MAX_KNOWN_IN_PROMPT)
  const skip = knownNow.length
    ? `\nThe reader already knows these words, so never pick them: ${knownNow.join(', ')}`
    : ''
  const r = await $.model.complete({
    model,
    system: SYSTEM.replace('{LANG}', language) + skip,
    prompt: `Text:\n"""\n${answer.slice(0, 12000)}\n"""`,
    maxTokens: 2000,
    effort: 'low',
    timeoutMs: 60000,
  })
  if (!r.isAnswered) {
    await update($, status, () => ({ kind: 'error', text: `Could not get words (${r.reason}).` }))
    return
  }
  const isKnown = new Set((await read($, known)).map(low))
  const now = await $.clock.now()
  const n = await update($, batch, b => (b ?? 0) + 1)
  const found: GlossaryEntry[] = parse(r.text)
    .map(x => ({
      word: str(x.word),
      meaning: str(x.meaning),
      ipa: ipa(str(x.ipa)),
      translation: str(x.translation),
      example: str(x.example),
      batch: n,
      addedAt: now,
    }))
    .filter(x => x.word && x.meaning && !isKnown.has(low(x.word)))

  const saved = await update($, entries, list => {
    const fresh = new Set(found.map(f => low(f.word)))
    const rest = (list ?? []).filter(o => !fresh.has(low(o.word)))
    return [...found, ...rest].slice(0, MAX_ENTRIES)
  })
  await $.store.set(STORE_KEY, saved)
  if (found.length && (await read($, view)) === 'main') await toLatest($)
  await update($, status, () => ({
    kind: 'idle',
    text: found.length ? `${found.length} new word(s)` : 'No new hard words in the last answer.',
  }))
}

const HELP: readonly (readonly [string, string])[] = [
  ['/glossary', 'Open the settings panel (Esc closes it)'],
  ['/glossary show', 'Show the pane'],
  ['/glossary hide', 'Hide the pane (words are still collected)'],
  ['/glossary toggle', 'Show or hide the pane'],
  ['/glossary full', 'Full size: every word, with meanings and examples'],
  ['/glossary mini', 'Mini size: one line per word of the last answer'],
  ['/glossary manage', 'Open the menu: history log, mark words I know, help'],
  ['/glossary clear', 'Delete the word history (known words are kept)'],
  ['/glossary help', 'Open the settings panel, with this list'],
]

// The newest words are at the top, so "latest" is the start of the pane.
// Best effort: a scroll that can't happen (no screen, pane not drawn) is fine.
async function toLatest($: EngineInterface): Promise<void> {
  await update($, scroll, () => 0)
  try {
    await $.ui.scroll({ in: PANE, to: 'start' })
  } catch {}
}

// Open the pane and show the latest words.
async function openPane($: EngineInterface): Promise<void> {
  // 'transparent': no fill behind the pane, so it keeps the terminal's own colors.
  const r = await $.ui.open({ id: PANE, title: TITLE, backgroundColor: 'transparent' })
  if (r.isPlaced) await toLatest($)
}

const openSettings = ($: EngineInterface) =>
  $.ui.open({ id: SETTINGS, title: SETTINGS_TITLE, focus: true, closeOnEscape: true, holdToasts: true })

async function clearWords($: EngineInterface): Promise<void> {
  await update($, entries, () => [])
  await $.store.set(STORE_KEY, [])
}

async function setView($: EngineInterface, to: GlossaryView): Promise<void> {
  await update($, view, () => to)
  await update($, scroll, () => 0)
}

// Show or hide the pane, and keep the choice for new sessions.
async function setVisible($: EngineInterface, to: boolean): Promise<void> {
  await update($, visible, () => to)
  await $.store.set(VISIBLE_KEY, to)
  if (to) await openPane($)
  else await $.ui.close({ id: PANE })
}

// Set the size, keep it for new sessions, and show the pane so the change is seen.
async function setSize($: EngineInterface, to: GlossarySize): Promise<void> {
  await update($, size, () => to)
  await update($, scroll, () => 0)
  await $.store.set(SIZE_KEY, to)
  await setVisible($, true)
}

async function toggleKnown($: EngineInterface, word: string): Promise<void> {
  const w = low(word)
  const list = await update($, known, ks =>
    ks.includes(w) ? ks.filter(k => k !== w) : [...ks, w],
  )
  await $.store.set(KNOWN_KEY, list)
}

export const register: Register = (on, options) => {
  const language = String(options.language ?? 'Vietnamese') || 'Vietnamese'
  const model = String(options.model ?? 'haiku') || 'haiku'

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'glossary',
      description: 'Open the glossary settings panel',
      argumentHint: '[show|hide|toggle|full|mini|manage|clear|help]',
      // Runs at once, like /config, even while Claude is still answering.
      immediate: true,
    })
    const saved = await $.store.get(STORE_KEY)
    if (Array.isArray(saved)) {
      const list = saved as GlossaryEntry[]
      await update($, entries, () => list)
      await update($, batch, () => list.reduce((m, x) => Math.max(m, x.batch ?? 0), 0))
    }
    const savedKnown = await $.store.get(KNOWN_KEY)
    if (Array.isArray(savedKnown)) {
      await update($, known, () => savedKnown.filter((k): k is string => typeof k === 'string'))
    }
    let savedSize = await $.store.get(SIZE_KEY)
    if (savedSize !== 'full' && savedSize !== 'mini') {
      const oldMode = await $.store.get(OLD_MODE_KEY)
      const wasSmall =
        oldMode === 'hide' ||
        (oldMode !== 'show' &&
          ((await $.store.get(OLD_SIZE_KEY)) === 'mini' || (await $.store.get(OLD_HIDDEN_KEY)) === true))
      savedSize = wasSmall ? 'mini' : 'full'
    }
    const startSize = savedSize as GlossarySize
    await update($, size, () => startSize)
    const isVisible = (await $.store.get(VISIBLE_KEY)) !== false
    await update($, visible, () => isVisible)
    await setView($, 'main')
    if (isVisible) void openPane($)
    return next(e)
  })

  // Like /usage: nothing is written to the chat. Settings open in a panel,
  // and quick commands answer with a toast.
  on('command.run', { command: 'glossary' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'clear') {
      await clearWords($)
      $.ui.toast('Glossary cleared. (Words you marked as known are kept.)')
    } else if (arg === 'manage') {
      await setView($, 'menu')
      await setVisible($, true)
    } else if (arg === 'show' || arg === 'hide' || arg === 'toggle') {
      const to = arg === 'toggle' ? !(await read($, visible)) : arg === 'show'
      if (to) await setView($, 'main')
      await setVisible($, to)
      $.ui.toast(to ? 'Glossary shown.' : 'Glossary hidden. /glossary show brings it back.')
    } else if (arg === 'full' || arg === 'mini') {
      await setView($, 'main')
      await setSize($, arg)
      $.ui.toast(arg === 'full' ? 'Glossary: full size.' : 'Glossary: mini size.')
    } else {
      await openSettings($)
    }
    return {}
  })

  // ── Settings panel ──
  on('ui.render', { component: 'Pane', requestId: SETTINGS }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const current = await read($, size)
    const shown = await read($, visible)
    const all = await read($, entries)
    const knownList = await read($, known)
    const close = () => $.ui.close({ id: SETTINGS })
    const pickSize = (to: GlossarySize) => async () => {
      await setView($, 'main')
      await setSize($, to)
    }
    const pickShown = (to: boolean) => async () => {
      if (to) await setView($, 'main')
      await setVisible($, to)
    }
    return (
      <Box flexDirection="column">
        <Text bold>Pane</Text>
        <Box>
          <Button key="show" label={shown ? '● Show' : '○ Show'} hotkey="s" autoFocus onPress={pickShown(true)} />
          <Button key="hide" label={shown ? '○ Hide' : '● Hide'} hotkey="h" onPress={pickShown(false)} />
        </Box>
        <Text dimColor>  Hidden, words are still collected for later.</Text>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Size</Text>
          <Box>
            <Button key="full" label={current === 'full' ? '● Full' : '○ Full'} hotkey="f" onPress={pickSize('full')} />
            <Button key="mini" label={current === 'mini' ? '● Mini' : '○ Mini'} hotkey="n" onPress={pickSize('mini')} />
          </Box>
          <Text dimColor>  Full: meanings and examples. Mini: one line per word, last answer only.</Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Words</Text>
          <Text dimColor>  {all.length} saved, {knownList.length} marked as known</Text>
          <Box>
            <Button
              key="manage"
              label="Manage"
              hotkey="m"
              onPress={async () => {
                await setView($, 'menu')
                await setVisible($, true)
                await close()
              }}
            />
            <Button key="clear" label="Clear history" hotkey="c" onPress={() => clearWords($)} />
          </Box>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Options</Text>
          <Text dimColor>  Translation: {language} · Model: {model}</Text>
          <Text dimColor>  Change them in /config. Turn the glossary off with /plugin.</Text>
        </Box>

        <Box marginTop={1}>
          <Text dimColor>glossary-pane {VERSION}</Text>
        </Box>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Commands</Text>
          {HELP.map(([c, d]) => (
            <Text>
              <Text color="claude">{c.padEnd(17)}</Text> <Text dimColor>{d}</Text>
            </Text>
          ))}
        </Box>

        <Box marginTop={1}>
          <Button key="close" label="Close" role="dismiss" onPress={close} />
          <Text dimColor>  Esc also closes</Text>
        </Box>
      </Box>
    )
  })

  on('turn.complete', async ($, e, next) => {
    const result = await next(e)
    // Main conversation only, and only real answers with some text.
    if (!e.agentId && e.reason === 'answer' && e.answer.trim().length >= 40) {
      const answer = e.answer
      $.clock.after(0, () => {
        void explain($, answer, language, model).catch(err =>
          update($, status, () => ({ kind: 'error', text: `Error: ${String(err).slice(0, 120)}` })),
        )
      })
    }
    return result
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const { Box, Text, Button } = $.ui.resolve(e)
    const all = await read($, entries)
    const knownList = await read($, known)
    const st = await read($, status)
    const screen = await read($, view)
    const small = (await read($, size)) === 'mini'
    const isKnown = new Set(knownList)
    const go = (v: GlossaryView) => () => setView($, v)

    const back = (
      <Button key="back" label="Back" hotkey="b" role="dismiss" onPress={go('main')} />
    )

    // Every row below is one line on screen (long text is wrapped by hand), so
    // the pane can show exactly what fits under the header.
    const cols = Math.max(12, e.props.bodyColumns)
    const room = Math.max(4, e.props.scroll.bodyRows)
    const at = await read($, scroll)
    const blank = () => <Text> </Text>
    const sticky = (header: RenderElement[], rows: RenderElement[], rule = true) => {
      const fits = rows.length <= room - header.length - (rule ? 1 : 0)
      const space = Math.max(1, room - header.length - 1)
      maxScroll = fits ? 0 : rows.length - space
      const from = Math.min(at ?? 0, maxScroll)
      const shown = fits ? rows : rows.slice(from, from + space)
      let line = '─'.repeat(cols)
      if (!fits) {
        const where = ` ${from > 0 ? '↑' : ' '}${from < maxScroll ? '↓' : ' '} ${from + 1}-${from + shown.length}/${rows.length} `
        line = '─'.repeat(Math.max(0, cols - where.length - 2)) + where + '──'
      }
      return (
        <Box flexDirection="column">
          {header}
          {(rule || !fits) && <Text dimColor wrap="truncate-end">{line}</Text>}
          {shown}
        </Box>
      )
    }

    // ── Manage menu: the two functions ──
    if (screen === 'menu') {
      return (
        <Box flexDirection="column">
          <Text bold>Manage glossary</Text>
          <Text dimColor>{all.length} word(s) saved, {knownList.length} marked as known</Text>
          <Box flexDirection="column" marginTop={1}>
            <Button key="history" label="History log" hotkey="1" onPress={go('history')} />
            <Button key="mark" label="Mark words I know" hotkey="2" onPress={go('mark')} />
            <Button key="help" label="Help" hotkey="3" onPress={go('help')} />
          </Box>
          <Box marginTop={1}>{back}</Box>
        </Box>
      )
    }

    // ── Help: every command and what it does ──
    if (screen === 'help') {
      return (
        <Box flexDirection="column">
          <Box>
            <Button key="back-top" label="Back" onPress={go('menu')} />
            <Text bold>  Help</Text>
          </Box>
          {HELP.map(([c, d]) => (
            <Box flexDirection="column" marginTop={1}>
              <Text bold color="claude">{c}</Text>
              <Text>  {d}</Text>
            </Box>
          ))}
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Keys in the pane</Text>
            <Text dimColor>  ctrl+x tab moves to the pane, then:</Text>
            <Text>  z Full/Mini · m Manage · b Back</Text>
            <Text dimColor>  ctrl+x x hides the pane; /glossary show brings it back.</Text>
            <Text dimColor>  Wheel or PgUp/PgDn scrolls the words; the buttons stay on top.</Text>
            <Text dimColor>  In /glossary: s Show · h Hide · f Full · n Mini · m Manage · c Clear</Text>
            <Text>  1 History · 2 Mark · 3 Help (in Manage)</Text>
          </Box>
        </Box>
      )
    }

    // ── History log: every saved word, grouped by day ──
    if (screen === 'history') {
      const days: { day: string; words: GlossaryEntry[] }[] = []
      for (const x of all) {
        const d = day(x.addedAt)
        const last = days[days.length - 1]
        if (last && last.day === d) last.words.push(x)
        else days.push({ day: d, words: [x] })
      }
      const rows: RenderElement[] = []
      if (all.length === 0) rows.push(<Text dimColor>No words yet.</Text>)
      for (const g of days) {
        if (rows.length) rows.push(blank())
        rows.push(<Text bold underline wrap="truncate-end">{g.day}</Text>)
        for (const x of g.words) {
          const k = isKnown.has(low(x.word))
          rows.push(
            <Text dimColor={k} wrap="truncate-end">
              {k ? '✓ ' : '  '}
              <Text bold>{x.word}</Text>
              {x.ipa ? <Text dimColor> {x.ipa}</Text> : ''}
              {x.translation ? ` (${x.translation})` : ''}
            </Text>,
          )
          for (const l of wrapLines(x.meaning, cols - 4)) {
            rows.push(<Text dimColor={k} wrap="truncate-end">{'    '}{l}</Text>)
          }
        }
      }
      if (all.length) rows.push(blank(), <Text dimColor>✓ = you know it</Text>)
      return sticky(
        [
          <Box>
            <Button key="back-top" label="Back" onPress={go('menu')} />
            <Text bold>  History log</Text>
          </Box>,
        ],
        rows,
      )
    }

    // ── Mark words I know: one toggle per word ──
    if (screen === 'mark') {
      const rows: RenderElement[] = all.map(x => (
        <Button key={`k:${low(x.word)}`} plain onPress={() => toggleKnown($, x.word)}>
          {isKnown.has(low(x.word)) ? '[x] ' : '[ ] '}
          {x.word}
          <Text dimColor>{x.translation ? `  ${x.translation}` : ''}</Text>
        </Button>
      ))
      if (all.length === 0) rows.push(<Text dimColor>No words yet.</Text>)
      const hint = 'Press a word to mark or unmark it. Known words are hidden from the main view and skipped later.'
      return sticky(
        [
          <Box>
            <Button key="back-top" label="Back" onPress={go('menu')} />
            <Text bold>  Mark words I know</Text>
          </Box>,
          ...wrapLines(hint, cols).map(l => <Text dimColor wrap="truncate-end">{l}</Text>),
        ],
        rows,
      )
    }

    // ── Main view, known words hidden ──
    const list = all.filter(x => !isKnown.has(low(x.word)))
    const latest = all[0]?.batch ?? 0

    // The header: the buttons, pinned at the top while the words scroll under it.
    const buttons = (
      <Box>
        <Button
          key="size"
          label={small ? 'Full' : 'Mini'}
          hotkey="z"
          onPress={() => setSize($, small ? 'full' : 'mini')}
        />
        {!small && <Button key="manage" label="Manage" hotkey="m" onPress={go('menu')} />}
        {!small && all.length > 0 && (
          <Button key="clear" label="Clear" onPress={() => clearWords($)} />
        )}
      </Box>
    )
    const statusLine = (
      <Text
        wrap="truncate-end"
        dimColor={st.kind !== 'error'}
        color={st.kind === 'error' ? 'error' : undefined}
      >
        {st.text || `${list.length} word(s)`}
      </Text>
    )

    // ── Mini size: one line per word of the last answer ──
    if (small) {
      const words = list.filter(x => x.batch === latest)
      const rows: RenderElement[] = words.map(x => (
        <Text wrap="truncate-end">
          <Text bold color="claude">{x.word}</Text>
          {x.ipa ? <Text dimColor> {x.ipa}</Text> : ''}
          {x.translation ? <Text dimColor> {x.translation}</Text> : ''}
        </Text>
      ))
      if (words.length === 0) rows.push(<Text dimColor>No new hard words.</Text>)
      return sticky(st.kind !== 'idle' ? [buttons, statusLine] : [buttons], rows, false)
    }

    // Word, then its pronunciation, then the meaning.
    const entryRows = (x: GlossaryEntry): RenderElement[] => [
      <Text wrap="truncate-end">
        <Text bold color="claude">{x.word}</Text>
        {x.ipa ? <Text color="suggestion"> {x.ipa}</Text> : ''}
        {x.translation ? <Text dimColor>  ({x.translation})</Text> : ''}
      </Text>,
      ...wrapLines(x.meaning, cols - 2).map(l => <Text wrap="truncate-end">{'  '}{l}</Text>),
      ...(x.example ? wrapLines(`“${x.example}”`, cols - 2) : []).map(l => (
        <Text dimColor italic wrap="truncate-end">{'  '}{l}</Text>
      )),
      blank(),
    ]

    const newest = list.filter(x => x.batch === latest)
    const older = list.filter(x => x.batch !== latest)
    const rows: RenderElement[] = []
    if (list.length === 0) {
      for (const l of wrapLines("Hard words from Claude's answers will show here.", cols)) {
        rows.push(<Text dimColor wrap="truncate-end">{l}</Text>)
      }
    }
    if (newest.length > 0) {
      rows.push(<Text bold underline>Last answer</Text>, ...newest.flatMap(entryRows))
    }
    if (older.length > 0) {
      rows.push(<Text bold underline>Earlier</Text>, ...older.flatMap(entryRows))
    }
    return sticky([buttons, statusLine], rows)
  })

  // Closing the pane by hand (its close mark, ctrl+x x) counts as hide, so it
  // stays hidden in new sessions until /glossary show.
  on('ui.close', { id: PANE }, async ($, e, next) => {
    const result = await next(e)
    if (e.origin.kind === 'person') {
      await update($, visible, () => false)
      await $.store.set(VISIBLE_KEY, false)
    }
    return result
  })

  // The rows under the header scroll here, not in the engine's window, so the
  // header stays in view. Menu and help are short and scroll the normal way.
  on('ui.scroll', { requestId: PANE }, async ($, e, next) => {
    const screen = await read($, view)
    if (screen === 'menu' || screen === 'help') return next(e)
    const to = e.origin.kind === 'plugin' && e.offset === 0 ? 0 : undefined
    await update($, scroll, s => to ?? Math.max(0, Math.min(maxScroll, (s ?? 0) + e.by)))
    return {}
  })
}
