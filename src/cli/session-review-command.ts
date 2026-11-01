import {
	visibleControlCharacters,
	visibleControlCharactersInJson,
} from "#benchmark/visible-control-characters";
import { UsageError } from "#cli/command-usage";
import type { CommandOutput } from "#cli/output";
import type { ReviewRequest } from "#cli/review-command";
import type { SessionReviewReading } from "#server/session-review";
import {
	readSessionReview,
	recordSessionReview,
	sessionReviewFrom,
} from "#server/session-review";

const EMPTY_COUNT = 0;
const JSON_INDENT_SPACES = 2;

async function runSessionReview(
	request: ReviewRequest & { readonly id: string },
	output: CommandOutput,
): Promise<void> {
	const identity = { id: request.id, runsDirectory: request.runsDirectory };
	const context = await readSessionReview(identity);
	const described =
		request.verdict !== undefined ||
		request.summary !== undefined ||
		request.findings.length > EMPTY_COUNT;
	if (
		request.findings.length > EMPTY_COUNT ||
		(request.file !== undefined && described)
	) {
		throw new UsageError(
			"Session review takes --file or --verdict/--summary; --finding is pipeline-only",
		);
	}

	let reading = context;
	if (request.file !== undefined || described) {
		const text =
			request.file === undefined
				? JSON.stringify({
						requirements: [],
						sourceSha256: context.sourceSha256,
						summary: request.summary,
						verdict: request.verdict,
					})
				: await Bun.file(request.file).text();
		reading = await recordSessionReview(
			identity,
			sessionReviewFrom(text),
			new Date().toISOString(),
		);
	}

	writeReviewReading(reading, request.json, output);
}

function writeReviewReading(
	reading: SessionReviewReading,
	json: boolean,
	output: CommandOutput,
): void {
	if (json) {
		output.stdout(
			`${visibleControlCharactersInJson(JSON.stringify(reading, null, JSON_INDENT_SPACES))}\n`,
		);
	} else {
		output.stdout(
			`${visibleControlCharacters(reading.id)}\nHuman review: ${reading.review?.verdict ?? "not recorded"}\n${visibleControlCharacters(reading.review?.summary ?? "")}\nSource SHA-256: ${reading.sourceSha256}\nSaved rubric requirements: ${visibleControlCharacters(reading.requirements.join(", ") || "none")}\n`,
		);
	}
}

export { runSessionReview as default };
