# glossary-pane

A Claude Code mod for people who read English as a second language.

After each answer from Claude, a side pane lists the hard English words from that answer. For each word it shows:

- its IPA pronunciation, like /ˈmɪt.ɪ.ɡeɪt/
- a very simple English meaning
- a short translation (Vietnamese by default)
- a short example sentence

New words go at the top under **Last answer**. Older words stay below under **Earlier**, and they are kept between sessions so you can review them.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install glossary-pane --marketplace anhnd-ns/glossary-pane
```

Answer `y` to add the marketplace, then pick the **user** scope so it works in every project.

From a shell:

```
claude plugin install glossary-pane --marketplace anhnd-ns/glossary-pane
```

In the desktop app: click **+** next to the prompt box, then **Plugins**, **Add marketplace** with `anhnd-ns/glossary-pane`, then **Add plugin**.

## Use

- The pane opens by itself when the terminal is wide enough (fullscreen layout, about 110+ columns).
- The pane's buttons (**Show/Hide**, **Manage**, **Clear**) sit in a header that stays at the top while the words scroll under it. **Clear** empties the word list.

### Settings panel

Type `/glossary` to open a small settings panel, like `/usage`. It does not write anything into the chat. Press **Esc** (or **Close**) to close it.

In the panel:

- **Pane**: **Show** (`s`) or **Hide** (`h`)
- **Size**: **Full** (`f`) or **Mini** (`n`)
- **Words**: **Manage** (`m`) and **Clear history** (`c`)
- **Options**: your translation language and model (change them in `/config`)
- **Commands**: every `/glossary` command

`/glossary` runs at once, even while Claude is still answering, like `/config`.

### Show/hide and size

Two separate settings, both kept in new sessions:

| Command | What it does |
| --- | --- |
| `/glossary show` | Show the pane |
| `/glossary hide` | Hide the pane (words are still collected) |
| `/glossary toggle` | Show or hide the pane |
| `/glossary full` | Full size: meanings and examples |
| `/glossary mini` | Mini size: one line per word (word + IPA + translation) from the last answer |
| `/glossary manage` | Open the Manage menu in the pane |
| `/glossary clear` | Delete the word history (known words are kept) |

These commands show a short notice, never a chat message. The pane's **Full/Mini** button (`z`) also switches the size. Closing the pane with its close mark or `ctrl+x x` hides it, until `/glossary show`.

The pane has no background of its own, so it keeps your terminal's colors.

To turn the glossary off completely (no pane, no word lookups), disable the plugin with `/plugin`.

- `ctrl+x tab` moves focus to the pane; arrow keys scroll it.

### Manage menu

Press **Manage** at the top of the pane (or type `/glossary manage`). It has two functions:

1. **History log**: every saved word, grouped by day. Words you know have a ✓.
2. **Mark words I know**: press a word to mark it as known (`[x]`). Known words are hidden from the main view, and the mod tells the model to skip them in later answers. Press again to unmark.

3. **Help**: every command and the pane's keys.

Press **Back** to go back. Your history (up to 500 words) and your known words are kept between sessions.

## Settings

Open `/config` to change:

- **Translation language** (default `Vietnamese`)
- **Model** used to pick and explain words (default `haiku`, which is fast and cheap)

## How it works

When a turn ends, the mod sends Claude's final answer to a small model, which picks up to 10 words a B1-level reader may not know and explains them. This costs a small amount of tokens per answer, billed to your Claude account.

## License

MIT
