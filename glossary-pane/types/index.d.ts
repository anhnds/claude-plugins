export type GlossaryEntry = {
  word: string
  meaning: string
  translation: string
  example: string
  /** IPA pronunciation, like /ˈwɜːrd/. Missing on words saved before 0.6.0. */
  ipa?: string
  batch: number
  /** When the word was found, in ms since the epoch. Missing on words saved by 0.1.0. */
  addedAt?: number
}

export type GlossaryStatus = { kind: 'idle' | 'working' | 'error'; text: string }

/** Which screen the pane shows. */
export type GlossaryView = 'main' | 'menu' | 'history' | 'mark' | 'help'

/** full: every word with meanings and examples. mini: one line per word of the last answer. */
export type GlossarySize = 'full' | 'mini'

declare module 'claude-code' {
  interface PluginState {
    'glossary-pane': {
      entries: Shaped<GlossaryEntry[]>
      /** Words the reader already knows, lowercased. */
      known: Shaped<string[]>
      status: GlossaryStatus
      batch: number
      view: GlossaryView
      size: GlossarySize
      /** Whether the pane is shown. Hidden, words are still collected. */
      visible: boolean
      /** The first row shown under the pinned header, in rows of the scrolled list. */
      scroll: number
    }
  }
}
