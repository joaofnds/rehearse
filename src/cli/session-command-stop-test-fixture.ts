import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";

import { runSessionAttempt } from "#benchmark/session-attempt";
import type { SessionAttempt } from "#benchmark/session-attempt";
import { request } from "#benchmark/session-attempt-case-test-fixtures";
import KilledClaude from "#benchmark/session-attempt-killed-claude-test-fixture";
import { FakeClaude } from "#benchmark/session-attempt-provider-test-fixtures";
import {
	projectsRoot,
	recordDirectory,
} from "#benchmark/session-attempt-workspace-test-fixtures";

import { recordOutput } from "./cli-test-support";
import SessionCommandLifetime from "./session-command-lifetime";

/** What a stop left, read the moment its cleanup returns. */
interface AfterStop {
	readonly projectEntries: readonly string[];
	readonly recordedTranscripts: readonly string[];
	readonly writtenTranscripts: readonly string[];
	readonly attemptDirectoriesLeft: readonly boolean[];
	readonly preparingProviderRuns: number;
}

interface StopCallbacks {
	readonly cleanUp: () => Promise<void>;
	readonly recordStop: (signal: NodeJS.Signals) => Promise<void>;
}

async function exists(path: string): Promise<boolean> {
	try {
		await stat(path);

		return true;
	} catch {
		return false;
	}
}

async function recordedTranscript(record: string): Promise<string> {
	const file = Bun.file(join(record, "transcript.jsonl"));

	return (await file.exists()) ? await file.text() : "not recorded";
}

/**
 * Two attempts whose provider commands are running and a third still
 * preparing when the operator stops the command, through the stop callbacks
 * the command's lifetime hands its signal handling.
 */
class MidRunStop {
	private readonly killed: readonly KilledClaude[];
	private readonly records: string[] = [];
	private readonly preparing: FakeClaude;
	private readonly attempts: Promise<SessionAttempt>[] = [];
	private preparingAttempt: Promise<SessionAttempt> | undefined = undefined;
	private readonly lifetime: SessionCommandLifetime;
	private callbacks: StopCallbacks | undefined = undefined;

	private constructor(private readonly projects: string) {
		this.killed = [new KilledClaude(projects), new KilledClaude(projects)];
		this.preparing = new FakeClaude(projects, "OK");
		this.lifetime = new SessionCommandLifetime({
			boundary: {
				stopOnSignal: (cleanUp, recordStop) => {
					this.callbacks = { cleanUp, recordStop };

					return () => {
						this.callbacks = undefined;
					};
				},
			},
			config: {},
			output: recordOutput().output,
			runsDirectory: "/unused-session-records",
		});
	}

	public static async afterStop(): Promise<AfterStop> {
		const run = new MidRunStop(await projectsRoot());
		await run.startRunning();
		await run.startPreparing();

		return await run.stop();
	}

	private async startRunning(): Promise<void> {
		await Array.fromAsync(this.killed, async (claude) => {
			const record = await recordDirectory();
			this.records.push(record);
			this.attempts.push(this.attempt(record, claude.run));
		});
		await Promise.all(
			this.killed.map(async (claude) => await claude.running()),
		);
	}

	private async startPreparing(): Promise<void> {
		this.preparingAttempt = this.attempt(
			await recordDirectory(),
			this.preparing.run,
		);
		this.attempts.push(this.preparingAttempt);
	}

	private async attempt(
		record: string,
		runClaude: FakeClaude["run"],
	): Promise<SessionAttempt> {
		return await runSessionAttempt(
			request({
				inFlight: this.lifetime.inFlight,
				projectsDirectory: this.projects,
				recordDirectory: record,
				runClaude,
			}),
		);
	}

	private async stop(): Promise<AfterStop> {
		const finished = Promise.allSettled(this.attempts);
		const { recordStop, cleanUp } = this.registeredStop();
		await recordStop("SIGTERM");
		await this.killRunningThenLetPreparingContinue();
		await cleanUp();
		const after = await this.read();

		await finished;
		this.lifetime.close();

		return { ...after, preparingProviderRuns: this.preparing.runs.length };
	}

	/**
	 * The attempt still preparing goes on between the kill and the cleanup, as
	 * it would while the kill runs, so it reaches its provider call only if the
	 * stop has not refused it by then.
	 */
	private async killRunningThenLetPreparingContinue(): Promise<void> {
		for (const claude of this.killed) {
			claude.kill();
		}

		await Promise.allSettled([this.preparingAttempt]);
	}

	private registeredStop(): StopCallbacks {
		if (this.callbacks === undefined) {
			throw new Error("The command's lifetime registered no stop");
		}

		return this.callbacks;
	}

	private async read(): Promise<Omit<AfterStop, "preparingProviderRuns">> {
		return {
			attemptDirectoriesLeft: await Promise.all(
				this.killed.map(
					async (claude) => await exists(claude.attemptDirectory),
				),
			),
			projectEntries: await readdir(this.projects),
			recordedTranscripts: await Promise.all(
				this.records.map(async (record) => await recordedTranscript(record)),
			),
			writtenTranscripts: this.killed.map((claude) => claude.writtenTranscript),
		};
	}
}

export { MidRunStop as default };
export type { AfterStop };
