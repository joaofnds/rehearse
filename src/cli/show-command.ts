import type { CorpusSourceResolver } from "#benchmark/corpus-source";
import { resolveCorpusSource } from "#benchmark/corpus-source";
import { UsageError } from "#cli/command-usage";
import type { CommandOutput } from "#cli/output";
import { recordIdForms } from "#cli/record-id";

import { recordFileFor, recordText } from "./record-file-location";
import recordIdFor from "./record-reference-resolution";
import summaryOf from "./record-summary-output";
import checkoutRetainedCandidate from "./retained-candidate-checkout";

interface ShowRequest {
	readonly id: string | undefined;
	readonly json: boolean;
	readonly runsDirectory: string;
	readonly checkout?: string | undefined;
}

interface ShowDependencies {
	readonly resolveCorpus?: CorpusSourceResolver | undefined;
}

async function runShow(
	request: ShowRequest,
	output: CommandOutput,
	dependencies: ShowDependencies = {},
): Promise<void> {
	if (request.id === undefined) {
		throw new UsageError(
			`Provide the record id: rehearse show <${recordIdForms().join(" | ")}>`,
		);
	}

	if (request.checkout !== undefined) {
		output.stdout(
			`${await checkoutRetainedCandidate(request.id, request.checkout, request.runsDirectory)}\n`,
		);

		return;
	}

	const id = await recordIdFor({
		given: request.id,
		runsDirectory: request.runsDirectory,
	});
	const text = await recordText({
		file: await recordFileFor(id, request.runsDirectory),
		id: request.id,
	});

	output.stdout(
		request.json
			? text
			: await summaryOf(id, text, {
					resolveCorpus: dependencies.resolveCorpus ?? resolveCorpusSource,
					runsDirectory: request.runsDirectory,
				}),
	);
}

export { recordFileFor } from "./record-file-location";

export { runShow };

export type { ShowDependencies, ShowRequest };
