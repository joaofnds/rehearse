import { z } from "zod";

/** Older links keep their selected evidence when opened in Results. */
export const RUN_DETAIL_LAYOUTS = ["rail", "ledger", "trace"] as const;

export const unknownAsAbsent = z.unknown().transform(() => undefined);

/**
 * The view and selected step live in the URL, so a reload restores both and
 * another view can open a stage's report. A value the page does not know reads
 * as absent, and the page falls back to its defaults.
 */
export const RUN_WORKSPACE_VIEWS = ["results", "activity", "context"] as const;
export type RunWorkspaceView = (typeof RUN_WORKSPACE_VIEWS)[number];
export const VIEW_LABELS = {
	results: "Results",
	activity: "Activity",
	context: "Context & cost",
} as const;

export const runDetailSearchSchema = z.object({
	view: z.union([z.enum(RUN_WORKSPACE_VIEWS), unknownAsAbsent]).optional(),
	layout: z.union([z.enum(RUN_DETAIL_LAYOUTS), unknownAsAbsent]).optional(),
	step: z.union([z.string(), unknownAsAbsent]).optional(),
	focus: z.union([z.enum(["events"]), unknownAsAbsent]).optional(),
	event: z.union([z.string(), unknownAsAbsent]).optional(),
});

export type RunDetailSearch = z.output<typeof runDetailSearchSchema>;
