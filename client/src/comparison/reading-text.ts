import type { ComparisonArm } from "#benchmark/comparison-record";
import type { QualityVerdict } from "#server/comparison-quality-reading";
import type { MeterReading } from "#server/comparison-what-moved";
import { armProse } from "./design-arms";

/** A served verdict as the glyph and phrase every comparison reading prints. */
export interface ReadingText {
	readonly glyph: string;
	readonly phrase: string;
}

function separatesGlyph(arm: ComparisonArm): string {
	return arm === "candidate" ? "↑" : "↓";
}

function ranHigherGlyph(arm: ComparisonArm): string {
	return arm === "candidate" ? "↓" : "↑";
}

export function qualityReadingText(verdict: QualityVerdict): ReadingText {
	switch (verdict.kind) {
		case "insideRerunNoise": {
			return { glyph: "~", phrase: "inside rerun noise" };
		}
		case "unchangedAlreadyClear": {
			return { glyph: "=", phrase: "unchanged, already clear" };
		}
		case "separated": {
			return {
				glyph: separatesGlyph(verdict.arm),
				phrase: `${armProse(verdict.arm)} separates`,
			};
		}
		case "unavailable": {
			return { glyph: "?", phrase: "unavailable" };
		}
		default: {
			return verdict satisfies never;
		}
	}
}

export function meterReadingText(
	verdict: MeterReading["verdict"],
): ReadingText {
	switch (verdict.kind) {
		case "insideRerunNoise": {
			return { glyph: "~", phrase: "inside rerun noise" };
		}
		case "higher": {
			return {
				glyph: ranHigherGlyph(verdict.arm),
				phrase: `${armProse(verdict.arm)} ran higher`,
			};
		}
		case "unavailable": {
			return { glyph: "?", phrase: "unavailable" };
		}
		default: {
			return verdict satisfies never;
		}
	}
}
