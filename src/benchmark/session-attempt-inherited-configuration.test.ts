import { describe, expect, it } from "bun:test";

import { runSessionAttempt } from "#benchmark/session-attempt";

import { request, sessionCase } from "./session-attempt-case-test-fixtures";
import { FakeClaude } from "./session-attempt-provider-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
	resources,
} from "./session-attempt-workspace-test-fixtures";

resources.registerCleanup();

const LAUNCH_ENVIRONMENT = {
	ANTHROPIC_API_KEY: "sk-never-recorded",
	CLAUDE_CODE_ENTRYPOINT: "claude-desktop",
	DISABLE_PROMPT_CACHING: "1",
	HOME: "/home/user",
};

const INHERITED_CONFIGURATION = [
	{ name: "ANTHROPIC_API_KEY" },
	{
		name: "DISABLE_PROMPT_CACHING",
		sha256: "6b86b273ff34fce19d6b804eff5a3f5747ada4eaa22f1d49c01e52ddb7875b4b",
	},
];

async function recordsTheConfigurationTheSessionInherited(
	isolated: boolean,
): Promise<void> {
	const projects = await projectsRoot();

	const attempt = await runSessionAttempt(
		request({
			environment: LAUNCH_ENVIRONMENT,
			projectsDirectory: projects,
			recordDirectory: await recordDirectory(),
			runClaude: new FakeClaude(projects, "OK").run,
			sessionCase: sessionCase({ isolated }),
		}),
	);

	expect(attempt.setup.inheritedConfiguration).toEqual(INHERITED_CONFIGURATION);
}

describe(runSessionAttempt.name, () => {
	it.each([true, false])(
		"records the Claude Code configuration the session inherited when isolated is %p",
		recordsTheConfigurationTheSessionInherited,
	);
});
