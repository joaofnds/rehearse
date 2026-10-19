import { afterEach, describe, expect, it } from "bun:test";

import { screen } from "@testing-library/react";

import NamedHistoryBuilder from "#client/run-history/run-history-page-named-history-builder";
import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import { SHA256_HEX_CHARACTERS } from "#client/test-support/digest-widths";
import { renderAppWithStub } from "#client/test-support/render-app";
import {
	CORPUS,
	RUN,
	judgedStaleness,
	renderContribution,
	stoppedAtBuild,
	stoppedRow,
} from "#client/test-support/run-detail";

import { originalFetch } from "./run-detail-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("/runs/$run", () => {
	it(
		"shows the last task grade recorded for the same case, with its staleness and why it is not comparable",
		showsTheLastTaskGradeRecordedForTheSameCaseWithItsStalenessAndWhyItIsNotComparable,
	);

	it(
		"reads a last task grade on another corpus as clean when the server judged it so",
		readsALastTaskGradeOnAnotherCorpusAsCleanWhenTheServerJudgedItSo,
	);

	it(
		"says a last task grade on this run's corpus is comparable",
		saysALastTaskGradeOnThisRunSCorpusIsComparable,
	);

	it(
		"says the server did not judge a last task grade's staleness, with its reason",
		saysTheServerDidNotJudgeALastTaskGradeSStalenessWithItsReason,
	);

	it(
		"says when no other run of the case has a task grade",
		saysWhenNoOtherRunOfTheCaseHasATaskGrade,
	);

	it(
		"matches no other run as the same case when neither recorded a case",
		matchesNoOtherRunAsTheSameCaseWhenNeitherRecordedACase,
	);
});

async function showsTheLastTaskGradeRecordedForTheSameCaseWithItsStalenessAndWhyItIsNotComparable(): Promise<void> {
	renderContribution(new Map(), [
		new PipelineRunRowBuilder({
			corpusVersion: {
				digest: "1d2e3f".padEnd(SHA256_HEX_CHARACTERS, "0"),
				kind: "version",
			},
			finalOutcome: { state: "available", status: "JUDGED", verdict: "FAIL" },
			run: "2026-09-20T09-00-00.000Z",
			shortId: "r-0141",
			staleness: judgedStaleness(false),
			status: "COMPLETE",
		}).build(),
		new PipelineRunRowBuilder({
			corpusVersion: {
				digest: "9f30d1".padEnd(SHA256_HEX_CHARACTERS, "0"),
				kind: "version",
			},
			finalOutcome: { state: "available", status: "JUDGED", verdict: "PASS" },
			run: "2026-09-25T09-00-00.000Z",
			shortId: "r-0144",
			staleness: judgedStaleness(true),
			status: "COMPLETE",
		}).build(),
		{
			...new PipelineRunRowBuilder({
				corpusVersion: { digest: CORPUS, kind: "version" },
				finalOutcome: { state: "available", status: "JUDGED", verdict: "PASS" },
				run: "2026-09-26T09-00-00.000Z",
				shortId: "r-0145",
				staleness: judgedStaleness(false),
				status: "COMPLETE",
			}).build(),
			caseId: "other-case",
		},
	]);

	const last = await screen.findByRole("region", {
		name: "Last task grade for this case",
	});

	expect(last).toHaveTextContent("PASS");
	expect(last).toHaveTextContent("r-0144");
	expect(last).toHaveTextContent("stale · corpus@9f30d1");
	expect(last).toHaveTextContent("Not comparable to a corpus@a41c7e result.");
}

async function readsALastTaskGradeOnAnotherCorpusAsCleanWhenTheServerJudgedItSo(): Promise<void> {
	renderContribution(new Map(), [
		new PipelineRunRowBuilder({
			corpusVersion: {
				digest: "9f30d1".padEnd(SHA256_HEX_CHARACTERS, "0"),
				kind: "version",
			},
			finalOutcome: { state: "available", status: "JUDGED", verdict: "PASS" },
			run: "2026-09-30T09-00-00.000Z",
			shortId: "r-0150",
			staleness: judgedStaleness(false),
			status: "COMPLETE",
		}).build(),
	]);

	const last = await screen.findByRole("region", {
		name: "Last task grade for this case",
	});

	expect(last).toHaveTextContent("clean · corpus@9f30d1");
	expect(last).not.toHaveTextContent("stale");
	expect(last).toHaveTextContent("Not comparable to a corpus@a41c7e result.");
}

async function saysALastTaskGradeOnThisRunSCorpusIsComparable(): Promise<void> {
	renderContribution(new Map(), [
		new PipelineRunRowBuilder({
			corpusVersion: { digest: CORPUS, kind: "version" },
			finalOutcome: { state: "available", status: "JUDGED", verdict: "FAIL" },
			run: "2026-09-30T09-00-00.000Z",
			shortId: "r-0150",
			staleness: judgedStaleness(false),
			status: "COMPLETE",
		}).build(),
	]);

	const last = await screen.findByRole("region", {
		name: "Last task grade for this case",
	});

	expect(last).toHaveTextContent("clean · corpus@a41c7e");
	expect(last).toHaveTextContent("same corpus as this run");
	expect(last).not.toHaveTextContent("Not comparable");
}

async function saysTheServerDidNotJudgeALastTaskGradeSStalenessWithItsReason(): Promise<void> {
	renderContribution(new Map(), [
		new PipelineRunRowBuilder({
			corpusVersion: { digest: CORPUS, kind: "version" },
			finalOutcome: { state: "available", status: "JUDGED", verdict: "FAIL" },
			run: "2026-09-30T09-00-00.000Z",
			shortId: "r-0150",
			staleness: {
				reasons: ["the corpus could not be read"],
				state: "unavailable",
			},
			status: "COMPLETE",
		}).build(),
	]);

	const last = await screen.findByRole("region", {
		name: "Last task grade for this case",
	});

	expect(last).toHaveTextContent(
		"corpus@a41c7e · staleness not judged: the corpus could not be read",
	);
	expect(last).not.toHaveTextContent("stale ·");
}

async function saysWhenNoOtherRunOfTheCaseHasATaskGrade(): Promise<void> {
	renderContribution();

	const last = await screen.findByRole("region", {
		name: "Last task grade for this case",
	});

	expect(last).toHaveTextContent(
		"No other run of this case has a task grade yet.",
	);
}

async function matchesNoOtherRunAsTheSameCaseWhenNeitherRecordedACase(): Promise<void> {
	const earlier = new PipelineRunRowBuilder({
		corpusVersion: { digest: CORPUS, kind: "version" },
		finalOutcome: {
			state: "available",
			status: "JUDGED",
			verdict: "PASS",
		},
		run: "2026-09-30T09-00-00.000Z",
		shortId: "r-0150",
		staleness: judgedStaleness(false),
		status: "COMPLETE",
	}).build();

	const fetchReplies = new Map<string, unknown>([
		[
			"/api/runs",
			new NamedHistoryBuilder({
				rows: [
					{ ...stoppedRow(), caseId: undefined },
					{
						...earlier,
						caseId: undefined,
					},
				],
			}).build(),
		],
		[`/api/runs/${RUN}`, stoppedAtBuild()],
	]);
	renderAppWithStub(`/runs/${RUN}?layout=trace`, fetchReplies);

	const last = await screen.findByRole("region", {
		name: "Last task grade for this case",
	});

	expect(last).toHaveTextContent(
		"No other run of this case has a task grade yet.",
	);
}
