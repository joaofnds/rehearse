import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import {
	directorySource,
	nothingRunning,
	RecordedRunsFixture,
} from "#benchmark/run-records-test-support";
import { readShortIds } from "#benchmark/short-id";
import type { AppServerDependencies } from "./app";
import { serve, startLocalServer } from "./serve";

describe(startLocalServer.name, () => {
	it("binds the browser server to IPv4 loopback", async () => {
		const server = startLocalServer(0, () => new Response("ready"));

		try {
			expect(server.hostname).toBe("127.0.0.1");
			expect(
				await fetch(`http://127.0.0.1:${String(server.port)}`).then(
					(response) => response.text(),
				),
			).toBe("ready");
		} finally {
			await server.stop(true);
		}
	});
});

const runHistorySchema = z.object({
	rows: z.array(z.object({ kind: z.string() }).loose()),
});

describe(serve.name, () => {
	const run = "2026-09-01T00-00-00.000Z";
	let directory: string;
	let dependencies: AppServerDependencies;
	let fixture: RecordedRunsFixture;

	beforeEach(async () => {
		directory = await mkdtemp(join(tmpdir(), "rehearse-serve-"));
		dependencies = {
			runsDirectory: join(directory, "runs"),
			corpusSource: directorySource(join(directory, "corpus")),
			liveness: nothingRunning,
			clientDistDirectory: join(directory, "dist"),
		};
		fixture = new RecordedRunsFixture(dependencies.runsDirectory);
	});

	afterEach(async () => {
		await rm(directory, { recursive: true, force: true });
	});

	async function runHistory(
		server: Bun.Server<undefined>,
	): Promise<{ status: number; rows: readonly unknown[] }> {
		const response = await fetch(
			`http://127.0.0.1:${String(server.port)}/api/runs`,
		);
		const body = runHistorySchema.parse(await response.json());

		return { status: response.status, rows: body.rows };
	}

	it("names records made before short ids from its first response", async () => {
		await fixture.writePipelineRun(run, "audit-log");

		const server = await serve(dependencies, 0);

		try {
			const history = await runHistory(server);
			expect(history.rows).toContainEqual(
				expect.objectContaining({ run, shortId: "audit-log/r1" }),
			);
		} finally {
			await server.stop(true);
		}
	});

	describe("when a case's registry cannot be built", () => {
		it("serves with the other cases numbered", async () => {
			await fixture.writePipelineRun(run, "audit-log");
			await fixture.writePipelineRun("2026-09-02T00-00-00.000Z", "smoke");
			await Bun.write(
				join(dependencies.runsDirectory, "short-ids", "smoke"),
				"not a registry",
			);

			const server = await serve(dependencies, 0);

			try {
				const history = await runHistory(server);
				expect(history.status).toBe(200);
				expect(
					await readShortIds(dependencies.runsDirectory, "audit-log"),
				).toEqual([{ shortId: "audit-log/r1", record: { kind: "run", run } }]);
			} finally {
				await server.stop(true);
			}
		});
	});
});
