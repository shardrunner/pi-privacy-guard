# pi-privacy-guard

> **Disclaimer:** This extension is vibe coded for personal use. Use at your own risk.

Add friction against accidental access to sensitive paths when using selected
models in [Pi](https://pi.dev). Checks ordinary built-in and optional
`ffgrep`/`fffind` tool calls against configured paths and keywords, and adds a
short advisory guideline. Inert without settings. **Not a security boundary.**

## Install

Requires **Pi 0.87.1+** and **Node.js 24+**. Development dependencies pin 0.87.1;
newer Pi versions are intended targets, not a guarantee against upstream API changes.

Install from GitHub; Pi clones it and `pi update --extensions` keeps it current:

```sh
pi install git:github.com/shardrunner/pi-privacy-guard
```

For development, register a local checkout instead:

```sh
pi install /absolute/path/to/pi-privacy-guard
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

- `models` match the selected model (`ctx.model`) by full `provider/model` ID,
  bare ID, or slash-delimited suffix (case-sensitive; no wildcards). For virtual
  models, include the selected virtual ID (e.g. `router/auto`); entries for its
  routed physical models alone do not cover that selection. This is not a
  physical-provider policy.
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

In Pi 0.99.0, codemode's nested calls to covered tools use the existing guard
hooks. MCP tools (`mcp__<server>__<tool>`) and resource tools
(`list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`) are
not covered, whether called directly or through codemode. Codemode itself is
not filtered or treated as a privacy sandbox by this guard.

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
