import { describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { exported, refusal } from "#server/task-bundle-tests/bundle-schema";
import serving from "#server/task-bundle-tests/bundle-server-fixture";
import { directoryErrno } from "#server/task-bundle-tests/bundle-workspace";

const INVALID_DENY_RULE = 7;

const STAGE_SETTING_REFUSALS = [
	{
		error:
			"The bundle's stage settings are refused: ✖ Invalid input: expected object, received number\n  → at permissions\n✖ Invalid input: expected boolean, received number\n  → at disableAllHooks\n✖ Invalid input: expected boolean, received number\n  → at disableSkillShellExecution\n✖ Invalid input: expected boolean, received number\n  → at disableBundledSkills\n✖ Invalid input: expected boolean, received number\n  → at disableWorkflows\n✖ Invalid input: expected boolean, received number\n  → at disableAutoMode",
		name: "permissions",
		settings: {
			disableAllHooks: 7,
			disableAutoMode: 7,
			disableBundledSkills: 7,
			disableSkillShellExecution: 7,
			disableWorkflows: 7,
			permissions: 7,
		},
	},
	{
		error:
			"The bundle's stage settings are refused: ✖ Invalid input: expected boolean, received number\n  → at disableAllHooks\n✖ Invalid input: expected boolean, received number\n  → at disableSkillShellExecution\n✖ Invalid input: expected boolean, received number\n  → at disableBundledSkills\n✖ Invalid input: expected boolean, received number\n  → at disableWorkflows\n✖ Invalid input: expected boolean, received number\n  → at disableAutoMode\n✖ Invalid input: expected string, received number\n  → at permissions.deny[0]",
		name: "nested deny entries",
		settings: {
			disableAllHooks: 7,
			disableAutoMode: 7,
			disableBundledSkills: 7,
			disableSkillShellExecution: 7,
			disableWorkflows: 7,
			permissions: {
				deny: [INVALID_DENY_RULE],
			},
		},
	},
];

describe("stage settings diagnostic priority", () => {
	it.each(STAGE_SETTING_REFUSALS)(
		"preserves stage-setting diagnostic priority for $name",
		async ({ error, settings }) => {
			await using server = await serving();
			const bundle = await exported(server);
			const targetPath = await server.repository();

			const response = await server.post(
				"/api/cases/import",
				JSON.stringify({
					bundle: { ...bundle, stageSettings: JSON.stringify(settings) },
					id: "pipe-copy",
					targetPath,
					title: "A copied case",
				}),
			);

			expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
			expect(await refusal(response)).toBe(error);
			expect(await directoryErrno(join(server.cases, "pipe-copy"))).toBe(
				"ENOENT",
			);
		},
	);
});
