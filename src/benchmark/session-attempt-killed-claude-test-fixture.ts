import { realpath } from "node:fs/promises";

import { CommandError } from "#benchmark/command";
import type { SessionAttemptRequest } from "#benchmark/session-attempt";

import {
	FakeClaude,
	namedSession,
} from "./session-attempt-provider-test-fixtures";
import { transcriptLine } from "./session-attempt-transcript-test-fixtures";

const KILLED_EXIT_CODE = 143;

/** A provider command that writes its transcript, then runs until killed. */
class KilledClaude {
	private readonly started = Promise.withResolvers<string>();
	private readonly killed = Promise.withResolvers<string>();
	private readonly claude: FakeClaude;
	private cwd = "";

	public constructor(projects: string) {
		this.claude = new FakeClaude(projects, "OK");
	}

	public get attemptDirectory(): string {
		return this.cwd;
	}

	/** The transcript the session wrote before the kill. */
	public get writtenTranscript(): string {
		const [only] = this.claude.runs;

		return `${transcriptLine(namedSession(only?.command ?? []), "OK")}\n`;
	}

	public readonly run: SessionAttemptRequest["runClaude"] = async (
		command,
		cwd,
	) => {
		this.cwd = await realpath(cwd);
		await this.claude.run(command, cwd);
		this.started.resolve(this.cwd);

		return await this.killed.promise;
	};

	public async running(): Promise<string> {
		return await this.started.promise;
	}

	public kill(): void {
		this.killed.reject(
			new CommandError(["claude"], {
				exitCode: KILLED_EXIT_CODE,
				stderr: "",
				stdout: "",
			}),
		);
	}
}

export { KilledClaude as default };
