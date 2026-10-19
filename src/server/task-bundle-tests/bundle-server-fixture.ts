import type { RunLiveness } from "#benchmark/run-liveness";
import {
	FAKE_LAUNCH_TIME,
	FakeLauncher,
	directoryLiveCorpus,
} from "#server/launch-test-support";
import createLaunchApp from "#server/launches";
import { writeBundleCases } from "#server/task-bundle-tests/bundle-case-fixture";
import type { FixtureEntry } from "#server/task-bundle-tests/bundle-workspace";
import { bundleWorkspace } from "#server/task-bundle-tests/bundle-workspace";

interface Serving extends AsyncDisposable {
	readonly inspect: () => Promise<readonly FixtureEntry[]>;
	readonly directory: (name: string) => Promise<string>;
	readonly repository: () => Promise<string>;
	readonly request: (path: string, init?: RequestInit) => Promise<Response>;
	readonly post: (path: string, json: string) => Promise<Response>;
	readonly cases: string;
}

const NOTHING_RUNNING = {
	isAlive: () => false,
	readMarker: async () => {
		await Promise.try((): undefined => undefined);
	},
} satisfies RunLiveness;

async function serving(): Promise<Serving> {
	const workspace = await bundleWorkspace();
	try {
		const cases = await workspace.directory("cases");
		await writeBundleCases(cases);
		const runsDirectory = await workspace.directory("runs");
		const app = createLaunchApp({
			casesRoot: cases,
			home: runsDirectory,
			launcher: new FakeLauncher(),
			liveCorpus: () => directoryLiveCorpus(runsDirectory),
			liveness: NOTHING_RUNNING,
			now: () => new Date(FAKE_LAUNCH_TIME),
			runsDirectory,
		});

		return servingRequests({ app, cases, workspace });
	} catch (error) {
		await workspace[Symbol.asyncDispose]();
		throw error;
	}
}

interface BundleServingInput {
	readonly app: Readonly<Pick<ReturnType<typeof createLaunchApp>, "request">>;
	readonly cases: string;
	readonly workspace: Awaited<ReturnType<typeof bundleWorkspace>>;
}

function servingRequests({
	app,
	cases,
	workspace,
}: BundleServingInput): Serving {
	const request = async (path: string, init?: RequestInit): Promise<Response> =>
		await Promise.resolve(app.request(path, init));
	return {
		[Symbol.asyncDispose]: async () => {
			await workspace[Symbol.asyncDispose]();
		},
		cases,
		directory: async (name) => {
			const directory = await workspace.directory(name);
			return directory;
		},
		inspect: async () => await workspace.inspect(),
		post: async (path, json) =>
			await request(path, {
				body: json,
				headers: { "content-type": "application/json" },
				method: "POST",
			}),
		repository: async () => {
			const repository = await workspace.repository();
			return repository;
		},
		request,
	};
}

export { serving as default };
export type { Serving };
