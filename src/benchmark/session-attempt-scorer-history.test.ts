import { describe, expect, it } from "bun:test";
import { normalize } from "node:path";

import {
	SessionInputError,
	runSessionAttempt,
} from "#benchmark/session-attempt";
import { failureOf } from "#cli/cli-test-support";

import { request, sessionCase } from "./session-attempt-case-test-fixtures";
import { hidings } from "./session-attempt-history-test-fixtures";
import { FakeClaude } from "./session-attempt-provider-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

describe("the state evidence a session attempt preserves", () => {
	describe("a fixture whose history holds a scorer file", () => {
		for (const hiding of hidings) {
			it(`is refused, naming it, before any provider call when ${hiding.name}`, async () => {
				const fixture = await resources.createHistory(hiding.history);
				await hiding.hide(fixture.path);
				const projects = await projectsRoot();
				const claude = new FakeClaude(projects, "OK");

				const attemptRequest = request({
					projectsDirectory: projects,
					recordDirectory: await recordDirectory(),
					runClaude: claude.run,
					sessionCase: sessionCase({
						fixturePath: fixture.path,
						stateCheck: {
							command: ["cat", hiding.scorer],
							outcomes: ["graded"],
						},
					}),
				});
				const failure = await failureOf(runSessionAttempt(attemptRequest));

				expect(failure).toBeInstanceOf(SessionInputError);
				expect(failure.message).toContain(normalize(hiding.scorer));
				expect(claude.runs).toEqual([]);
			});
		}
	});
});
