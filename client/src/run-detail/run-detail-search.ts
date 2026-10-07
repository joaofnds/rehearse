import { z } from "zod";

/** Run detail's layouts (SPEC.md 4), in the switcher's order, by their URL names. */
export const RUN_DETAIL_LAYOUTS = ["rail", "ledger", "trace"] as const;

export type RunDetailLayout = (typeof RUN_DETAIL_LAYOUTS)[number];

export const LAYOUT_LABELS = {
	rail: "Step rail",
	ledger: "Record ledger",
	trace: "Contribution",
} as const satisfies Record<RunDetailLayout, string>;

/** Each layout's one-line rationale, which the restore banner carries. */
export const LAYOUT_NOTES = {
	rail: "Layout A · one step at a time, attempts alongside",
	ledger: "Layout B · the whole record top to bottom",
	trace: "Layout C · task grade first, then the root-cause pass",
} as const satisfies Record<RunDetailLayout, string>;

const unknownAsAbsent = z.unknown().transform(() => undefined);

/**
 * The layout and selected stage live in the URL, so a reload restores both and
 * another view can open a stage's report. A value the page does not know reads
 * as absent, and the page falls back to its defaults.
 */
export const runDetailSearchSchema = z.object({
	layout: z.union([z.enum(RUN_DETAIL_LAYOUTS), unknownAsAbsent]).optional(),
	step: z.union([z.string(), unknownAsAbsent]).optional(),
});

export type RunDetailSearch = z.output<typeof runDetailSearchSchema>;
