import { join } from "node:path";

import type { ConfirmationRepPaths } from "./confirmation-layout";

const runPathsExpected = {
	artifactFile: join(
		"/control",
		".benchmark-runs",
		"2026-08-31T01-45-19.323Z.json",
	),
	checkpointsDirectory: join(
		"/control",
		".benchmark-runs",
		"2026-08-31T01-45-19.323Z.checkpoints",
	),
	manifestFile: join(
		"/control",
		".benchmark-runs",
		"2026-08-31T01-45-19.323Z.checkpoints",
		"manifest.json",
	),
	name: "2026-08-31T01-45-19.323Z",
	replaysDirectory: join("/control", ".benchmark-runs", "replays"),
	reviewFile: join(
		"/control",
		".benchmark-runs",
		"2026-08-31T01-45-19.323Z.review.json",
	),
	runsDirectory: join("/control", ".benchmark-runs"),
};
const confirmationPathsExpected = {
	directory: join("/control", ".benchmark-runs", "confirmations", "group-1"),
	groupFile: join(
		"/control",
		".benchmark-runs",
		"confirmations",
		"group-1",
		"group.json",
	),
	inputsDirectory: join(
		"/control",
		".benchmark-runs",
		"confirmations",
		"group-1",
		"inputs",
	),
	reportFile: join(
		"/control",
		".benchmark-runs",
		"confirmations",
		"group-1",
		"report.json",
	),
	repsDirectory: join(
		"/control",
		".benchmark-runs",
		"confirmations",
		"group-1",
		"reps",
	),
};
function repPathsExpected(
	repsDirectory: string,
): Pick<
	ConfirmationRepPaths,
	| "attemptFile"
	| "checkpointsDirectory"
	| "directory"
	| "recordFile"
	| "stagesDirectory"
	| "transcriptFile"
> {
	return {
		attemptFile: join(repsDirectory, "group-1-rep-2", "attempt.json"),
		checkpointsDirectory: join(repsDirectory, "group-1-rep-2", "checkpoints"),
		directory: join(repsDirectory, "group-1-rep-2"),
		recordFile: join(repsDirectory, "group-1-rep-2", "rep.json"),
		stagesDirectory: join(repsDirectory, "group-1-rep-2", "stages"),
		transcriptFile: join(repsDirectory, "group-1-rep-2", "transcript.jsonl"),
	};
}
const sessionPathsExpected = {
	corpusDirectory: join(
		"/control",
		".benchmark-runs",
		"sessions",
		"smoke",
		"uuid-1",
		"corpus",
	),
	directory: join("/control", ".benchmark-runs", "sessions", "smoke", "uuid-1"),
	gradesDirectory: join(
		"/control",
		".benchmark-runs",
		"sessions",
		"smoke",
		"uuid-1",
		"grades",
	),
	operatorStopFile: join(
		"/control",
		".benchmark-runs",
		"sessions",
		"smoke",
		"uuid-1",
		"operator-stop.json",
	),
	recordFile: join(
		"/control",
		".benchmark-runs",
		"sessions",
		"smoke",
		"uuid-1",
		"attempt.json",
	),
	transcriptFile: join(
		"/control",
		".benchmark-runs",
		"sessions",
		"smoke",
		"uuid-1",
		"transcript.jsonl",
	),
};
export {
	runPathsExpected,
	confirmationPathsExpected,
	repPathsExpected,
	sessionPathsExpected,
};
