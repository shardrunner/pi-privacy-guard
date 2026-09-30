---
summary: Lightweight model-scoped guard for Pi built-in and optional ff search tool access.
read_when:
  - Changing privacy-guard/privacy-guard.ts or its configuration and tests.
---

# Privacy guard

`privacy-guard.ts` adds best-effort friction against ordinary built-in and optional `ffgrep`/`fffind` tool access, not a security boundary. It does not filter existing conversation history, attachments, automatic context, or provider payloads. Other custom tools and subagents are intentionally outside its scope. The ff tools are matched by name only: no imports, registration, discovery, or installed dependency is required, and their absence has no effect.

In Pi 0.99.0, nested codemode calls to covered tools go through the existing `tool_call` hook. MCP tools (`mcp__<server>__<tool>`) and resource tools (`list_mcp_resources`, `list_mcp_resource_templates`, `read_mcp_resource`) are outside coverage, directly or through codemode. The guard does not filter codemode itself or provide a privacy sandbox.

Configure `privacyGuard` in agent `settings.json`, or trusted project `.pi/settings.json`:

```json
{
  "privacyGuard": {
    "models": ["provider/model-id"],
    "paths": ["~/private", "/absolute/protected-directory"],
    "keywords": ["private-project"]
  }
}
```

Each project field replaces the corresponding global field. Missing fields default to empty arrays; empty arrays explicitly disable that field. Models match full provider/model IDs, bare IDs, or slash-delimited suffixes (case-sensitive; no wildcards). Keywords are case-insensitive substrings of tool input, including nested edit arguments. Keywords also supply the short model advisory; paths are not added to that advisory.

Model matching uses the selection in `ctx.model`, not the routed physical model. To restrict a virtual selection, include its virtual ID (e.g. `router/auto`) in `models`; matching only its physical targets does not cover that selection. This is not a physical-provider policy.

Settings are loaded and validated once per agent run, refreshed on the next user prompt or cwd/trust change. Invalid configuration reports its filename rather than silently disabling protection. A cached configuration error also rejects subsequent covered tool calls. No file watching, subprocesses, or per-call settings reads.

File tools normalize `@`, `~`, and relative paths against the session cwd. Existing symlinks are resolved with one synchronous realpath lookup per checked file-tool call. Relative configured paths also use the session cwd; absolute paths are recommended for global settings. New/unavailable paths receive lexical checks only.

`grep`, `find`, `ffgrep`, and `fffind` are conservatively blocked when their search root contains a protected directory, including an omitted path. They do not attempt to interpret exclusions. For ff path globs, the literal directory prefix before the first wildcard/brace is checked; bare filename filters use cwd. This may overblock glob patterns that would not actually match protected files. Keyword checks also cover ff inputs. `ls` only checks whether its target is protected.

`bash` and `powershell` use substring checks for absolute, home-shortened, and cwd-relative protected paths, and are blocked when cwd itself is protected. This deliberately does not parse shell syntax: indirect commands, variables, globbing, scripts, and alternate spellings can bypass it. Substring checks may overblock similar names. Filesystem races and newly created files through symlink parents are not hardened.

Tests (Node with native TypeScript support):

```sh
npm run check
```

The harness exercises both extension handlers with mocked Pi/configuration/filesystem APIs, without invoking a provider.
