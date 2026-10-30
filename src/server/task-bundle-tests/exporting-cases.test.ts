import { describe, expect, it } from "bun:test";
import { symlink } from "node:fs/promises";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import {
	BRIEF,
	BUNDLE_STAGES,
	FINAL_RUBRIC,
	PIPELINE,
	TASK,
} from "#server/task-bundle-tests/bundle-case-fixture";
import { bundleSchema } from "#server/task-bundle-tests/bundle-schema";
import serving from "#server/task-bundle-tests/bundle-server-fixture";

describe("exporting cases", () => {
	it.each(["sess-case", "no-such-case"])(
		"answers 404 for exporting %s, which declares no pipeline",
		async (caseId) => {
			await using server = await serving();

			const response = await server.request(`/api/cases/${caseId}/bundle`);

			expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
		},
	);

	it(
		"exports a pipeline case with its steps naming their judges by file name",
		verifyExportsAPipelineCaseWithItsStepsNamingTheir,
	);
});

async function verifyExportsAPipelineCaseWithItsStepsNamingTheir(): Promise<void> {
	await using server = await serving();

	const response = await server.request("/api/cases/pipe-case/bundle");

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(response.headers.get("content-disposition")).toBe(
		'attachment; filename="pipe-case.task.json"',
	);
	const bundle = bundleSchema.parse(await response.json());
	expect(bundle).toMatchObject({
		caseId: "pipe-case",
		effort: "high",
		finalRubric: FINAL_RUBRIC,
		format: "rehearse-task-bundle",
		model: "sonnet",
		pipeline: { ...PIPELINE, stages: BUNDLE_STAGES },
		productBrief: BRIEF,
		sessionBudgetUsd: 5,
		target: { path: "../../target" },
		task: TASK,
		title: "A pipeline case",
		version: 1,
	});
	expect(Object.keys(bundle.rubrics).toSorted()).toEqual([
		"build.json",
		"shape.json",
	]);
}

describe("/api/cases/:id/bundle", () => {
	describe("GET", () => {
		describe("when an unused rubric name links to an internal directory", () => {
			it("exports only regular rubric files", async () => {
				await using server = await serving();
				const directory = await server.directory(
					"cases/pipe-case/rubric-directory",
				);
				await symlink(
					directory,
					join(server.cases, "pipe-case/rubrics/unused.json"),
				);

				const response = await server.request("/api/cases/pipe-case/bundle");

				expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
				const bundle = bundleSchema.parse(await response.json());
				expect(Object.keys(bundle.rubrics).toSorted()).toEqual([
					"build.json",
					"shape.json",
				]);
			});
		});
	});
});
