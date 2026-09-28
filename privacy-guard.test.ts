import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { join, resolve, relative, sep } from "node:path";
import test from "node:test";
import vm from "node:vm";

// Exercise the single-file extension without loading Pi or calling a provider.
const source = stripTypeScriptTypes(readFileSync(new URL("./privacy-guard.ts", import.meta.url), "utf8"))
	.replace(/^import .*;$/gm, "")
	.replace(/export default function\s*\(pi\s*\)/, "function register(pi)");

type Handler = (event: unknown, ctx: unknown) => Promise<{ block?: boolean } | undefined>;
type Ctx = { cwd: string; model: { provider: string; id: string }; isProjectTrusted: () => boolean };

function harness(overrides: Record<string, unknown> = {}, project?: Record<string, unknown>) {
	const handlers: Record<string, Handler> = {};
	const files = new Map([["/agent/settings.json", JSON.stringify({ privacyGuard: {
		models: ["test/model"], paths: ["/home/test/private"], keywords: [], ...overrides,
	} })]]);
	if (project) files.set("/project/.pi/settings.json", JSON.stringify({ privacyGuard: project }));
	let reads = 0;
	const sandbox: Record<string, any> = {
		process: { env: { PI_CODING_AGENT_DIR: "/agent" } },
		homedir: () => "/home/test", join, resolve, relative, sep,
		CONFIG_DIR_NAME: ".pi", isToolCallEventType: (name: string, event: { toolName: string }) => event.toolName === name,
		readFileSync(path: string) {
			reads++;
			const value = files.get(path);
			if (value === undefined) throw Object.assign(new Error("Missing"), { code: "ENOENT" });
			return value;
		},
		realpathSync(path: string) { return path.replace(/^\/alias(?=\/|$)/, "/home/test/private"); },
	};
	vm.createContext(sandbox);
	vm.runInContext(source, sandbox);
	(sandbox.register as (pi: unknown) => void)({ on: (name: string, fn: Handler) => { handlers[name] = fn; } });
	const ctx: Ctx = { cwd: "/project", model: { provider: "test", id: "model" }, isProjectTrusted: () => false };
	function handler(name: string): Handler {
		const fn = handlers[name];
		if (!fn) throw new Error(`missing handler ${name}`);
		return fn;
	}
	return {
		ctx, files, reads: () => reads,
		start: () => handler("before_agent_start")({ systemPromptOptions: { promptGuidelines: [] } }, ctx),
		call: async (toolName: string, input: unknown) =>
			(await handler("tool_call")({ toolName, input }, ctx))?.block === true,
	};
}

test("normalizes absolute, tilde, @, session-relative and symlink paths", async () => {
	const h = harness({ paths: ["/home/test/private", "/project/secret"] });
	for (const path of ["/home/test/private/key", "~/private/key", "@/home/test/private/key", "secret/key", "/alias/key"]) {
		assert.equal(await h.call("read", { path }), true, path);
	}
	assert.equal(await h.call("read", { path: "/home/test/private-other/key" }), false);
});

test("blocks common shell spellings but leaves ordinary commands alone", async () => {
	const h = harness({ paths: ["/home/test/private", "/project/secret"] });
	for (const command of ["cat /home/test/private/key", "cat ~/private/key", "cat secret/key", "cat ./secret/key"]) {
		assert.equal(await h.call("bash", { command }), true, command);
	}
	assert.equal(await h.call("bash", { command: "git status" }), false);
});

test("recursive searches cannot include protected descendants, including default cwd", async () => {
	const h = harness({ paths: ["/project/secret"] });
	for (const tool of ["grep", "find"]) {
		assert.equal(await h.call(tool, { pattern: "*" }), true);
		assert.equal(await h.call(tool, { path: "/project", pattern: "*" }), true);
		assert.equal(await h.call(tool, { path: "/project/public", pattern: "*" }), false);
	}
	assert.equal(await h.call("ls", { path: "/project" }), false);
});

test("optional ff tools check paths, glob scopes, keywords and default search roots", async () => {
	for (const tool of ["ffgrep", "fffind"]) {
		const h = harness({ paths: ["/project/secret", "/home/test/private"], keywords: ["sensitive"] });
		for (const path of [undefined, "/project", "secret/", "~/private/", "secret/**/*.ts", "**/*.ts", "{secret,public}/**", "*.ts", "/project/sec*/**"]) {
			assert.equal(await h.call(tool, { path, pattern: "example" }), true, `${tool}: ${path}`);
		}
		assert.equal(await h.call(tool, { path: "public/**/*.ts", pattern: "example" }), false);
		assert.equal(await h.call(tool, { path: "public/", pattern: "SENSITIVE" }), true);
		assert.equal(await h.call(tool, { pattern: "example", exclude: "secret/" }), true);
		h.ctx.model.id = "other";
		assert.equal(await h.call(tool, { path: "secret/", pattern: "example" }), false);
	}
});

test("keywords include nested edit arguments; other custom tools stay out of scope", async () => {
	const h = harness({ keywords: ["sensitive"] });
	assert.equal(await h.call("edit", { path: "/tmp/file", edits: [{ oldText: "old", newText: "SENSITIVE" }] }), true);
	assert.equal(await h.call("custom", { path: "/home/test/private" }), false);
});

test("configuration is cached per run, refreshed next run, and errors are reported", async () => {
	const h = harness();
	await h.start();
	const reads = h.reads();
	await h.call("read", { path: "/tmp/file" });
	await h.call("read", { path: "/tmp/file" });
	assert.equal(h.reads(), reads);
	h.files.set("/agent/settings.json", "{broken");
	await assert.rejects(h.start(), /settings.json/);
	await assert.rejects(h.call("read", { path: "/tmp/file" }), /settings.json/);
});

test("validates configuration and honors model and project scope", async () => {
	for (const overrides of [{ paths: "oops" }, { keywords: [42] }, { models: "oops" }]) {
		await assert.rejects(harness(overrides).start(), /settings.json/);
	}
	const h = harness({}, { paths: ["private"] });
	assert.equal(await h.call("read", { path: "/home/test/private/key" }), true);
	h.ctx.isProjectTrusted = () => true;
	assert.equal(await h.call("read", { path: "/project/private/key" }), true);
	assert.equal(await h.call("read", { path: "/home/test/private/key" }), false);
	h.ctx.model.id = "other";
	assert.equal(await h.call("read", { path: "/project/private/key" }), false);
});

test("missing configuration is inert and only actual path fields are path-checked", async () => {
	const h = harness();
	h.files.clear();
	assert.equal(await h.call("read", { path: "/home/test/private/key" }), false);
	assert.equal(await harness().call("write", { path: "/tmp/note", content: "/home/test/private/key" }), false);
});

test("shell calls from a protected cwd and PowerShell direct paths are blocked", async () => {
	const h = harness();
	assert.equal(await h.call("powershell", { command: "Get-Content /home/test/private/key" }), true);
	h.ctx.cwd = "/alias";
	assert.equal(await h.call("bash", { command: "cat key" }), true);
});

test("filesystem root protection includes descendants", async () => {
	assert.equal(await harness({ paths: ["/"] }).call("read", { path: "/tmp/file" }), true);
});
