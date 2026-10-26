# pi-privacy-guard

> **Disclaimer:** This extension is vibe coded for personal use. Use at your own risk.

Make it harder for selected models in [Pi](https://pi.dev) to read sensitive paths by
accident. Tool calls are checked against configured paths and keywords, and the model
gets a short reminder in its prompt. **This is not a security boundary.**

## Why

- Coding agents explore the filesystem on their own and can wander into private directories by accident.
- Some models may see everything while others shouldn't, so the guard applies only to the models you choose.

## Features

- Only applies to the models you list.
- Blocks built-in tool calls (and the optional `ffgrep`/`fffind` tools) that touch
  protected paths or contain protected keywords.
- Adds a short note about protected topics to the system prompt.
- Global settings with per-field overrides for trusted projects. Does nothing until
  configured.

## Installation

Requires **Pi 0.87.1+** and **Node.js 24+**.

```sh
pi install git:github.com/shardrunner/pi-privacy-guard
```

Run `/reload` in open Pi sessions. Update with `pi update --extensions`.
For local development, install a checkout instead
(`pi install /absolute/path/to/pi-privacy-guard`). No runtime dependencies, no build step.

## Usage

Add models, paths and keywords to your settings (see below). From the next agent run
onward, covered tool calls by listed models are checked. Calls that touch protected paths or
keywords are blocked, and the model gets a short reason telling it not to retry.

## Configuration

Add settings to the global `~/.pi/agent/settings.json`. In a trusted project's
`.pi/settings.json`, each field you set replaces the global one.

```json
{
  "privacyGuard": {
    "models": ["provider/model-id"],
    "paths": ["~/private", "/absolute/protected-directory"],
    "keywords": ["private-project"]
  }
}
```

- `models`: matched against the selected model by full `provider/model` ID, bare ID or
  slash-separated suffix (case-sensitive, no wildcards). For virtual models, list the
  virtual ID itself (e.g. `router/auto`); listing only the models it routes to does not
  cover it.
- `paths`: `~`, `@`, absolute or session-relative paths. Use absolute paths in global
  settings.
- `keywords`: case-insensitive substrings matched against tool input, including nested
  edit arguments. Keywords also go into the model reminder; paths do not.

Missing fields count as empty, and an empty array turns that field off. Invalid
settings are reported with the file name instead of quietly turning protection off.
Settings are loaded once per agent run and reloaded on the next prompt or when the
working directory or trust changes.

## Behavior and limitations

- Not covered: existing conversation history, attachments, automatic context, provider
  payloads, other custom tools, subagents and MCP tools (whether called directly or
  through codemode). Codemode's nested calls to covered tools are checked.
- `grep`, `find`, `ffgrep` and `fffind` are blocked if their search root contains a
  protected directory, including when no path is given. Exclusions are ignored. `ls`
  only checks its target.
- `bash` and `powershell` only get substring checks and are blocked if the working
  directory itself is protected. Indirect commands, variables, globs, scripts and
  alternate spellings can get around this.
- Filesystem races and files newly created through symlinked parent directories are not
  handled.

See the [design note](docs/ai/privacy-guard.md) for details.

## Development

```sh
npm ci --ignore-scripts
npm run check
npm pack --dry-run
```

Requires Node.js 24+. The offline test suite runs the extension with mocked Pi,
settings and filesystem APIs and makes no provider calls. Only the entry point, README,
license and design note are published.

## License

[MIT](LICENSE) © 2026 Michael Brunner
