import { displayPath } from "#benchmark/config";
import type { ParsedConfirmationGroupRecord } from "#benchmark/confirmation-record";
import type { Immutable } from "#benchmark/contracts";
import { CorpusConfigurationError } from "#benchmark/corpus-file";
import type {
	CorpusSourceResolver,
	ResolvedCorpusSource,
} from "#benchmark/corpus-source";
import { CorpusSourceError } from "#benchmark/corpus-source";
import type { RepReadsSummary } from "#benchmark/record-summary";
import { groupRepReads, recordedRepReads } from "#benchmark/staleness-report";
import { RefusedPreconditionError } from "#cli/interactive-stdin";

/**
 * The reps' reads are judged against the corpus `stale` judges them against,
 * the linked corpus, and a corpus that does not resolve leaves them listed
 * unjudged rather than refusing the rest of the summary.
 */

interface GroupRepReadsRequest {
	readonly runsDirectory: string;
	readonly record: Immutable<ParsedConfirmationGroupRecord>;
	readonly resolveCorpus: CorpusSourceResolver;
}

async function readCorpusForRepReads({
	runsDirectory,
	record,
	resolveCorpus,
}: GroupRepReadsRequest): Promise<ResolvedCorpusSource | RepReadsSummary> {
	try {
		return await resolveCorpus();
	} catch (error) {
		if (
			error instanceof CorpusSourceError ||
			error instanceof CorpusConfigurationError ||
			error instanceof RefusedPreconditionError
		) {
			const recorded = await recordedRepReads(
				runsDirectory,
				record.groupId,
				record,
			);

			return {
				judgedAgainst: undefined,
				reads: {
					reasons: [...recorded.reasons, `Reads not judged: ${error.message}`],
					reps: recorded.reps,
				},
			};
		}

		throw error;
	}
}

async function groupRepReadsOf(
	runsDirectory: string,
	record: Immutable<ParsedConfirmationGroupRecord>,
	resolveCorpus: CorpusSourceResolver,
): Promise<RepReadsSummary> {
	const source = await readCorpusForRepReads({
		record,
		resolveCorpus,
		runsDirectory,
	});

	if ("reads" in source) {
		return source;
	}

	return {
		judgedAgainst:
			source.kind === "live"
				? "the live install"
				: `the corpus at ${displayPath(source.root)}`,
		reads: await groupRepReads(runsDirectory, record.groupId, source),
	};
}

export { groupRepReadsOf as default };
