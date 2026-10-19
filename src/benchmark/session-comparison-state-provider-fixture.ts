import { mkdir, realpath } from "node:fs/promises";
import { join } from "node:path";

import { runCommand } from "./command";
import type { ComparisonArm } from "./comparison-record";
import type { SessionAttemptRequest } from "./session-attempt";
import { projectSlug } from "./session-capture";

const MISSING_OPTION_INDEX = -1;

const OPTION_VALUE_POSITION_OFFSET = 1;

const WRITTEN_SESSION = "99999999-9999-9999-9999-999999999999";

interface ProviderDirectories {
	readonly projectsDirectory: string;
}

interface ObservedArm {
	readonly role: ComparisonArm;
	readonly recordStyle: (style: string) => void;
}

function envelope(result: string): string {
	return JSON.stringify({
		duration_api_ms: 800,
		duration_ms: 900,
		is_error: false,
		num_turns: 1,
		result,
		session_id: WRITTEN_SESSION,
		subtype: "success",
		total_cost_usd: 0.0012,
		type: "result",
		usage: {
			cache_creation_input_tokens: 0,
			cache_read_input_tokens: 0,
			input_tokens: 12,
			output_tokens: 3,
		},
	});
}

async function overlaidStyle(cwd: string): Promise<string | undefined> {
	const style = Bun.file(join(cwd, ".claude", "output-styles", "brief.md"));
	return (await style.exists()) ? await style.text() : undefined;
}

class StateScoringProvider {
	public constructor(private readonly props: ProviderDirectories) {}

	public forRole({
		role,
		recordStyle,
	}: ObservedArm): SessionAttemptRequest["runClaude"] {
		const session =
			role === "control" ? this.idleClaude() : this.workingClaude();
		return async (command, cwd) => {
			recordStyle(`${role}:${await overlaidStyle(cwd)}`);

			return await session(command, cwd);
		};
	}

	private async replyFrom(
		command: readonly string[],
		cwd: string,
	): Promise<string> {
		const named = command.indexOf("--session-id");
		const sessionId =
			command[
				(named === MISSING_OPTION_INDEX ? command.indexOf("--resume") : named) +
					OPTION_VALUE_POSITION_OFFSET
			] ?? "";
		const slug = join(
			this.props.projectsDirectory,
			projectSlug(await realpath(cwd)),
		);

		await mkdir(slug, { recursive: true });

		await Bun.write(
			join(slug, `${sessionId}.jsonl`),
			`${JSON.stringify({
				message: { content: [{ text: "done", type: "text" }] },
				sessionId,
				type: "assistant",
			})}\n`,
		);

		return envelope("done");
	}

	private workingClaude(): SessionAttemptRequest["runClaude"] {
		return async (command, cwd) => {
			await runCommand(
				[
					"sh",
					"-c",
					String.raw`printf '2026-02-01 | February refund | -18.40\n' >> LEDGER.md && git add LEDGER.md && git commit -m 'fix(ledger): post the February refund'`,
				],
				cwd,
				{ env: { GIT_CONFIG_GLOBAL: "/dev/null", GIT_CONFIG_NOSYSTEM: "1" } },
			);

			return await this.replyFrom(command, cwd);
		};
	}

	private idleClaude(): SessionAttemptRequest["runClaude"] {
		return async (command: readonly string[], cwd: string) =>
			await this.replyFrom(command, cwd);
	}
}

export { StateScoringProvider as default };
