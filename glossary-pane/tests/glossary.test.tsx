import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'glossary-pane',
  component: 'Pane',
  requestId: 'glossary',
  props: {
    title: 'Glossary',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const REPLY = JSON.stringify([
  {
    word: 'mitigate',
    meaning: 'make a problem less bad',
    ipa: 'ˈmɪt.ɪ.ɡeɪt',
    translation: 'giảm nhẹ',
    example: 'We mitigate the risk.',
  },
])

test('a finished answer fills the pane with its hard words', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'glossary' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', () => ({
    value: { isAnswered: true, text: REPLY, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
  }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.complete({
    answer: 'We should mitigate this risk before the release goes out to everyone.',
    reason: 'answer',
    isAborted: false,
    durationMs: 10,
    turnId: 't1',
  })
  await clock.advance(10)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    expect((await ui.find({ type: 'Text', text: /mitigate/ }))?.text).toContain('mitigate')
    expect(await ui.find({ type: 'Text', text: /less bad/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the pane says what it is for when empty', async $ => {
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Hard words/ })).toBeDefined()
  await ui.unmount()
})

test('manage menu: mark a word as known, it leaves the main view and shows ✓ in history', async ($, on) => {
  const clock = mock.clock(on, { now: Date.UTC(2026, 10, 3, 12) })
  mock.store(on)
  on('command.register', () => ({ value: { command: 'glossary' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', () => ({
    value: { isAnswered: true, text: REPLY, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
  }))
  on('turn.complete', (_, e) => ({ text: e.answer }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.complete({
    answer: 'We should mitigate this risk before the release goes out to everyone.',
    reason: 'answer',
    isAborted: false,
    durationMs: 10,
    turnId: 't1',
  })
  await clock.advance(10)

  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface })
    await ui.press({ key: 'manage' })
    expect(await ui.find({ type: 'Text', text: /Manage glossary/ })).toBeDefined()

    await ui.press({ key: 'mark' })
    await ui.press({ key: 'k:mitigate' })
    await ui.press({ key: 'back-top' })
    await ui.press({ key: 'history' })
    expect((await ui.find({ type: 'Text', text: /mitigate/ }))?.text).toContain('✓')

    await ui.press({ key: 'back-top' })
    await ui.press({ key: 'back' })
    expect(await ui.find({ type: 'Text', text: /less bad/ })).toBeUndefined()

    // Unmark again so the next surface starts the same.
    await ui.press({ key: 'manage' })
    await ui.press({ key: 'mark' })
    await ui.press({ key: 'k:mitigate' })
    await ui.press({ key: 'back-top' })
    await ui.press({ key: 'back' })
    expect(await ui.find({ type: 'Text', text: /less bad/ })).toBeDefined()
    await ui.unmount()
  }
})

test('show and hide open and close the pane, toggle switches them, and nothing goes in the chat', async ($, on) => {
  mock.store(on)
  const open = new Set<string>()
  const registered: { immediate?: true }[] = []
  on('command.register', (_, e) => {
    registered.push(e)
    return { value: { command: 'glossary' } }
  })
  on('ui.open', (_, e) => {
    open.add(e.id)
    return { value: { isPlaced: true } }
  })
  on('ui.close', (_, e) => {
    open.delete(e.id)
    return { value: undefined }
  })
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))

  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  // Runs at once, like /config, even mid-answer.
  expect(registered[0]?.immediate).toBe(true)
  expect(open.has('glossary')).toBe(true)

  expect((await $.command.run({ command: 'glossary', args: 'hide' })).text).toBeUndefined()
  expect(open.has('glossary')).toBe(false)
  expect((await $.command.run({ command: 'glossary', args: 'show' })).text).toBeUndefined()
  expect(open.has('glossary')).toBe(true)

  await $.command.run({ command: 'glossary', args: 'toggle' })
  expect(open.has('glossary')).toBe(false)
  await $.command.run({ command: 'glossary', args: 'toggle' })
  expect(open.has('glossary')).toBe(true)
})

