import { describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import projectFormatted from "#benchmark/project-format";
import { exported } from "#server/task-bundle-tests/bundle-schema";
import serving from "#server/task-bundle-tests/bundle-server-fixture";

const IMPORTED_FORMAT_FILES = [
	"case.json",
	"pipeline.json",
	"task.md",
	"product-brief.md",
	"rubric.md",
	"rubrics/build.json",
] as const;

describe("importing cases", () => {
	it(
		"answers 409 for an id already on disk and leaves that case as it was",
		verifyAnswers409ForAnIdAlreadyOnDiskAnd,
	);

	it(
		"imports a bundle as a new case whose steps name its own judges",
		verifyImportsABundleAsANewCaseWhoseSteps,
	);

	it.each([...IMPORTED_FORMAT_FILES])(
		"writes every imported file as the project's formatter would (%s)",
		async (file) => {
			await using server = await serving();
			const bundle = await exported(server);
			await server.post(
				"/api/cases/import",
				JSON.stringify({
					bundle,
					id: "pipe-copy",
					targetPath: await server.repository(),
					title: "A copied case",
				}),
			);
			const path = join(server.cases, "pipe-copy", file);
			const text = await Bun.file(path).text();
			expect(await projectFormatted(path, text)).toBe(text);
		},
	);
});

async function verifyAnswers409ForAnIdAlreadyOnDiskAnd(): Promise<void> {
	await using server = await serving();
	const before = await Bun.file(
		join(server.cases, "pipe-case", "case.json"),
	).text();

	const response = await server.post(
		"/api/cases/import",
		JSON.stringify({
			bundle: await exported(server),
			id: "pipe-case",
			targetPath: await server.repository(),
			title: "A copied case",
		}),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(
		await Bun.file(join(server.cases, "pipe-case", "case.json")).text(),
	).toBe(before);
}

async function verifyImportsABundleAsANewCaseWhoseSteps(): Promise<void> {
	await using server = await serving();
	const target = await server.repository();
	const bundle = await exported(server);

	const response = await server.post(
		"/api/cases/import",
		JSON.stringify({
			bundle,
			id: "pipe-copy",
			targetPath: target,
			title: "A copied case",
		}),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CREATED);
	expect(await response.json()).toEqual({
		caseId: "pipe-copy",
		path: "cases/pipe-copy",
	});
	const steps = await server.request("/api/cases/pipe-copy/steps");
	expect(await steps.json()).toMatchObject({
		stages: [
			{ name: "shape", rubric: "cases/pipe-copy/rubrics/shape.json" },
			{ name: "build", rubric: "cases/pipe-copy/rubrics/build.json" },
		],
	});
	const again = await server.request("/api/cases/pipe-copy/bundle");
	expect(await again.json()).toEqual({
		...bundle,
		caseId: "pipe-copy",
		target: { path: target },
		title: "A copied case",
	});
}
