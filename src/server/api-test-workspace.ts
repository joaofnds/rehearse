import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { CorpusRoot } from "#benchmark/corpus-file";
import {
	NO_PROVIDER_PROJECTS,
	RecordedRunsFixture,
	claimBy,
	directorySource,
	fixedCorpusSource,
	liveStageSettings,
	nothingRunning,
} from "#benchmark/run-records-test-support";
import type { RecordedRunsOptions } from "#benchmark/run-records-test-support";
import type { ApiDependencies } from "#server/api";
import createApiApp from "#server/api";
import { readCorpusResponse } from "#server/api-test-driver";
import type { CorpusResponse } from "#server/api-test-driver";
import ApiHttpDriver from "#server/api-test-http-driver";

const RESOURCE_DRAIN_START_INDEX = 0;

const RUN_OWNER_PID = 4242;

interface ApiTestServer {
	readonly app: ApiHttpDriver;
	readonly corpus: string;
	readonly fixture: RecordedRunsFixture;
}

interface ApiTestOptions {
	readonly runsDirectory: string;
	readonly projectsDirectory?: string;
	readonly source?: CorpusRoot;
	readonly liveness?: ApiDependencies["liveness"];
	readonly readCorpusSource?: ApiDependencies["readCorpusSource"];
	readonly unhandledFailureMessage?: string;
}

class ApiTestWorkspace {
	public async start(options: ApiTestOptions): Promise<ApiHttpDriver> {
		const source =
			options.source ?? directorySource(await this.corpusDirectory());

		return configuredApi({ ...options, source });
	}
	public async runningWithoutCorpus(): Promise<{
		readonly app: ApiHttpDriver;
		readonly fixture: RecordedRunsFixture;
	}> {
		const fixture = await this.writtenFixture();
		await fixture.events.writeRunningRun();
		const app = await this.start({
			liveness: {
				isAlive: () => true,
				readMarker: async () =>
					await Promise.resolve(claimBy(fixture.runningRun, RUN_OWNER_PID)),
			},
			readCorpusSource: async () =>
				await Promise.reject<CorpusRoot>(
					new Error("the corpus source cannot be read"),
				),
			runsDirectory: fixture.runsDirectory,
		});

		return { app, fixture };
	}

	private readonly roots: string[] = [];

	public track(root: string): void {
		this.roots.push(root);
	}

	public async dispose(): Promise<void> {
		await Promise.all(
			this.roots.splice(RESOURCE_DRAIN_START_INDEX).map(async (root) => {
				await rm(root, { force: true, recursive: true });
			}),
		);
	}

	public async emptyDirectory(prefix: string): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), prefix));
		this.roots.push(root);

		return root;
	}

	public async corpusWithExternalInstructions(): Promise<{
		readonly corpus: string;
		readonly outside: string;
	}> {
		const corpus = await this.corpusDirectory();
		const outside = await this.emptyDirectory("rehearse-api-outside-");
		await writeFile(join(outside, "secret.md"), "SECRET BYTES\n");
		await rm(join(corpus, "CLAUDE.md"));
		await symlink(join(outside, "secret.md"), join(corpus, "CLAUDE.md"));

		return { corpus, outside };
	}

	public async corpusDirectory(): Promise<string> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-api-corpus-"));
		this.roots.push(root);
		await mkdir(join(root, "skills", "build"), { recursive: true });
		await mkdir(join(root, "skills", "discuss"), { recursive: true });
		await Bun.write(join(root, "CLAUDE.md"), "the instructions\n");
		await Bun.write(join(root, "skills", "build", "SKILL.md"), "build skill\n");
		await Bun.write(
			join(root, "skills", "discuss", "SKILL.md"),
			"discuss skill\n",
		);

		return root;
	}

	public async writtenFixture(
		options: RecordedRunsOptions = {},
	): Promise<RecordedRunsFixture> {
		const root = await mkdtemp(join(tmpdir(), "rehearse-api-"));
		this.roots.push(root);
		const fixture = new RecordedRunsFixture(root, options);
		await fixture.write();

		return fixture;
	}

	public async corpusResponse(source: CorpusRoot): Promise<CorpusResponse> {
		const runsDirectory = await this.emptyDirectory("rehearse-api-runs-");
		return await readCorpusResponse(apiTestApp(runsDirectory, source));
	}

	public async serving(): Promise<ApiTestServer> {
		const fixture = await this.writtenFixture();
		const corpus = await this.corpusDirectory();

		return {
			app: apiTestApp(fixture.runsDirectory, directorySource(corpus)),
			corpus,
			fixture,
		};
	}

	public async servingLiveSettings(): Promise<ApiTestServer> {
		const fixture = await this.fixtureRecordingLiveSettings();
		const corpus = await this.corpusDirectory();

		return {
			app: apiTestApp(fixture.runsDirectory, directorySource(corpus)),
			corpus,
			fixture,
		};
	}

	public async fixtureRecordingLiveSettings(): Promise<RecordedRunsFixture> {
		return await this.writtenFixture({
			settingsFile: await liveStageSettings(),
		});
	}
}

function configuredApi(
	options: ApiTestOptions & { readonly source: CorpusRoot },
): ApiHttpDriver {
	const app = createApiApp({
		liveness: options.liveness ?? nothingRunning,
		projectsDirectory: options.projectsDirectory ?? NO_PROVIDER_PROJECTS,
		readCorpusSource:
			options.readCorpusSource ?? fixedCorpusSource(options.source),
		runsDirectory: options.runsDirectory,
	});
	const { unhandledFailureMessage } = options;
	if (unhandledFailureMessage !== undefined) {
		app.get("/api/throws", () => {
			throw new Error(unhandledFailureMessage);
		});
	}

	return new ApiHttpDriver(app);
}

function apiTestApp(runsDirectory: string, source: CorpusRoot): ApiHttpDriver {
	return configuredApi({ runsDirectory, source });
}

export { ApiTestWorkspace, apiTestApp };

export type { ApiTestOptions };
