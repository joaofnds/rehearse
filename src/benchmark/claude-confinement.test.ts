import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { z } from "zod";

import { claudeArgs } from "./claude";
import ClaudeConfinementFixture from "./claude-confinement-test-fixture";
import type { SessionAdapter } from "./claude-confinement-test-fixture";
import {
	sessionCase,
	sessionCaseOptions,
} from "./session-attempt-case-test-fixtures";
import { sessionCaseArgs } from "./session-attempt-invocation";
import { installSessionCorpusSnapshot } from "./session-corpus-overlay";

const workspace = ClaudeConfinementFixture.forEachTest();
const { resources } = workspace;
const adapters: SessionAdapter[] = ["json", "stream", "attempt"];
const EXECUTABLE_ARGUMENT_COUNT = 1;
const isolated = [
	"-p",
	"hello",
	"--tools",
	"",
	"--strict-mcp-config",
	"--setting-sources",
	"project",
];

interface InvocationScenario {
	readonly name: string;
	readonly args: readonly string[];
}
const refused: InvocationScenario[] = [
	{
		args: [
			"-p",
			"hello",
			"--tools",
			"",
			"--strict-mcp-config",
			"--system-prompt",
			"--safe-mode",
			"--json-schema",
			"--disable-slash-commands",
		],
		name: "both sealed controls appearing only as option values",
	},
	{
		args: [
			"-p",
			"hello",
			"--tools",
			"Read",
			"--strict-mcp-config",
			"--setting-sources",
			"project",
		],
		name: "tools",
	},
	{ args: [...isolated, "--settings", '{"hooks":{}}'], name: "hooks" },
	{
		args: [
			"-p",
			"hello",
			"--setting-sources",
			"project,local",
			"--settings",
			"/tmp/settings.json",
		],
		name: "actual setup",
	},
	{
		args: [
			"-p",
			"hello",
			"--strict-mcp-config",
			"--setting-sources",
			"project",
		],
		name: "missing tool restriction",
	},
	{
		args: ["-p", "hello", "--tools", "", "--strict-mcp-config"],
		name: "missing setting sources",
	},
	{
		args: ["-p", "hello", "--tools", "", "--setting-sources", "project"],
		name: "missing MCP restriction",
	},
	{
		args: [...isolated, "--mcp-config", "servers.json"],
		name: "explicit MCP configuration",
	},
	{ args: [...isolated, "--plugin-dir", "plugin"], name: "explicit plugin" },
	{
		args: [...isolated, "--dangerously-skip-permissions"],
		name: "unrestricted permissions",
	},
	{ args: [...isolated, "--future-capability"], name: "unknown option" },
	{ args: [...isolated, "--tools", ""], name: "duplicate tool restriction" },
	{
		args: [...isolated, "--setting-sources", "project"],
		name: "duplicate setting sources",
	},
	{ args: [...isolated, "--settings", "{"], name: "malformed settings" },
	{ args: [...isolated, "--settings", "settings.json"], name: "settings file" },
	{
		args: [
			"-p",
			"hello",
			"--tools",
			"",
			"--strict-mcp-config",
			"--system-prompt",
			"--safe-mode",
		],
		name: "safety-looking system prompt",
	},
	{
		args: [
			"-p",
			"hello",
			"--tools",
			"",
			"--strict-mcp-config",
			"--json-schema",
			"--safe-mode",
		],
		name: "safety-looking schema",
	},
];

async function startsAnIsolatedCaseWithItsCopiedStyle(): Promise<void> {
	const fixture = await workspace.create();
	const corpus = await resources.createTemporaryDirectory(
		"rehearse-guard-corpus-",
	);
	await Bun.write(join(corpus, "output-styles/brief.md"), "Reply briefly.\n");
	await installSessionCorpusSnapshot(
		{
			declaredPaths: ["output-styles/brief.md"],
			kind: "directory",
			origin: { kind: "directory", source: corpus },
			root: corpus,
			scope: "declared",
		},
		fixture.directory,
		{ home: corpus, roots: [] },
	);
	const args = sessionCaseArgs(sessionCase({ isolated: true }), {
		...sessionCaseOptions(),
		styleName: "brief",
	});

	const result = await fixture.run(args.slice(EXECUTABLE_ARGUMENT_COUNT), {
		adapter: "attempt",
	});

	expect(result).toMatchObject({ exitCode: 0, started: true });
}

