import { describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import {
	BUNDLE_STAGES,
	FINAL_RUBRIC,
} from "#server/task-bundle-tests/bundle-case-fixture";
import serving from "#server/task-bundle-tests/bundle-server-fixture";

describe("declaring pipelines", () => {
	it(
		"answers 404 for declaring a pipeline case from a session case",
		verifyAnswers404ForDeclaringAPipelineCaseFromA,
	);

	it(
		"declares a pipeline case from the operator's task with another case's steps and judges",
		verifyDeclaresAPipelineCaseFromTheOperatorSTask,
	);
});

async function verifyAnswers404ForDeclaringAPipelineCaseFromA(): Promise<void> {
	await using server = await serving();

	const response = await server.post(
		"/api/cases/pipeline",
		JSON.stringify({
			from: "sess-case",
			id: "new-task",
			productBrief: "# Why\n",
			targetPath: await server.repository(),
			task: "# Rename the module\n",
			title: "A new task",
		}),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_NOT_FOUND);
}

async function verifyDeclaresAPipelineCaseFromTheOperatorSTask(): Promise<void> {
	await using server = await serving();
	const target = await server.repository();

	const response = await server.post(
		"/api/cases/pipeline",
		JSON.stringify({
			from: "pipe-case",
			id: "new-task",
			productBrief: "# Why\n\nThe name misleads.\n",
			targetPath: target,
			task: "# Rename the module\n",
			title: "A new task",
		}),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CREATED);
	expect(await Bun.file(join(server.cases, "new-task", "task.md")).text()).toBe(
		"# Rename the module\n",
	);
	const bundle = await server.request("/api/cases/new-task/bundle");
	expect(await bundle.json()).toMatchObject({
		effort: "high",
		finalRubric: FINAL_RUBRIC,
		model: "sonnet",
		pipeline: { stages: BUNDLE_STAGES },
		productBrief: "# Why\n\nThe name misleads.\n",
		target: { path: target },
		title: "A new task",
	});
}
