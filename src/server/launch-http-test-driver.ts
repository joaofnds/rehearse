import { join } from "node:path";

import type { RunLiveness } from "#benchmark/run-liveness";
import {
	FAKE_LAUNCH_TIME,
	FakeLauncher,
	directoryLiveCorpus,
} from "#server/launch-test-support";
import createLaunchApp from "#server/launches";
import type { LaunchRoutes } from "#server/launches";

type JsonWriteValue =
	| string
	| number
	| boolean
	| null
	| readonly JsonWriteValue[]
	| { readonly [key: string]: JsonWriteValue | undefined };

type LaunchRequestBody = Readonly<Record<string, number | string>>;
type SettingsRequestBody = Readonly<Record<string, string | number>>;

interface LaunchServerContext {
	readonly runsDirectory: string;
	readonly casesRoot: string;
	readonly liveness: RunLiveness;
}

class LaunchHttpDriver {
	#currentTime = new Date(FAKE_LAUNCH_TIME);

	public readonly now = (): Date => new Date(this.#currentTime);

	public advanceTimeTo(time: Readonly<Date>): void {
		this.#currentTime = new Date(time);
	}

	public readonly launcher: FakeLauncher;
	public readonly runsDirectory: string;
	public readonly casesDirectory: string;
	public readonly home: string;
	readonly #app: LaunchRoutes;
	readonly #liveness: RunLiveness;

	public constructor({
		runsDirectory,
		casesRoot,
		liveness,
	}: LaunchServerContext) {
		this.runsDirectory = runsDirectory;
		this.casesDirectory = casesRoot;
		this.home = join(runsDirectory, "operator-home");
		this.launcher = new FakeLauncher();
		this.#liveness = liveness;

		this.#app = createLaunchApp({
			casesRoot,
			home: this.home,
			launcher: this.launcher,
			liveCorpus: () => directoryLiveCorpus(runsDirectory),
			liveness,
			now: this.now,
			runsDirectory,
		});
	}

	public readonly declare = async (body: JsonWriteValue): Promise<Response> =>
		await this.send("POST", "/api/cases", body);

	public readonly get = async (path: string): Promise<Response> =>
		await this.#app.request(path);

	public readonly pause = async (run: string): Promise<Response> =>
		await this.send("POST", `/api/runs/${run}/pause`, {});

	public readonly post = async (body: LaunchRequestBody): Promise<Response> =>
		await this.send("POST", "/api/launches", body);

	public readonly restarted = async (): Promise<LaunchHttpDriver> => {
		const driver = await Promise.resolve(
			new LaunchHttpDriver({
				casesRoot: this.casesDirectory,
				liveness: this.#liveness,
				runsDirectory: this.runsDirectory,
			}),
		);
		driver.advanceTimeTo(this.now());

		return driver;
	};

	public readonly send = async (
		method: "PUT" | "DELETE" | "POST",
		path: string,
		body: JsonWriteValue,
	): Promise<Response> =>
		await this.#app.request(path, {
			body: JSON.stringify(body),
			headers: { "content-type": "application/json" },
			method,
		});

	public readonly stop = async (id: string): Promise<Response> =>
		await this.send("POST", `/api/launches/${id}/stop`, {});

	public readonly stopRun = async (run: string): Promise<Response> =>
		await this.send("POST", `/api/runs/${run}/stop`, {});
}

export { LaunchHttpDriver as default };
export type {
	LaunchServerContext,
	JsonWriteValue,
	LaunchRequestBody,
	SettingsRequestBody,
};
