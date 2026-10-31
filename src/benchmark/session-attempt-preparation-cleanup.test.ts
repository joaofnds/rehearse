import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";

import { runSessionAttempt } from "#benchmark/session-attempt";
import { failureOf } from "#cli/cli-test-support";

import { rates, sonnetRate } from "./context-evidence-rate-test-fixture";
import {
	SOURCE_SESSION,
	contextEvidenceSource,
	request,
} from "./session-attempt-case-test-fixtures";
import { transcriptLine } from "./session-attempt-transcript-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
	resumingCase,
	writtenPrefix,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

async function removesTheForkedTranscriptAndItsSlugWhenPreparationFailsAfterTheFork(): Promise<void> {
	const projects = await projectsRoot();
	const prefix = await writtenPrefix(
		`${transcriptLine(SOURCE_SESSION, "earlier turn")}\n`,
	);
	const duplicateRates = { ...rates, models: [sonnetRate, sonnetRate] };

	const attemptRequest = request({
		contextEvidenceSource: await contextEvidenceSource(),
		contextRateCatalog: duplicateRates,
		projectsDirectory: projects,
		recordDirectory: await recordDirectory(),
		runClaude: async () =>
			await Promise.reject(new Error("a provider call must not happen")),
		sessionCase: resumingCase(prefix.path, prefix.sha256),
	});

	const failure = await failureOf(runSessionAttempt(attemptRequest));

	expect(failure).toBeInstanceOf(Error);
	expect(await readdir(projects)).toEqual([]);
}

describe(runSessionAttempt.name, () => {
	it(
		"removes the forked transcript and its slug when preparation fails after the fork",
		removesTheForkedTranscriptAndItsSlugWhenPreparationFailsAfterTheFork,
	);
});