async function startsTheSealedModelPreflight(): Promise<void> {
	const fixture = await workspace.create();

	const result = await fixture.run([], { adapter: "probe" });

	expect(result).toMatchObject({ exitCode: 0, started: true });
}

describe("live Claude session confinement", () => {
	it.each(adapters)(
		"refuses an unconfined %s invocation before starting Claude",
		async (adapter) => {
			const fixture = await workspace.create();

			const result = await fixture.run(
				["-p", "hello", "--dangerously-skip-permissions"],
				{ adapter },
			);

			expect(result).toMatchObject({ exitCode: 3, started: false });
		},
	);

	it.each(adapters)("starts a marked %s invocation", async (adapter) => {
		const fixture = await workspace.create();

		const result = await fixture.run(["-p", "hello"], {
			adapter,
			confined: "1",
		});

		expect(result).toMatchObject({ exitCode: 0, started: true });
	});

	it.each(adapters)(
		"starts a sealed %s invocation without confinement",
		async (adapter) => {
			const fixture = await workspace.create();
			const args = claudeArgs({
				access: "sealed",
				schema: z.object({}),
				settings: { budgetUsd: 1, model: "sonnet" },
			});

			const result = await fixture.run(args.slice(EXECUTABLE_ARGUMENT_COUNT), {
				adapter,
			});

			expect(result).toMatchObject({ exitCode: 0, started: true });
		},
	);
});

describe("live Claude session confinement > when unmarked", () => {
	it.each(refused)("refuses unconfined $name", async ({ args }) => {
		const fixture = await workspace.create();

		const result = await fixture.run(args);

		expect(result).toMatchObject({ exitCode: 3, started: false });
	});

	it.each([".claude/settings.json", ".claude/settings.local.json"])(
		"refuses unconfined project configuration at %s",
		async (file) => {
			const fixture = await workspace.create();
			await Bun.write(join(fixture.directory, file), "{}");

			const result = await fixture.run(isolated);

			expect(result).toMatchObject({ exitCode: 3, started: false });
		},
	);

	it("refuses a marker supplied only to the outgoing child environment", async () => {
		const fixture = await workspace.create();

		const result = await fixture.run(["-p", "hello"], { childConfined: "1" });

		expect(result).toMatchObject({ exitCode: 3, started: false });
	});

	it("refuses a marker whose value is not one", async () => {
		const fixture = await workspace.create();

		const result = await fixture.run(["-p", "hello"], { confined: "true" });

		expect(result).toMatchObject({ exitCode: 3, started: false });
	});
});

describe("live Claude session confinement > existing toolless calls", () => {
	it("starts a toolless invocation whose MCP restriction excludes a project config", async () => {
		const fixture = await workspace.create();
		await Bun.write(join(fixture.directory, ".mcp.json"), "{}");

		const result = await fixture.run(isolated);

		expect(result).toMatchObject({ exitCode: 0, started: true });
	});
	it("refuses malformed preflight arguments before starting Claude", async () => {
		const fixture = await workspace.create();

		const result = await fixture.run([], {
			adapter: "probe",
			probeModel: "--invalid-model-value",
		});

		expect(result).toMatchObject({ exitCode: 3, started: false });
	});
	it(
		"starts the sealed model preflight without confinement",
		startsTheSealedModelPreflight,
	);
	it(
		"starts an isolated toolless case with its copied output style",
		startsAnIsolatedCaseWithItsCopiedStyle,
	);
});
