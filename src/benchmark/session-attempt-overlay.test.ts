import { describe, expect, it } from "bun:test";
import { join } from "node:path";

import { runSessionAttempt } from "#benchmark/session-attempt";

import { request, sessionCase } from "./session-attempt-case-test-fixtures";
import {
	FIRST_RECORDED_PROVIDER_RUN_INDEX,
	FakeClaude,
} from "./session-attempt-provider-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
	snapshotHolding,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function placesTheSnapshotSOutputStyleWhereTheSessionReadsIt(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	await runSessionAttempt(
		request({
			corpusSnapshot: await snapshotHolding(
				"output-styles/brief.md",
				"marker style\n",
			),
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claude.run,
		}),
	);

	const [observedFirstRun] = claude.runs;

	expect(observedFirstRun?.seenFiles).toContain(
		join(".claude", "output-styles", "brief.md"),
	);
}

async function selectsTheSnapshotSOutputStyleWithSettings(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	await runSessionAttempt(
		request({
			corpusSnapshot: await snapshotHolding(
				"output-styles/brief.md",
				"marker style\n",
			),
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claude.run,
		}),
	);

	const settings = claude.runs[FIRST_RECORDED_PROVIDER_RUN_INDEX]?.settingsText;

	expect(JSON.parse(settings ?? "{}")).toEqual({ outputStyle: "brief" });
}

async function mergesTheStyleSelectionOverTheCaseSDeclaredSettingsRatherThanReplacingThem(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	await runSessionAttempt(
		request({
			corpusSnapshot: await snapshotHolding(
				"output-styles/brief.md",
				"marker style\n",
			),
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claude.run,
			sessionCase: sessionCase({
				settings: { permissions: { defaultMode: "plan" } },
			}),
		}),
	);

	const settings = claude.runs[FIRST_RECORDED_PROVIDER_RUN_INDEX]?.settingsText;

	expect(JSON.parse(settings ?? "{}")).toEqual({
		outputStyle: "brief",
		permissions: { defaultMode: "plan" },
	});
}

async function selectsAndInstallsOnlyTheStyleTheCaseDeclaredNeverASecondOneTheCorpusHolds(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");
	const root = await resources.createControlDirectory();
	await Bun.write(join(root, "output-styles/aardvark.md"), "undeclared\n");
	await Bun.write(join(root, "output-styles/brief.md"), "declared\n");

	await runSessionAttempt(
		request({
			corpusSnapshot: {
				declaredPaths: ["output-styles/brief.md"],
				kind: "directory",
				origin: { kind: "directory", source: root },
				root,
				scope: "declared",
			},
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claude.run,
		}),
	);

	const [observedFirstRun] = claude.runs;

	expect(JSON.parse(observedFirstRun?.settingsText ?? "{}")).toEqual({
		outputStyle: "brief",
	});

	expect(observedFirstRun?.seenFiles).toContain(
		join(".claude", "output-styles", "brief.md"),
	);
	expect(observedFirstRun?.seenFiles).not.toContain(
		join(".claude", "output-styles", "aardvark.md"),
	);
}

async function leavesTheAttemptDirectoryBareWhenTheCorpusIsTheLiveInstall(): Promise<void> {
	const projects = await projectsRoot();
	const claude = new FakeClaude(projects, "OK");

	await runSessionAttempt(
		request({
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: claude.run,
		}),
	);

	const [observedFirstRun] = claude.runs;

	expect(observedFirstRun?.seenFiles).toEqual([]);
	expect(JSON.parse(observedFirstRun?.settingsText ?? "{}")).toEqual({});
}
describe("the corpus overlay a session attempt installs", () => {
	it(
		"places the snapshot's output style where the session reads it",
		placesTheSnapshotSOutputStyleWhereTheSessionReadsIt,
	);
	it(
		"selects the snapshot's output style with --settings",
		selectsTheSnapshotSOutputStyleWithSettings,
	);
	it(
		"merges the style selection over the case's declared settings rather than replacing them",
		mergesTheStyleSelectionOverTheCaseSDeclaredSettingsRatherThanReplacingThem,
	);
	it(
		"selects and installs only the style the case declared, never a second one the corpus holds",
		selectsAndInstallsOnlyTheStyleTheCaseDeclaredNeverASecondOneTheCorpusHolds,
	);
	it(
		"leaves the attempt directory bare when the corpus is the live install",
		leavesTheAttemptDirectoryBareWhenTheCorpusIsTheLiveInstall,
	);
});
