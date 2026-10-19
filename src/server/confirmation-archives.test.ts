import { afterEach, describe, expect, it } from "bun:test";
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { z } from "zod";
import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	directorySource,
	fixedCorpusSource,
	nothingRunning,
	NO_PROVIDER_PROJECTS,
} from "#benchmark/run-records-test-support";
import { createAppServer } from "./app";
import { directoryLiveCorpus, FakeLauncher } from "./launch-test-support";

const GROUP = "api-incomplete";
const PORT = 4173;
const HOST = `127.0.0.1:${String(PORT)}`;
const archiveSchema = z.object({
	groupId: z.string(),
	archivedAt: z.iso.datetime(),
});
const listingSchema = z.object({
	archived: z.array(archiveSchema),
	unreadable: z.array(
		z.object({
			id: z.string(),
			reason: z.string(),
			groupId: z.string().optional(),
		}),
	),
});
const errorSchema = z.object({ error: z.string().min(1) });

class ArchiveServer {
	private constructor(
		public readonly root: string,
		private readonly app: Readonly<
			Pick<ReturnType<typeof createAppServer>, "request">
		>,
	) {}
	public static async setup(): Promise<ArchiveServer> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-archive-api-"));
		const corpus = join(root, "corpus");
		await mkdir(corpus);
		await mkdir(confirmationGroupPaths(root, GROUP).inputsDirectory, {
			recursive: true,
		});
		await Bun.write(
			join(confirmationGroupPaths(root, GROUP).inputsDirectory, "saved.txt"),
			"evidence",
		);
		const source = directorySource(corpus);
		const app = createAppServer({
			runsDirectory: root,
			projectsDirectory: NO_PROVIDER_PROJECTS,
			liveness: nothingRunning,
			readCorpusSource: fixedCorpusSource(source),
			clientDistDirectory: root,
			port: PORT,
			casesRoot: join(root, "cases"),
			launcher: new FakeLauncher(),
			liveCorpus: () => directoryLiveCorpus(root),
			home: root,
		});
		return new ArchiveServer(root, app);
	}
	public list(): Promise<Response> {
		return Promise.resolve(
			this.app.request("/api/confirmation-archives", {
				headers: { host: HOST },
			}),
		);
	}
	public write(
		action: "archive" | "restore",
		groupId = GROUP,
		headers: Readonly<Record<string, string>> = {},
	): Promise<Response> {
		return Promise.resolve(
			this.app.request(
				`/api/confirmation-archives/${encodeURIComponent(groupId)}/${action}`,
				{
					method: "POST",
					headers: {
						host: HOST,
						origin: `http://${HOST}`,
						"content-type": "application/json",
						...headers,
					},
					body: "{}",
				},
			),
		);
	}
	public async teardown(): Promise<void> {
		await rm(this.root, { recursive: true, force: true });
	}
}

describe("/api/confirmation-archives", () => {
	const servers: ArchiveServer[] = [];
	afterEach(async () => {
		await Promise.all(servers.splice(0).map((instance) => instance.teardown()));
	});
	async function server(): Promise<ArchiveServer> {
		const instance = await ArchiveServer.setup();
		servers.push(instance);
		return instance;
	}
	it("archives through the guarded application and exposes a restorable collection", async () => {
		const app = await server();

		const response = await app.write("archive");

		expect(response.status).toBe(200);
		const archived = archiveSchema.parse(await response.json());
		expect(archived.groupId).toBe(GROUP);
		const listed = await app.list();
		expect(listed.status).toBe(200);
		expect(listingSchema.parse(await listed.json())).toEqual({
			archived: [archived],
			unreadable: [],
		});
		expect(
			await Bun.file(
				join(
					confirmationGroupPaths(app.root, GROUP).inputsDirectory,
					"saved.txt",
				),
			).text(),
		).toBe("evidence");
	});
	it("restores through the guarded application without deleting saved evidence", async () => {
		const app = await server();
		const archived = await app.write("archive");
		expect(archived.status).toBe(200);

		const response = await app.write("restore");

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ restored: true });
		const listed = await app.list();
		expect(listingSchema.parse(await listed.json())).toEqual({
			archived: [],
			unreadable: [],
		});
		expect(
			await Bun.file(
				join(
					confirmationGroupPaths(app.root, GROUP).inputsDirectory,
					"saved.txt",
				),
			).text(),
		).toBe("evidence");
	});
	it("clears corrupt regular metadata through restore using its server-authored group identity", async () => {
		const app = await server();
		await Bun.write(
			join(app.root, "confirmation-archives", `${GROUP}.json`),
			"not-json",
		);
		const before = await app.list();
		const report = listingSchema.parse(await before.json());
		expect(
			report.unreadable.map(({ id, groupId }) => ({ id, groupId })),
		).toEqual([{ id: GROUP, groupId: GROUP }]);

		const response = await app.write("restore");

		expect(response.status).toBe(200);
		const after = await app.list();
		expect(listingSchema.parse(await after.json())).toEqual({
			archived: [],
			unreadable: [],
		});
		expect(
			await Bun.file(
				join(
					confirmationGroupPaths(app.root, GROUP).inputsDirectory,
					"saved.txt",
				),
			).text(),
		).toBe("evidence");
	});

	describe("when requests are refused", () => {
		it.each(["archive", "restore"] as const)(
			"rejects cross-origin %s requests without changing metadata",
			async (action) => {
				const app = await server();

				const response = await app.write(action, GROUP, {
					origin: "https://attacker.test",
				});

				expect(response.status).toBe(403);
				const listed = await app.list();
				expect(listingSchema.parse(await listed.json())).toEqual({
					archived: [],
					unreadable: [],
				});
			},
		);
		it.each(["archive", "restore"] as const)(
			"rejects non-JSON %s requests",
			async (action) => {
				const app = await server();

				const response = await app.write(action, GROUP, {
					"content-type": "text/plain",
				});

				expect(response.status).toBe(403);
			},
		);
		it("rejects an invalid identity", async () => {
			const app = await server();

			const response = await app.write("archive", "../escape");

			expect(response.status).toBe(400);
			expect(errorSchema.parse(await response.json()).error).toBe(
				"Invalid confirmation group ID",
			);
		});
		it("rejects an absent group", async () => {
			const app = await server();

			const response = await app.write("archive", "absent");

			expect(response.status).toBe(404);
			expect(errorSchema.parse(await response.json()).error).toBe(
				"Confirmation group does not exist",
			);
		});
		it("rejects a group with a saved summary", async () => {
			const app = await server();
			await Bun.write(confirmationGroupPaths(app.root, GROUP).groupFile, "{}");

			const response = await app.write("archive");

			expect(response.status).toBe(409);
			expect(errorSchema.parse(await response.json()).error).toBe(
				"Confirmation group has a saved summary",
			);
		});
		it("reports refused persistence and keeps the incomplete group available", async () => {
			const app = await server();
			await Bun.write(
				join(app.root, "confirmation-archives"),
				"unwritable directory",
			);

			const response = await app.write("archive");

			expect(response.status).toBe(409);
			expect(errorSchema.parse(await response.json()).error).toBe(
				"Confirmation archive paths must be real directories",
			);
			expect(
				await Bun.file(
					join(
						confirmationGroupPaths(app.root, GROUP).inputsDirectory,
						"saved.txt",
					),
				).text(),
			).toBe("evidence");
		});
	});
});
