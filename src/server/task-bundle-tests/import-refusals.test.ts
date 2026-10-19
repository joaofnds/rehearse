import { describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { CONTROL_DIR } from "#benchmark/config";
import { BUNDLE_STAGES } from "#server/task-bundle-tests/bundle-case-fixture";
import { exported, refusal } from "#server/task-bundle-tests/bundle-schema";
import serving from "#server/task-bundle-tests/bundle-server-fixture";
import { directoryErrno } from "#server/task-bundle-tests/bundle-workspace";

const SECOND_BUNDLE_STAGE_INDEX = 1;

describe("import refusals", () => {
	it(
		"refuses a bundled step that names its judge by path",
		verifyRefusesABundledStepThatNamesItsJudgeBy,
	);

	it(
		"refuses a step whose judge the bundle does not carry and removes what it wrote",
		verifyRefusesAStepWhoseJudgeTheBundleDoesNot,
	);

	it.each([
		{ refusing: "a target that is not a git repository", target: "plain" },
		{ refusing: "the control repository as its target", target: "control" },
		{ refusing: "a target that does not exist", target: "missing" },
	] as const)("refuses $refusing and writes no case", async ({ target }) => {
		await using server = await serving();
		const targets = {
			control: CONTROL_DIR,
			missing: join(tmpdir(), "rehearse-no-such-target"),
			plain: await server.directory("plain"),
		};

		const response = await server.post(
			"/api/cases/import",
			JSON.stringify({
				bundle: await exported(server),
				id: "pipe-copy",
				targetPath: targets[target],
				title: "A copied case",
			}),
		);

		expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
		expect(await refusal(response)).toContain("Target");
		expect(await directoryErrno(join(server.cases, "pipe-copy"))).toBe(
			"ENOENT",
		);
	});

	it(
		"refuses an unpublished stale directory without replacing or publishing it",
		verifyRefusesAnUnpublishedStaleDirectoryWithoutReplacingOrPublishing,
	);
});

async function verifyRefusesABundledStepThatNamesItsJudgeBy(): Promise<void> {
	await using server = await serving();
	const bundle = await exported(server);

	const response = await server.post(
		"/api/task-bundles/preview",
		JSON.stringify({
			bundle: {
				...bundle,
				pipeline: {
					...bundle.pipeline,
					stages: [
						{
							...BUNDLE_STAGES[SECOND_BUNDLE_STAGE_INDEX],
							rubric: "../build.json",
						},
					],
				},
			},
		}),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(await refusal(response)).toContain("rubric file name");
}

async function verifyRefusesAStepWhoseJudgeTheBundleDoesNot(): Promise<void> {
	await using server = await serving();
	const bundle = await exported(server);
	const { "build.json": _dropped, ...rubrics } = bundle.rubrics;

	const response = await server.post(
		"/api/cases/import",
		JSON.stringify({
			bundle: { ...bundle, rubrics },
			id: "pipe-copy",
			targetPath: await server.repository(),
			title: "A copied case",
		}),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_BAD_REQUEST);
	expect(await refusal(response)).toContain("build");
	expect(
		await Bun.file(join(server.cases, "pipe-copy", "case.json")).exists(),
	).toBe(false);
}

async function verifyRefusesAnUnpublishedStaleDirectoryWithoutReplacingOrPublishing(): Promise<void> {
	await using server = await serving();
	await server.directory("cases/pipe-copy");
	const response = await server.post(
		"/api/cases/import",
		JSON.stringify({
			bundle: await exported(server),
			id: "pipe-copy",
			targetPath: await server.repository(),
			title: "A copied case",
		}),
	);
	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(
		await directoryErrno(join(server.cases, "pipe-copy", "case.json")),
	).toBe("ENOENT");
	expect(await directoryErrno(join(server.cases, "pipe-copy"))).toBeUndefined();
}
