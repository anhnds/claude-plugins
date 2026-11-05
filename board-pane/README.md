# board-pane

A Claude Code mod that shows your local tickets in a side pane on the right, like the GitHub issue list.

It reads every `.scratch/<epic>/issues/*.md` file in the current project (the files the `/to-tickets` and `wayfinder` skills write) and lists them grouped by epic, in plain ASCII text:

```
BOARD  .scratch            9 open  14:05
----------------------------------------
etl            open 3  claimed 1  done 6
  #10 [~] Chot cach lap du lieu bronze
  #09 [ ] Tu tinh ZGL01V tu bronze
  (+6 done hidden)
```

Marks: `[ ]` open, `[~]` claimed, `[x]` done, `[?]` other. The status comes from the ticket's `Status:` line; the title from its first `#` heading (or the file name).

The board is read again when a session starts, after each answer, when Claude writes into `.scratch`, and every 15 seconds.

## Use

- The pane opens by itself on a wide terminal (fullscreen layout).
- `/board` opens a small settings panel: show/hide the pane, show/hide resolved tickets, refresh now. Esc closes it.
- `/board show`, `/board hide`, `/board done` (toggle resolved), `/board refresh`.
- The list is read-only; edit the ticket files to change it.

## Install

```
/plugin marketplace add anhnds/claude-plugins
/plugin install board-pane@anhnds-plugins
```

Pick the **user** scope so it works in every project. From a shell: `claude plugin install board-pane --marketplace anhnds/claude-plugins`.
