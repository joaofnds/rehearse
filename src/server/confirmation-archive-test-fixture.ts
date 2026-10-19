import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { confirmationGroupPaths } from "#benchmark/run-layout";
import {
	NO_PROVIDER_PROJECTS,
	directorySource,
	fixedCorpusSource,
	nothingRunning,
} from "#benchmark/run-records-test-support";

import createAppServer from "./app";
import {
	FAKE_LAUNCH_TIME,
	FakeLauncher,
	directoryLiveCorpus,
} from "./launch-test-support";

const CLEANUP_START_INDEX = 0;

const GROUP = "api-incomplete";

const PORT = 4173;

const HOST = `127.0.0.1:${String(PORT)}`;

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
			casesRoot: join(root, "cases"),
			clientDistDirectory: root,
			home: root,
			launcher: new FakeLauncher(),
			liveCorpus: () => directoryLiveCorpus(root),
			liveness: nothingRunning,
			now: () => new Date(FAKE_LAUNCH_TIME),
			port: PORT,
			projectsDirectory: NO_PROVIDER_PROJECTS,
			readCorpusSource: fixedCorpusSource(source),
			runsDirectory: root,
		});

		return new ArchiveServer(root, app);
	}
	public async list(): Promise<Response> {
		return await this.app.request("/api/confirmation-archives", {
			headers: { host: HOST },
		});
	}
	public async write(
		action: "archive" | "restore",
		groupId = GROUP,
		headers: Readonly<Record<string, string>> = {},
	): Promise<Response> {
		return await this.app.request(
			`/api/confirmation-archives/${encodeURIComponent(groupId)}/${action}`,
			{
				body: "{}",
				headers: {
					"content-type": "application/json",
					host: HOST,
					origin: `http://${HOST}`,
					...headers,
				},
				method: "POST",
			},
		);
	}
	public async teardown(): Promise<void> {
		await rm(this.root, { force: true, recursive: true });
	}
}

const servers: ArchiveServer[] = [];

async function server(): Promise<ArchiveServer> {
	const instance = await ArchiveServer.setup();
	servers.push(instance);

	return instance;
}

async function clearArchiveServers(): Promise<void> {
	await Promise.all(
		servers.splice(CLEANUP_START_INDEX).map(async (instance) => {
			await instance.teardown();
		}),
	);
}

export { server, GROUP, clearArchiveServers };
