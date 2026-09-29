import {
	CorpusSourceError,
	linkCorpus,
	unlinkCorpus,
} from "#benchmark/corpus-source";
import {
	readSettings,
	SET_SPEND_CEILING_COMMAND,
	storeSpendCeiling,
} from "#benchmark/settings";
import { asUsageErrorAsync, UsageError } from "#cli/commands";
import type { CommandOutput } from "#cli/output";

export interface SettingsRequest {
	readonly runsDirectory: string;
	readonly spendCeilingUsd: string | undefined;
	readonly linkCorpus: string | undefined;
	readonly unlinkCorpus: boolean;
	readonly json: boolean;
}

/**
 * Shows the stored settings, storing a new spend ceiling or corpus link first
 * when one is given. The records location is shown and never stored: the environment
 * variable that points every command at it owns it.
 */
export async function runSettings(
	request: SettingsRequest,
	output: CommandOutput,
): Promise<void> {
	if (request.linkCorpus !== undefined && request.unlinkCorpus) {
		throw new UsageError("Give --link-corpus or --unlink-corpus, not both");
	}

	const { spendCeilingUsd } = request;
	if (spendCeilingUsd !== undefined) {
		await asUsageErrorAsync(() =>
			storeSpendCeiling(request.runsDirectory, decimalUsd(spendCeilingUsd)),
		);
	}

	await changeCorpusLink(request);

	const settings = await readSettings(request.runsDirectory);
	if (request.json) {
		output.stdout(
			`${JSON.stringify({ ...settings, recordsDirectory: request.runsDirectory })}\n`,
		);

		return;
	}

	const ceiling =
		settings.spendCeilingUsd === undefined
			? `not set, so nothing spends. Set it with: ${SET_SPEND_CEILING_COMMAND}`
			: `USD ${String(settings.spendCeilingUsd)}`;
	const corpus =
		settings.linkedCorpusDirectory ??
		"the live install, since no directory is linked";
	output.stdout(
		`Spend ceiling: ${ceiling}\nLinked corpus: ${corpus}\nRecords location: ${request.runsDirectory}\n`,
	);
}

async function changeCorpusLink(request: SettingsRequest): Promise<void> {
	if (request.unlinkCorpus) {
		await unlinkCorpus(request.runsDirectory);
	}
	if (request.linkCorpus === undefined) {
		return;
	}

	try {
		await linkCorpus(request.runsDirectory, request.linkCorpus);
	} catch (error) {
		if (error instanceof CorpusSourceError) {
			throw new UsageError(error.message);
		}
		throw error;
	}
}

/** Only a plain decimal is an amount, so "0x10" or "" is refused, not read as 16 or 0. */
function decimalUsd(text: string): number {
	if (!/^\d+(?:\.\d+)?$/u.test(text)) {
		throw new RangeError(
			`A spend ceiling is a positive number of USD, not ${JSON.stringify(text)}`,
		);
	}

	return Number(text);
}
