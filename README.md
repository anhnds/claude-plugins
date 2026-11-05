# anhnds-plugins

A small marketplace of Claude Code plugins by [anhnds](https://github.com/anhnds).

| Plugin | Version | What it does |
| --- | --- | --- |
| [glossary-pane](./glossary-pane) | 0.7.1 | A side pane that lists hard English words from Claude's last answer, with IPA, a simple meaning, a translation and an example |
| [board-pane](./board-pane) | 0.1.0 | A side pane that lists local tickets from `.scratch/*/issues`, grouped by epic, as plain ASCII text |

## Installation

You need [Claude Code](https://claude.com/claude-code) installed. The marketplace is this GitHub repo, `anhnds/claude-plugins`, and its name is `anhnds-plugins`.

### Option 1: inside a Claude Code session

Add the marketplace, then install the plugin:

```
/plugin marketplace add anhnds/claude-plugins
/plugin install glossary-pane@anhnds-plugins
```

When asked, pick the **user** scope so the plugin works in every project.

You can also run `/plugin` alone and browse the marketplace in the menu.

### Option 2: from a shell

One command adds the marketplace (if needed) and installs the plugin:

```sh
claude plugin install glossary-pane --marketplace anhnds/claude-plugins
```

Or in two steps:

```sh
claude plugin marketplace add anhnds/claude-plugins
claude plugin install glossary-pane@anhnds-plugins
```

The default scope is `user`. Use `--scope project` to share it with your team through the project's `.claude/settings.json`, or `--scope local` for this project only.

You can set plugin options at install time:

```sh
claude plugin install glossary-pane@anhnds-plugins --config language=Japanese
```

### Option 3: in the desktop app

Click **+** next to the prompt box, then **Plugins** → **Add marketplace**, enter `anhnds/claude-plugins`, then **Add plugin** and choose **glossary-pane**.

### Check that it works

Start a new session (or restart the current one), then type `/glossary`. A small settings panel should open. Ask Claude anything, and the glossary pane will fill with words after the answer (the pane needs a wide terminal, about 110+ columns).

### Update

```sh
claude plugin marketplace update anhnds-plugins
```

Then restart Claude Code to load the new version.

### Disable or uninstall

```sh
claude plugin disable glossary-pane@anhnds-plugins     # turn it off, keep it installed
claude plugin uninstall glossary-pane@anhnds-plugins   # remove it
claude plugin marketplace remove anhnds-plugins        # remove the marketplace too
```

All of these also work as `/plugin ...` inside a session.

## Plugin settings

Each plugin has its own README with full usage. For glossary-pane, open `/config` to change:

- **Translation language**: default `Vietnamese`
- **Model**: the model that picks and explains words, default `haiku`

See [glossary-pane/README.md](./glossary-pane/README.md) for commands, keys and how it works.

## Development

Clone the repo and load a plugin straight from the folder, without installing:

```sh
git clone https://github.com/anhnds/claude-plugins.git
cd claude-plugins
claude --plugin-dir ./glossary-pane
```

Or add your local clone as a marketplace:

```sh
claude plugin marketplace add ./
claude plugin install glossary-pane@anhnds-plugins
```

Repo layout:

```
.claude-plugin/marketplace.json   # marketplace manifest (lists the plugins)
glossary-pane/                    # one folder per plugin
  .claude-plugin/plugin.json      # plugin manifest (name, version, options)
  hooks/                          # hooks module (register.tsx)
  tests/
  types/
```

When you release a new version, bump `version` in the plugin's `plugin.json` (and `VERSION` in `glossary-pane/hooks/register.tsx`, which the `/glossary` panel shows).

## License

MIT. See each plugin's `LICENSE` file.
