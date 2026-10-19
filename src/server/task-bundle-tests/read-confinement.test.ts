import { describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";
import { join } from "node:path";

import { bundleSchema } from "#server/task-bundle-tests/bundle-schema";
import serving from "#server/task-bundle-tests/bundle-server-fixture";
import linkBundleInput from "#server/task-bundle-tests/linked-input-fixture";

const INPUT_PATHS = [
	"task.md",
	"brief.md",
	"rubric.md",
	"settings.json",
	"pipeline.json",
	"rubrics",
	"rubrics/shape.json",
];

const OUTSIDE_SENTINEL = "outside-only-task-sentinel";

describe("read confinement", () => {
	it.each([...INPUT_PATHS, "rubrics/extra.json"])(
		"refuses %s outside the real case directory",
		async (path) => {
			await using server = await serving();
			await linkBundleInput({ internal: false, path, server });
			const response = await server.request("/api/cases/pipe-case/bundle");
			expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
			expect(await response.json()).toEqual({
				error: `Case pipe-case names a path outside its case directory: ${path}`,
			});
		},
	);

	it(
		"never returns an outside task's sentinel bytes",
		verifyNeverReturnsAnOutsideTaskSSentinelBytes,
	);

	it.each(INPUT_PATHS)(
		"exports %s linked within the real case directory",
		async (path) => {
			await using server = await serving();
			await linkBundleInput({ internal: true, path, server });
			const response = await server.request("/api/cases/pipe-case/bundle");
			expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
			const bundle = bundleSchema.parse(await response.json());
			expect(bundle["task"]).toBe(
				"# Add an audit log\n\nRecord every write.\n",
			);
			expect(Object.keys(bundle.rubrics).toSorted()).toEqual([
				"build.json",
				"shape.json",
			]);
		},
	);
});

async function verifyNeverReturnsAnOutsideTaskSSentinelBytes(): Promise<void> {
	await using server = await serving();
	await Bun.write(join(server.cases, "pipe-case", "task.md"), OUTSIDE_SENTINEL);
	await linkBundleInput({ internal: false, path: "task.md", server });
	const response = await server.request("/api/cases/pipe-case/bundle");
	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_CONFLICT);
	expect(await response.text()).not.toContain(OUTSIDE_SENTINEL);
}
