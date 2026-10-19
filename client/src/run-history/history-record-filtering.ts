import { isStopped, stoppedStageOf } from "#benchmark/stopped-status";

import isClean from "./clean-record";
import { matchesText, recordSearchTexts } from "./history-record-search";
import type { Launch, Row, RunDiscoverySearch } from "./run-discovery";

const EMPTY_COLLECTION_LENGTH = 0;

const LAUNCH_ID_PREVIEW_CHARACTERS = 8;

const PREFIX_START_INDEX = 0;

const NO_QUALITY_FAILURES = 0;

const NO_REQUESTED_REPS = 0;

function stoppedBelowMinimum(
	row: Extract<Row, { readonly kind: "run" }>,
): boolean {
	if (
		!isStopped(row.status) ||
		row.minimumGrade.state !== "available" ||
		row.stageGrades.state !== "available"
	) {
		return false;
	}
	const stoppedStage = stoppedStageOf(row.status);
	const stopped = row.stageGrades.grades.find(
		({ stage }) => stage === stoppedStage,
	);
	return stopped?.grade.state === "available" && !stopped.grade.reachesMinimum;
}

function failed(row: Row): boolean {
	switch (row.kind) {
		case "run": {
			return (
				stoppedBelowMinimum(row) ||
				(row.finalOutcome.state === "available" &&
					row.finalOutcome.status === "JUDGED" &&
					row.finalOutcome.verdict === "FAIL")
			);
		}
		case "session-attempt": {
			return row.status === "UNSUCCESSFUL";
		}
		case "replay": {
			return row.status === "STOP";
		}
		case "group": {
			return row.qualityFailures > NO_QUALITY_FAILURES;
		}
		default: {
			return row satisfies never;
		}
	}
}

function passed(row: Row): boolean {
	switch (row.kind) {
		case "run": {
			return (
				row.finalOutcome.state === "available" &&
				row.finalOutcome.status === "JUDGED" &&
				row.finalOutcome.verdict === "PASS"
			);
		}
		case "session-attempt": {
			return row.status === "SUCCESSFUL";
		}
		case "replay": {
			return row.status === "CONTINUE";
		}
		case "group": {
			return (
				row.reps > NO_REQUESTED_REPS &&
				row.successful === row.reps &&
				row.unreadReps.length === EMPTY_COLLECTION_LENGTH
			);
		}
		default: {
			return row satisfies never;
		}
	}
}

function matchesStatus(
	row: Row,
	status: NonNullable<RunDiscoverySearch["status"]>,
	running: boolean,
): boolean {
	switch (status) {
		case "all": {
			return true;
		}
		case "running": {
			return running;
		}
		case "ended": {
			return !running;
		}
		case "failed": {
			return failed(row);
		}
		case "passed": {
			return passed(row);
		}
		case "stopped": {
			return row.kind === "run" && isStopped(row.status);
		}
		default: {
			return status satisfies never;
		}
	}
}

function matchesDiscovery(row: Row, search: RunDiscoverySearch): boolean {
	const running =
		row.kind === "run" &&
		(row.progress.state === "running" || row.status === "RUNNING");
	const status = search.status ?? "all";
	const statusMatches = matchesStatus(row, status, running);
	const corpus = search.corpus ?? "all";
	const corpusMatches =
		corpus === "all" ||
		(row.staleness.state === "available" &&
			(corpus === "current" ? isClean(row.staleness) : row.staleness.stale));
	return (
		statusMatches &&
		corpusMatches &&
		(search.kind === undefined ||
			search.kind === "all" ||
			row.kind === search.kind) &&
		matchesText(recordSearchTexts(row), search.query)
	);
}

function launchMatchesDiscovery(
	launch: Launch,
	search: RunDiscoverySearch,
): boolean {
	const status = search.status ?? "all";
	return (
		(search.kind === undefined || search.kind === "all") &&
		(search.corpus === undefined || search.corpus === "all") &&
		(status === "all" ||
			(status === "running" && launch.status === "RUNNING") ||
			(status === "ended" && launch.status !== "RUNNING")) &&
		matchesText(
			[
				launch.id,
				`launch ${launch.id.slice(PREFIX_START_INDEX, LAUNCH_ID_PREVIEW_CHARACTERS)}`,
				launch.caseId ?? "",
				launch.run ?? "",
				launch.stage ?? "",
			],
			search.query,
		)
	);
}

export { failed, launchMatchesDiscovery, matchesDiscovery, passed };
