# nuwii

keyboard-driven bookmark manager. scrollable workspace of link cards, launch by key press.

| command | does |
|---|---|
| `bun install` | install deps |
| `bun run dev` | vite dev server |
| `bun run build` | build to `dist/` |

| key | does |
|---|---|
| `a`..`z` | jump to category, press again for its link |
| `1`..`0` | launch favorite |
| `/` or `space` | focus search, `:g` `:y` `:gh` bangs |
| `h` / `l` | prev / next category |
| `Ctrl+E` | edit mode |
| `+` | add bookmark |
| `?` | shortcut sheet |
| `Esc` | back |

state lives in `localStorage` (`nuwii_*` keys). export / import the whole config as JSON from the Config pill.
