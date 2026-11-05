import { expect, mock, test } from 'claude-code/testing'

const PANE = {
  plugin: 'board-pane',
  component: 'Pane',
  requestId: 'board',
  props: {
    title: 'Board',
    isFocused: false,
    bodyColumns: 40,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 20 },
    view: {},
  },
} as const

const FILES: Record<string, string> = {
  '/p/.scratch/etl/map.md': '# ETL map\n',
  '/p/.scratch/etl/issues/01-setup-gcloud.md': '# 01: Setup gcloud\n\nType: task\nStatus: resolved\n',
  '/p/.scratch/etl/issues/02-query.md': 'Type: task\nStatus: claimed\n',
  '/p/.scratch/etl/issues/03-board-pane.md': '# 03: Board pane mod\n\n**Status:** ready-for-agent\n',
}

const entry = (name: string, kind: 'file' | 'dir') => ({ name, kind, size: 0, mtimeMs: 0, isLink: false })

test('the pane lists tickets by epic, done hidden by default', async ($, on) => {
  mock.clock(on)
  mock.store(on)
  on('command.register', () => ({ value: { command: 'board' } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_, e) => ({ cwd: e.cwd }))
  on('session.root', () => ({ value: '/p' }))
  on('fs.list', (_, e) => {
    if (e.path === '/p/.scratch') return { value: [entry('etl', 'dir'), entry('empty', 'dir')] }
    if (e.path === '/p/.scratch/etl/issues')
      return { value: ['01-setup-gcloud.md', '02-query.md', '03-board-pane.md'].map(n => entry(n, 'file')) }
    return { value: [] }
  })
  on('fs.read', (_, e) => (e.path in FILES ? { value: FILES[e.path] } : { error: 'ENOENT' }))

  await $.session.start({ cwd: '/p', surface: 'terminal', isInteractive: true })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal' })

  expect((await ui.find({ type: 'Text', text: /^etl\s+open 1  claimed 1  done 1$/ }))?.text).toBeTruthy()
  expect((await ui.find({ type: 'Text', text: /#02 \[~\] query/ }))?.text).toBe('  #02 [~] query')
  expect((await ui.find({ type: 'Text', text: /#03 \[ \] Board pane mod/ }))?.text).toBe('  #03 [ ] Board pane mod')
  expect(await ui.find({ type: 'Text', text: /Setup gcloud/ })).toBeUndefined()
  expect((await ui.find({ type: 'Text', text: /1 done hidden/ }))?.text).toBeTruthy()
  await ui.unmount()
})
