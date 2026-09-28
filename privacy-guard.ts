import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { CONFIG_DIR_NAME, isToolCallEventType } from "@earendil-works/pi-coding-agent";
import { readFileSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join, relative, resolve, sep } from "node:path";

interface GuardConfig {
	models?: string[];
	paths?: string[];
	keywords?: string[];
}

// Best-effort friction for built-in and ff search tools, not a sandbox or outbound privacy filter.
function readConfig(path: string): GuardConfig {
	try {
		const config = JSON.parse(readFileSync(path, "utf8")).privacyGuard;
		if (config === undefined) return {};
		if (!config || typeof config !== "object" || Array.isArray(config)) {
			throw new Error("privacyGuard must be an object");
		}
		for (const key of ["models", "paths", "keywords"] as const) {
			const value = config[key];
			if (value !== undefined && (!Array.isArray(value) || value.some((v: unknown) => typeof v !== "string" || !v.trim()))) {
				throw new Error(`privacyGuard.${key} must be an array of nonempty strings`);
			}
		}
		return config;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
		throw new Error(`Privacy guard: ${path}: ${String(error)}`);
	}
}

function absolutePath(path: string, cwd: string): string {
	if (path.startsWith("@")) path = path.slice(1);
	if (path === "~") path = homedir();
	else if (path.startsWith("~/")) path = join(homedir(), path.slice(2));
	return resolve(cwd, path);
}

function canonicalPath(path: string): string {
	try {
		return realpathSync(path);
	} catch {
		// New files and unavailable paths still get lexical checks.
		return path;
	}
}

function within(path: string, dir: string): boolean {
	return path === dir || path.startsWith(dir.endsWith(sep) ? dir : dir + sep);
}

function loadGuardConfig(cwd: string, trusted: boolean) {
	const agentDir = process.env.PI_CODING_AGENT_DIR ?? join(homedir(), ".pi", "agent");
	const global = readConfig(join(absolutePath(agentDir, cwd), "settings.json"));
	const project = trusted ? readConfig(join(cwd, CONFIG_DIR_NAME, "settings.json")) : {};
	const paths = (project.paths ?? global.paths ?? []).map((p) => absolutePath(p, cwd));
	const dirs = [...new Set(paths.flatMap((p) => [p, canonicalPath(p)]))];
	const shellPaths = [...new Set(dirs.flatMap((dir) => {
		const local = relative(cwd, dir);
		return [dir, ...(within(dir, homedir()) ? ["~" + dir.slice(homedir().length)] : []),
			...(local ? [local] : [])];
	}))];
	return {
		models: project.models ?? global.models ?? [],
		dirs, shellPaths,
		keywords: (project.keywords ?? global.keywords ?? []).map((k) => k.toLowerCase()),
	};
}

function mentionsKeyword(input: unknown, keywords: string[]): boolean {
	if (typeof input === "string") {
		const lower = input.toLowerCase();
		return keywords.some((k) => lower.includes(k));
	}
	if (input && typeof input === "object") return Object.values(input).some((v) => mentionsKeyword(v, keywords));
	return false;
}

function advisoryLine(keywords: string[]): string {
	return keywords.length ? `Do not interact with ${keywords.map((k) => `\`${k}\``).join(", ")} dirs or tools.`
		: "Access to protected paths is restricted for this model.";
}

export default function (pi: ExtensionAPI) {
	// Read settings once per run, not on every tool call. Also handle session cwd/trust changes.
	let cached: { cwd: string; trusted: boolean; config?: ReturnType<typeof loadGuardConfig>; error?: unknown } | undefined;
	function configFor(cwd: string, trusted: boolean) {
		if (!cached || cached.cwd !== cwd || cached.trusted !== trusted) {
			cached = { cwd, trusted };
			try { cached.config = loadGuardConfig(cwd, trusted); }
			catch (error) { cached.error = error; }
		}
		if (cached.error) throw cached.error;
		return cached.config!;
	}
	function restricted(model: { provider: string; id: string } | undefined, models: string[]) {
		if (!model) return false;
		const full = `${model.provider}/${model.id}`;
		return models.some((m) => m === full || m === model.id || full.endsWith(`/${m}`));
	}

	pi.on("before_agent_start", async (event, ctx) => {
		cached = undefined;
		const { models, keywords } = configFor(ctx.cwd, ctx.isProjectTrusted());
		if (restricted(ctx.model, models) && keywords.length) {
			event.systemPromptOptions.promptGuidelines.push(advisoryLine(keywords));
		}
	});

	pi.on("tool_call", async (event, ctx) => {
		// Name-only matching: ff tools are optional, with no dependency or discovery needed.
		const ffTool = event.toolName === "ffgrep" || event.toolName === "fffind";
		const fileTool = ffTool || ["read", "write", "edit", "grep", "find", "ls"].includes(event.toolName);
		const shellTool = event.toolName === "bash" || event.toolName === "powershell";
		if (!fileTool && !shellTool) return;
		const { models, dirs, keywords, shellPaths } = configFor(ctx.cwd, ctx.isProjectTrusted());
		if (!restricted(ctx.model, models) || (!dirs.length && !keywords.length)) return;
		const blocked = { block: true, reason: `${advisoryLine(keywords)} Continue without it; do not retry via another tool.` };
		if (keywords.length && mentionsKeyword(event.input, keywords)) return blocked;
		if (!dirs.length) return;

		if (shellTool) {
			const cwd = canonicalPath(ctx.cwd);
			const command = (event.input as { command: string }).command;
			if (dirs.some((d) => within(ctx.cwd, d) || within(cwd, d)) || shellPaths.some((p) => command.includes(p))) return blocked;
			return;
		}

		let scope = (event.input as { path?: string }).path ?? ".";
		if (ffTool) {
			// ff paths can be filename filters or globs, not just directory roots.
			// Check the literal directory prefix; do not interpret glob alternatives/exclusions.
			const glob = scope.search(/[*?\[\]{}]/);
			if (glob >= 0) {
				const prefix = scope.slice(0, glob);
				scope = prefix.slice(0, prefix.lastIndexOf("/") + 1) || ".";
			} else if (!scope.includes("/") && scope !== "~") scope = ".";
		}
		const path = absolutePath(scope, ctx.cwd);
		const target = canonicalPath(path);
		const recursive = ffTool || isToolCallEventType("grep", event) || isToolCallEventType("find", event);
		if (dirs.some((d) => within(path, d) || within(target, d) || (recursive && (within(d, path) || within(d, target))))) return blocked;
	});
}
