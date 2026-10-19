import { describe, expect, it } from "bun:test";
import { constants as HTTP_STATUS } from "node:http2";

import { PIPELINE } from "#server/task-bundle-tests/bundle-case-fixture";
import { exported } from "#server/task-bundle-tests/bundle-schema";
import serving from "#server/task-bundle-tests/bundle-server-fixture";

const POSTGRES = {
	env: { POSTGRES_PASSWORD: "postgres" },
	exports: {
		DATABASE_URL: "postgres://postgres:postgres@127.0.0.1:{port}/app",
	},
	image: "postgres:18-alpine",
	name: "postgres",
	port: 5432,
	ready: ["pg_isready", "-h", "127.0.0.1"],
};

describe("previewing bundles", () => {
	it(
		"previews a bundle's steps, judges and the commands it runs, writing nothing",
		verifyPreviewsABundleSStepsJudgesAndTheCommands,
	);

	it(
		"previews the containers a bundle's target starts and the variables each exports",
		verifyPreviewsTheContainersABundleSTargetStartsAnd,
	);
});

async function verifyPreviewsABundleSStepsJudgesAndTheCommands(): Promise<void> {
	await using server = await serving();
	const bundle = await exported(server);

	const before = await server.inspect();

	const response = await server.post(
		"/api/task-bundles/preview",
		JSON.stringify({
			bundle,
		}),
	);

	expect(response.status).toBe(HTTP_STATUS.HTTP_STATUS_OK);
	expect(await response.json()).toEqual({
		caseId: "pipe-case",
		commands: ["bun install", "bun run typecheck"],
		model: "sonnet",
		services: [],
		stepJudges: 2,
		steps: [
			{ kind: "planning", name: "shape", skill: "shape" },
			{ kind: "delivery", name: "build", skill: "build" },
		],
		targetPath: "../../target",
		title: "A pipeline case",
	});

	expect(await server.inspect()).toEqual(before);
}

async function verifyPreviewsTheContainersABundleSTargetStartsAnd(): Promise<void> {
	await using server = await serving();
	const bundle = await exported(server);
	const target = { ...PIPELINE.target, services: [POSTGRES] };

	const before = await server.inspect();

	const response = await server.post(
		"/api/task-bundles/preview",
		JSON.stringify({
			bundle: { ...bundle, pipeline: { ...bundle.pipeline, target } },
		}),
	);

	expect(await response.json()).toMatchObject({
		services: [
			{
				exports: ["DATABASE_URL"],
				image: "postgres:18-alpine",
				name: "postgres",
			},
		],
	});

	expect(await server.inspect()).toEqual(before);
}
