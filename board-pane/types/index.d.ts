/** How a ticket's `Status:` line is shown: [ ] open, [~] claimed, [x] done, [?] anything else. */
export type TicketState = 'open' | 'claimed' | 'done' | 'other'

export type Ticket = {
  /** The number from the file name, like "07". */
  num: string
  title: string
  /** The raw status word, lowercased, like "open" or "ready-for-agent". */
  status: string
  state: TicketState
}

export type Epic = {
  /** The `.scratch/<folder>` name. */
  folder: string
  /** The first `#` heading of the epic's map.md, or the folder name. */
  name: string
  tickets: Ticket[]
}

declare module 'claude-code' {
  interface PluginState {
    'board-pane': {
      epics: Shaped<Epic[]>
      /** Whether resolved tickets are listed. */
      showDone: boolean
      /** Whether the pane is shown. */
      visible: boolean
      /** The first row shown under the header. */
      scroll: number
      /** When the board was last read, ms since the epoch. 0 = never. */
      readAt: number
    }
  }
}
