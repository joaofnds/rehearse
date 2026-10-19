import { unhandled } from "#benchmark/contracts";
import type {
	EvidenceLocator,
	RecordedStageEvidence,
} from "#benchmark/contracts";
import {
	findSpan,
	spanInCommitSubjects,
	spanInDiff,
} from "#benchmark/evidence-locator";
import type { CitedFile, Span } from "#benchmark/evidence-locator";
import type RecordedSources from "#server/evidence-recorded-sources";
import type { RecordedHarnessResult } from "#server/evidence-recorded-sources";
import type { SourceView } from "#server/evidence-source-contract";

const EXCHANGE_NUMBER_BASE = 1;

const ORDINAL_BASE = 1;

function textView(
	label: string,
	text: string,
	span: Span | undefined,
): SourceView {
	return span === undefined
		? { kind: "text", label, text }
		: { kind: "text", label, span, text };
}

function commitSubjectView(
	subjects: readonly string[],
	index: number,
	quote: string | undefined,
): SourceView {
	return textView(
		`commit subject ${String(index + ORDINAL_BASE)}`,
		subjects.join("\n"),
		quote === undefined
			? undefined
			: spanInCommitSubjects(quote, subjects, index),
	);
}

function harnessView(
	result: RecordedHarnessResult,
	recorded: boolean,
): SourceView {
	return { kind: "harness", recorded, ...result };
}

function sourceView(
	evidence: RecordedStageEvidence,
	sources: RecordedSources,
): SourceView {
	if (evidence.locator === undefined) {
		return { kind: "before-quoted-spans" };
	}

	switch (evidence.locator.kind) {
		case "lines": {
			return lineSourceView(
				sources.file({ file: evidence.locator.file, source: evidence.source }),
				evidence.quote,
			);
		}
		case "hunk": {
			return diffSourceView(
				evidence.locator,
				evidence.quote,
				sources.diffText(),
			);
		}
		case "commit-subject": {
			return commitSubjectView(
				sources.subjectsForCitation(evidence.locator),
				evidence.locator.index,
				evidence.quote,
			);
		}
		case "exchange": {
			return exchangeSourceView(
				evidence.locator,
				sources.exchangeText(evidence.locator),
			);
		}
		case "harness": {
			return harnessView(
				sources.harnessResult(evidence.locator),
				evidence.locator.recorded,
			);
		}
		case "absent": {
			return { kind: "absent" };
		}
		default: {
			return unhandled(evidence.locator, "evidence locator");
		}
	}
}

function lineSourceView(
	file: CitedFile,
	quote: string | undefined,
): SourceView {
	return textView(
		file.file,
		file.text,
		quote === undefined ? undefined : findSpan(file.text, quote),
	);
}

function diffSourceView(
	locator: Extract<EvidenceLocator, { kind: "hunk" }>,
	quote: string | undefined,
	diff: string,
): SourceView {
	return textView(
		`${locator.file} ${locator.hunk}`,
		diff,
		quote === undefined ? undefined : spanInDiff(quote, diff, locator),
	);
}

function exchangeSourceView(
	locator: Extract<EvidenceLocator, { kind: "exchange" }>,
	text: string,
): SourceView {
	return textView(
		`exchange ${String(locator.exchange + EXCHANGE_NUMBER_BASE)} ${locator.field}`,
		text,
		{ end: locator.end, start: locator.start },
	);
}

export { sourceView as default };
