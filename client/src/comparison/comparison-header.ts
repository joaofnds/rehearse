import type { ComparisonArm } from "#benchmark/comparison-record";
import { plural } from "#client/plural";
import type { ComparisonResponse } from "./comparison-response";

type HeaderFacts = Pick<
	ComparisonResponse,
	"report" | "checkpoint" | "armFigures"
>;

const ARMS = [
	"baseline",
	"candidate",
	"control",
] as const satisfies readonly ComparisonArm[];

export function comparisonTitle(facts: HeaderFacts): string {
	if (facts.checkpoint.state === "available") {
		return `Comparison · ${facts.checkpoint.stage} replay from run ${facts.checkpoint.run}`;
	}

	const cases = facts.report.cases.map(({ caseId }) => caseId).join(", ");

	return `Comparison · ${facts.report.mode} · ${cases}`;
}

function attemptsPerArm(report: HeaderFacts["report"]): string {
	const counts = report.cases.flatMap(({ arms }) =>
		ARMS.map((arm) => arms[arm].source.reps.length),
	);
	const fewest = Math.min(...counts);
	const most = Math.max(...counts);

	return fewest === most
		? `${plural(fewest, "attempt")} per arm`
		: `${String(fewest)} to ${String(most)} attempts per arm`;
}

function sharedInputs(facts: HeaderFacts): string {
	if (facts.checkpoint.state === "available") {
		return "same checkpoint, same case";
	}

	return facts.report.cases.length === 1 ? "same case" : "same cases";
}

function dollars(usd: number): string {
	return `$${usd.toFixed(2)}`;
}

function recordedCost(armFigures: HeaderFacts["armFigures"]): string {
	const costs = Object.values(armFigures).flatMap((figures) =>
		ARMS.map((arm) => figures[arm].cost),
	);
	let total = 0;
	let unrecorded = 0;
	for (const cost of costs) {
		if (cost.state === "available") {
			total += cost.totalUsd;
		} else {
			unrecorded += 1;
		}
	}

	return unrecorded === 0
		? `${dollars(total)} total`
		: `${dollars(total)} recorded · cost not recorded for ${plural(unrecorded, "arm")}`;
}

/** Names no seed and no pairing, since nothing records either. */
export function comparisonSubline(facts: HeaderFacts): string {
	return [
		attemptsPerArm(facts.report),
		sharedInputs(facts),
		recordedCost(facts.armFigures),
	].join(" · ");
}
