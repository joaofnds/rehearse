import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { SessionCase } from "#benchmark/case";
import { requireCase } from "#cli/case-command";
import { confinesItself, sessionCanRunCommands } from "#cli/confinement";

import { SessionCaseBuilder } from "./session-case-test-fixture";

const RESOURCE_DRAIN_START_INDEX = 0;

const unloadable = async (): Promise<never> =>
	await Promise.reject(new Error("no case for this command"));

const PROBE_DECLARATION: SessionCase["declaration"] = {
	...new SessionCaseBuilder().build().declaration,
	id: "probe",
	title: "Probe",
};

const fixtures: string[] = [];

async function emptyFixture(): Promise<string> {
	const fixture = await mkdtemp(join(tmpdir(), "rehearse-confinement-"));
	fixtures.push(fixture);

	return fixture;
}

async function holdsForACaseThatDeclaresATool(): Promise<void> {
	const withRead = new SessionCaseBuilder({
		declaration: PROBE_DECLARATION,
		tools: ["Read"],
	}).build();

	expect(await sessionCanRunCommands(withRead)).toBe(true);
}

async function holdsForACaseWhoseSettingsDeclareHooks(): Promise<void> {
	const hooked = new SessionCaseBuilder({
		declaration: PROBE_DECLARATION,
		settings: { hooks: {} },
	}).build();

	expect(await sessionCanRunCommands(hooked)).toBe(true);
}

async function doesNotHoldForACaseWithNoTool(): Promise<void> {
	const toolless = new SessionCaseBuilder({
		declaration: PROBE_DECLARATION,
		settings: { outputStyle: "brief" },
	}).build();

	expect(await sessionCanRunCommands(toolless)).toBe(false);
}

async function holdsForACaseWhoseFixtureCarriesProjectSettings(): Promise<void> {
	const fixture = await emptyFixture();
	await mkdir(join(fixture, ".claude"));

	const withProjectSettings = new SessionCaseBuilder({
		declaration: PROBE_DECLARATION,
		fixturePath: fixture,
	}).build();

	expect(await sessionCanRunCommands(withProjectSettings)).toBe(true);
}

async function doesNotHoldForACaseWhoseFixtureBrings(): Promise<void> {
	const withoutProjectSettings = new SessionCaseBuilder({
		declaration: PROBE_DECLARATION,
		fixturePath: await emptyFixture(),
	}).build();

	expect(await sessionCanRunCommands(withoutProjectSettings)).toBe(false);
}

async function confinesAPipelineCase(): Promise<void> {
	expect(
		await confinesItself("by case", async () => await requireCase("audit-log")),
	).toBe(true);
}

async function confinesASessionCaseThatCanRunCommands(): Promise<void> {
	const withBash = new SessionCaseBuilder({
		declaration: PROBE_DECLARATION,
		tools: ["Bash"],
	}).build();

	expect(
		await confinesItself(
			"by case",
			async () => await Promise.resolve(withBash),
		),
	).toBe(true);
}

async function leavesASessionCaseThatCannotRunCommandsUnconfined(): Promise<void> {
	const toolless = new SessionCaseBuilder({
		declaration: PROBE_DECLARATION,
	}).build();

	expect(
		await confinesItself(
			"by case",
			async () => await Promise.resolve(toolless),
		),
	).toBe(false);
}

describe(sessionCanRunCommands.name, () => {
	afterEach(async () => {
		await Promise.all(
			fixtures.splice(RESOURCE_DRAIN_START_INDEX).map(async (fixture) => {
				await rm(fixture, { force: true, recursive: true });
			}),
		);
	});
	it("holds for a case that declares a tool", holdsForACaseThatDeclaresATool);
	it(
		"holds for a case whose settings declare hooks",
		holdsForACaseWhoseSettingsDeclareHooks,
	);
	it(
		"does not hold for a case with no tool and no hooks",
		doesNotHoldForACaseWithNoTool,
	);
	it(
		"holds for a case whose fixture carries project settings",
		holdsForACaseWhoseFixtureCarriesProjectSettings,
	);
	it(
		"does not hold for a case whose fixture brings no project settings",
		doesNotHoldForACaseWhoseFixtureBrings,
	);
});

describe(confinesItself.name, () => {
	it.each([
		{ confined: true, confinement: "always" },
		{ confined: false, confinement: "never" },
	] as const)(
		"decides a command declared $confinement without reading a case",
		async ({ confinement, confined }) => {
			expect(await confinesItself(confinement, unloadable)).toBe(confined);
		},
	);
});

describe(`${confinesItself.name} > when the command follows its case`, () => {
	it("confines a pipeline case", confinesAPipelineCase);
	it(
		"confines a session case that can run commands",
		confinesASessionCaseThatCanRunCommands,
	);
	it(
		"leaves a session case that cannot run commands unconfined",
		leavesASessionCaseThatCannotRunCommandsUnconfined,
	);
});
