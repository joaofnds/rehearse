import type { Immutable } from "./contracts";
import type { SessionAttempt } from "./session-attempt";
import {
	readSessionGroup,
	recordedSessionRep,
} from "./session-comparison-record-reader-fixture";
import { JSON_INDENTATION_SPACES } from "./session-comparison-test-contract";
import { parseSessionAttemptRecord } from "./session-record";

interface AttemptPromptChange {
	readonly groupFile: string;
	readonly prompt: string;
}

async function updateAttemptPrompts({
	groupFile,
	prompt,
}: AttemptPromptChange): Promise<void> {
	await updateAttempts(groupFile, (attempt) => ({ ...attempt, prompt }));
}

async function updateAttempts(
	groupFile: string,
	change: (
		attempt: Immutable<ReturnType<typeof parseSessionAttemptRecord>>,
	) => Immutable<ReturnType<typeof parseSessionAttemptRecord>>,
): Promise<void> {
	const group = await readSessionGroup(groupFile);

	await Array.fromAsync(group.repRecords, async (reference) => {
		const { attemptPath } = await recordedSessionRep({ groupFile, reference });
		const attempt = parseSessionAttemptRecord(
			await Bun.file(attemptPath).text(),
		);

		await Bun.write(
			attemptPath,
			`${JSON.stringify(change(attempt), null, JSON_INDENTATION_SPACES)}\n`,
		);
	});
}

async function updateAttemptChecks(
	groupFile: string,
	checks: readonly SessionAttempt["checks"][number][],
): Promise<void> {
	await updateAttempts(groupFile, (attempt) => {
		const status = attempt.outcome === "SUCCESSFUL" ? "PASS" : "FAIL";

		return {
			...attempt,
			checks: checks.map(({ kind, detail }) => ({ detail, kind, status })),
		};
	});
}

export { updateAttemptChecks, updateAttemptPrompts, updateAttempts };
