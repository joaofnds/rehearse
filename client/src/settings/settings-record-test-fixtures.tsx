import type { CorpusResponse } from "#client/corpus/corpus-query";
import type { SettingsReading } from "#client/launch/settings-query";
import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import type { RunListingResponse } from "#client/run-history/run-history-query";

const ORDINAL_BASE = 1;

const LIVE_ROOT = "/home/operator/.claude";

const LIVE_SETTINGS: SettingsReading = {
	linkCommand: "rehearse settings --link-corpus <directory>",
	linkedCorpus: { kind: "live", root: LIVE_ROOT },
	liveCorpusRoot: LIVE_ROOT,
	overrun:
		"A call already in flight when the ceiling is reached still lands, so a run can overrun it.",
	recordsDirectory: "/home/operator/.rehearse/runs",
	setCommand: "rehearse settings --spend-ceiling-usd <USD>",
	spendCeilingUsd: null,
};

function twoRuns(): RunListingResponse {
	return new NamedHistoryBuilder({
		launches: [],
		rows: Array.from({ length: 2 }, (_unused, index) =>
			new PipelineRunRowBuilder({
				run: `2026-10-0${String(index + ORDINAL_BASE)}T10-00-00.000Z`,
			})
				.withExecutionProgress()
				.build(),
		),
		unreadable: [],
	}).build();
}

function corpus(digest: string | undefined): CorpusResponse {
	return {
		digest,
		files: [],
		lastEdit: {
			kind: "not-recorded",
			reason:
				"the corpus under test has no earlier version in its log to compare against",
		},
		refusals: [],
		root: LIVE_ROOT,
	};
}

export { corpus, twoRuns, LIVE_ROOT, LIVE_SETTINGS };
