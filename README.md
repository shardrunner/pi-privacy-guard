# pi-privacy-guard

Model-scoped best-effort friction against ordinary built-in and optional
`ffgrep`/`fffind` tool access to protected paths in [Pi](https://pi.dev), plus
a short advisory guideline for the listed models. Inert without settings. Not a
security boundary.

## Install

Requires **Pi 0.86.1+** and **Node.js 24+**. Development dependencies pin 0.86.1;
newer Pi versions are intended targets, not a guarantee against upstream API changes.

Clone this repository and register the checkout as a local Pi package:

```sh
pi install /absolute/path/to/privacy-guard
```

Pi loads a local package in place (no copy) and this package has no runtime
dependencies, so no `npm install` is needed to use it. Run `/reload` in existing
Pi instances.

## Configure

Global `~/.pi/agent/settings.json`, optional trusted-project `.pi/settings.json`
override per field. Each project field replaces the corresponding global field.

```json
{
  "privacyGuard": {
    "models": ["provider/model-id"],
    "paths": ["~/private", "/absolute/protected-directory"],
    "keywords": ["private-project"]
  }
}
```

- `models` match full `provider/model` IDs, bare IDs, or slash-delimited
  suffixes (case-sensitive; no wildcards).
- `paths` accept `~`, `@`, absolute, and session-relative forms; absolute paths
  are recommended for global settings.
- `keywords` are case-insensitive substrings of tool input, including nested
  edit arguments, and supply the short model advisory; paths are not added to
  that advisory.

Missing fields default to empty arrays; empty arrays explicitly disable that
field. Invalid configuration reports its filename rather than silently
disabling protection. Settings are loaded and validated once per agent run,
refreshed on the next user prompt or cwd/trust change.

## Scope and limits

This guard does not filter existing conversation history, attachments,
automatic context, or provider payloads. Other custom tools and subagents are
intentionally outside its scope. The ff tools are matched by name only: no
imports, registration, discovery, or installed dependency is required, and their
absence has no effect.

`grep`, `find`, `ffgrep`, and `fffind` are conservatively blocked when their
search root contains a protected directory, including an omitted path. They do
not interpret exclusions; ff path globs check the literal directory prefix
before the first wildcard/brace, and bare filename filters use cwd. `ls` only
checks whether its target is protected. `bash` and `powershell` use substring
checks and are blocked when cwd itself is protected: indirect commands,
variables, globbing, scripts, and alternate spellings can bypass them.
Filesystem races and newly created files through symlink parents are not
hardened. See [the design note](docs/ai/privacy-guard.md).

## Development

```sh
npm ci --ignore-scripts
npm run check
npm pack --dry-run
```

The small offline suite exercises the extension handlers with mocked
Pi/configuration/filesystem APIs, without invoking a provider. Only the entry
point, README, license, and design note ship. No build step is needed; Pi
supplies its SDK at runtime.

[MIT](LICENSE) © 2026 Michael Brunner.