test('full and mini set the size, and the pane button switches it', async ($, on) => {
  mock.store(on)
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('command.register', () => ({ value: { command: 'glossary' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  // Starts full size.
  expect(await ui.find({ type: 'Text', text: /Hard words from Claude/ })).toBeDefined()
  await $.command.run({ command: 'glossary', args: 'mini' })
  expect(await ui.find({ type: 'Text', text: /No new hard words/ })).toBeDefined()
  await $.command.run({ command: 'glossary', args: 'full' })
  expect(await ui.find({ type: 'Text', text: /Hard words from Claude/ })).toBeDefined()
  // Toggle is about showing, not size.
  await $.command.run({ command: 'glossary', args: 'toggle' })
  await $.command.run({ command: 'glossary', args: 'toggle' })
  expect(await ui.find({ type: 'Text', text: /Hard words from Claude/ })).toBeDefined()

  await ui.press({ key: 'size' })
  expect(await ui.find({ type: 'Text', text: /No new hard words/ })).toBeDefined()
  await ui.unmount()
})

test('a hidden pane stays hidden in the next session, and opens with a clear background', async ($, on) => {
  mock.store(on)
  const opened: { id: string; backgroundColor?: unknown }[] = []
  on('command.register', () => ({ value: { command: 'glossary' } }))
  on('ui.open', (_, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('ui.close', () => ({ value: undefined }))
  on('ui.toast', () => ({ value: undefined }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(opened.length).toBe(1)
  // Keeps the terminal's colors.
  expect(opened[0]?.backgroundColor).toBe('transparent')

  await $.command.run({ command: 'glossary', args: 'hide' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(opened.length).toBe(1)

  await $.command.run({ command: 'glossary', args: 'show' })
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(opened.length).toBe(3)
})

test('a person in hide mode in 0.6.0 starts with the mini size, pane shown', async ($, on) => {
  mock.store(on, { 'mode-1': 'hide' })
  const opened: string[] = []
  on('command.register', () => ({ value: { command: 'glossary' } }))
  on('ui.open', (_, e) => {
    opened.push(e.id)
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  expect(opened).toEqual(['glossary'])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /No new hard words/ })).toBeDefined()
  await ui.unmount()
})

test('a person who hid the pane in 0.4.0 starts with the mini size', async ($, on) => {
  mock.store(on, { 'hidden-1': true })
  on('command.register', () => ({ value: { command: 'glossary' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /No new hard words/ })).toBeDefined()
  await ui.unmount()
})

test('/glossary opens a settings panel like /usage, with nothing in the chat', async ($, on) => {
  mock.store(on)
  const opened: { id: string; focus?: true; closeOnEscape?: true }[] = []
  on('command.register', () => ({ value: { command: 'glossary' } }))
  on('ui.open', (_, e) => {
    opened.push(e)
    return { value: { isPlaced: true } }
  })
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const out = await $.command.run({ command: 'glossary', args: '' })
  expect(out.text).toBeUndefined()
  const settings = opened.find(o => o.id === 'glossary-settings')
  expect(settings?.focus).toBe(true)
  expect(settings?.closeOnEscape).toBe(true)

  const ui = await $.ui.mount({ ...PANE, requestId: 'glossary-settings', props: { ...PANE.props, title: 'Glossary settings' }, surface: 'terminal' })
  expect(await ui.find({ type: 'Text', text: /Change them in \/config/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\/glossary toggle/ })).toBeDefined()
  await ui.press({ key: 'mini' })
  await ui.unmount()

  // The main pane is now mini.
  const pane = await $.ui.mount({ ...PANE, surface: 'terminal' })
  expect(await pane.find({ type: 'Text', text: /No new hard words/ })).toBeDefined()
  await pane.unmount()
})

test('the Manage menu has a Help screen', async ($, on) => {
  mock.store(on)
  on('command.register', () => ({ value: { command: 'glossary' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })
  await ui.press({ key: 'manage' })
  await ui.press({ key: 'help' })
  expect(await ui.find({ type: 'Text', text: /Mini size: one line per word/ })).toBeDefined()
  await ui.unmount()
})

const MANY = JSON.stringify(
  Array.from({ length: 10 }, (_, i) => ({
    word: `word${i}`,
    meaning: `meaning number ${i}`,
    ipa: `/wɜːd${i}/`,
    translation: `từ ${i}`,
    example: `Example ${i}.`,
  })),
)

test('the buttons sit in a header above the words, only what fits is drawn, IPA sits after the word', async ($, on) => {
  const clock = mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'glossary' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('model.complete', () => ({
    value: { isAnswered: true, text: MANY, usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 } },
  }))
  on('turn.complete', (_, e) => ({ text: e.answer }))
  await $.session.start({ cwd: '/', surface: 'desktop', isInteractive: true })
  await $.turn.complete({
    answer: 'A long answer with many hard words in it, long enough to explain.',
    reason: 'answer',
    isAborted: false,
    durationMs: 10,
    turnId: 't1',
  })
  await clock.advance(10)

  for (const surface of ['terminal', 'desktop'] as const) {
    const props = { ...PANE.props, scroll: { offset: 0, bodyRows: 12 } }
    const ui = await $.ui.mount({ ...PANE, props, surface })
    // The first thing drawn is the button row, then the status and the rule.
    expect(await ui.find({ type: 'Button', key: 'manage' })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /word0/ }))?.text).toMatch(/word0 \/wɜːd0\/ +\(từ 0\)/)
    // Only what fits under the header is drawn.
    expect(await ui.find({ type: 'Text', text: /word9/ })).toBeUndefined()

    // The rule under the header says where the window is.
    expect(await ui.find({ type: 'Text', text: /↓ 1-\d+\/\d+/ })).toBeDefined()
    await ui.unmount()
  }
})
