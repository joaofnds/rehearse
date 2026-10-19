import type { GradedStageRef } from "#benchmark/operator-grade";
import plural from "#client/plural";

const NO_GRADE_DRIFT_TENTHS = 0;

const PERCENT_SCALE = 100;

const EXACT_AGREEMENT_STEPS = 0;

const AGREEMENT_TOLERANCE_STEPS = 1;

const TENTHS_PER_STEP = 10;

const AGREEMENT_CELLS = 1;

const CELLS_PER_STEP = 4;

const DRIFT_DECIMAL_PLACES = 1;

const DRIFT_CELLS = 7;

function reviewsLine(reviews: number): string {
	return `${plural(reviews, "review")} recorded`;
}

function agreementPercent(withinOneStep: number, reviews: number): string {
	return `${Math.round((withinOneStep / reviews) * PERCENT_SCALE)}%`;
}

interface AgreementReading {
	readonly glyph: "✓" | "≈" | "✕";
	readonly label: string;
}

function agreementReading(stepsApart: number): AgreementReading {
	if (stepsApart === EXACT_AGREEMENT_STEPS) {
		return { glyph: "✓", label: "exact" };
	}
	if (stepsApart === AGREEMENT_TOLERANCE_STEPS) {
		return { glyph: "≈", label: "within 1 step" };
	}

	return { glyph: "✕", label: `${stepsApart} steps apart` };
}

interface DriftReading {
	readonly value: string;
	readonly bar: string;
}

/**
 * Signed to one decimal, positive where the Judge grades more generously, and
 * "agrees" where that rounds to nothing. The bar's fill comes from the
 * unrounded value, one cell for agreement and one more per quarter step.
 */
function driftReading(steps: number): DriftReading {
	// Math.round takes a half toward +∞, so the magnitude is rounded and the
	// sign put back, keeping a drift and its mirror the same size.
	const tenths =
		Math.sign(steps) * Math.round(Math.abs(steps) * TENTHS_PER_STEP);
	const filled = Math.min(
		DRIFT_CELLS,
		AGREEMENT_CELLS + Math.round(CELLS_PER_STEP * Math.abs(steps)),
	);
	const bar = `${"▮".repeat(filled)}${"▯".repeat(DRIFT_CELLS - filled)}`;
	if (tenths === NO_GRADE_DRIFT_TENTHS) {
		return { bar, value: "agrees" };
	}

	const sign = tenths > NO_GRADE_DRIFT_TENTHS ? "+" : "−";

	return {
		bar,
		value: `judge ${sign}${(Math.abs(tenths) / TENTHS_PER_STEP).toFixed(DRIFT_DECIMAL_PLACES)} steps`,
	};
}

function stepLabel(stage: GradedStageRef, stageName: string): string {
	switch (stage.kind) {
		case "run": {
			return `${stage.run} · ${stageName}`;
		}
		case "rep": {
			return `${stage.groupId}/${stage.repId} · ${stageName}`;
		}
		case "replay": {
			return `${stage.lineage} replay · ${stageName}`;
		}
		default: {
			return stage satisfies never;
		}
	}
}

/** Where the review of one graded stage opens, one route family per kind as the server names them. */
function reviewPath(stage: GradedStageRef): string {
	switch (stage.kind) {
		case "run": {
			return `/calibration/runs/${encodeURIComponent(stage.run)}/stages/${encodeURIComponent(stage.stage)}`;
		}
		case "rep": {
			return `/calibration/groups/${encodeURIComponent(stage.groupId)}/reps/${encodeURIComponent(stage.repId)}/stages/${encodeURIComponent(stage.stage)}`;
		}
		case "replay": {
			return `/calibration/replays/${encodeURIComponent(stage.lineage)}/${encodeURIComponent(stage.timestamp)}`;
		}
		default: {
			return stage satisfies never;
		}
	}
}

export {
	agreementPercent,
	agreementReading,
	driftReading,
	reviewPath,
	reviewsLine,
	stepLabel,
};
export type { AgreementReading, DriftReading };
