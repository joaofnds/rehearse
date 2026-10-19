import { describe, expect, it } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";

import { RECORDS_DIRECTORY_VARIABLE } from "#benchmark/config";
import { TestResources } from "#benchmark/test-support";

import startLocalServer from "./serve";
import serverConfigurationSchema from "./serve-configuration";

const EPHEMERAL_PORT = 0;

const SUCCESS_EXIT_CODE = 0;

const CHILD_TIMEOUT_MS = 3000;

const testResources = TestResources.forEachTest();

describe("server configuration", () => {
	it("defaults to port 4173 when PORT is absent", () => {
		expect(serverConfigurationSchema.parse({})).toEqual({ port: 4173 });
	});
	it.each([
		{ PORT: "0", port: 0 },
		{ PORT: "1", port: 1 },
		{ PORT: "65535", port: 65_535 },
		{ PORT: " 4173 ", port: 4173 },
		{ PORT: "+4173", port: 4173 },
		{ PORT: "4173.0", port: 4173 },
		{ PORT: "4.173e3", port: 4173 },
		{ PORT: "0x104d", port: 4173 },
		{ PORT: "0b1", port: 1 },
		{ PORT: "0o1", port: 1 },
	])("accepts integer TCP port $PORT as $port", ({ PORT, port }) => {
		expect(serverConfigurationSchema.parse({ PORT })).toEqual({ port });
	});

	describe("when PORT is invalid", () => {
		it.each([
			"",
			" ",
			"\t\n",
			"junk",
			"4173junk",
			"1.5",
			"-1",
			"65536",
			"Infinity",
			"NaN",
		])("rejects %j", (PORT) => {
			expect(serverConfigurationSchema.safeParse({ PORT }).success).toBe(false);
		});
	});
});

describe("server startup", () => {
	describe("when PORT is invalid", () => {
		it("refuses startup before reconciling run records", async () => {
			const recordsDirectory = await testResources.createTemporaryDirectory(
				"rehearse-serve-port-",
			);

			await using server = Bun.spawn(
				[process.execPath, join(import.meta.dir, "serve.ts")],
				{
					env: {
						...Bun.env,
						PORT: "junk",
						[RECORDS_DIRECTORY_VARIABLE]: recordsDirectory,
					},
					stderr: "pipe",
					stdout: "ignore",
					timeout: CHILD_TIMEOUT_MS,
				},
			);
			const [exitCode, errors] = await Promise.all([
				server.exited,
				new Response(server.stderr).text(),
			]);

			expect(exitCode).not.toBe(SUCCESS_EXIT_CODE);
			expect(server.signalCode).toBeNull();
			expect(errors).toContain("ZodError");
			expect(await readdir(recordsDirectory)).toEqual([]);
		});
	});
});

describe(startLocalServer.name, () => {
	it("binds the browser server to IPv4 loopback", async () => {
		const server = startLocalServer(
			EPHEMERAL_PORT,
			() => new Response("ready"),
		);

		try {
			expect(server.hostname).toBe("127.0.0.1");
			expect(
				await fetch(`http://127.0.0.1:${String(server.port)}`).then(
					async (response) => await response.text(),
				),
			).toBe("ready");
		} finally {
			await server.stop(true);
		}
	});
});
