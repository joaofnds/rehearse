import type { GradedStageRef } from "#benchmark/operator-grade";
import { plural } from "#client/plural";

const DRIFT_CELLS = 7;

export function reviewsLine(reviews: number): string {
	return `${plural(reviews, "review")} recorded`;
}

export function agreementPercent(
	withinOneStep: number,
	reviews: number,
): string {
	return `${Math.round((withinOneStep / reviews) * 100)}%`;
}

export interface AgreementReading {
	readonly glyph: "✓" | "≈" | "✕";
	readonly label: string;
}

export function agreementReading(stepsApart: number): AgreementReading {
	if (stepsApart === 0) {
		return { glyph: "✓", label: "exact" };
	}
	if (stepsApart === 1) {
		return { glyph: "≈", label: "within 1 step" };
	}

	return { glyph: "✕", label: `${stepsApart} steps apart` };
}

export interface DriftReading {
	readonly value: string;
	readonly bar: string;
}

/**
 * Signed to one decimal, positive where the Judge grades more generously, and
 * "agrees" where that rounds to nothing. The bar's fill comes from the
 * unrounded value, one cell for agreement and one more per quarter step.
 */
export function driftReading(steps: number): DriftReading {
	// Math.round takes a half toward +∞, so the magnitude is rounded and the
	// sign put back, keeping a drift and its mirror the same size.
	const tenths = Math.sign(steps) * Math.round(Math.abs(steps) * 10);
	const filled = Math.min(DRIFT_CELLS, 1 + Math.round(4 * Math.abs(steps)));
	const bar = `${"▮".repeat(filled)}${"▯".repeat(DRIFT_CELLS - filled)}`;
	if (tenths === 0) {
		return { value: "agrees", bar };
	}

	const sign = tenths > 0 ? "+" : "−";

	return {
		value: `judge ${sign}${(Math.abs(tenths) / 10).toFixed(1)} steps`,
		bar,
	};
}

export function stepLabel(stage: GradedStageRef, stageName: string): string {
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
export function reviewPath(stage: GradedStageRef): string {
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
