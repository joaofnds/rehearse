import { z } from "zod";

/** Older links keep their selected evidence when opened in Results. */
const RUN_DETAIL_LAYOUTS = ["rail", "ledger", "trace"] as const;

const unknownAsAbsent = z.unknown().transform((): undefined => undefined);

/**
 * The view and selected step live in the URL, so a reload restores both and
 * another view can open a stage's report. A value the page does not know reads
 * as absent, and the page falls back to its defaults.
 */
const RUN_WORKSPACE_VIEWS = ["results", "activity", "context"] as const;

type RunWorkspaceView = (typeof RUN_WORKSPACE_VIEWS)[number];

const VIEW_LABELS = {
	activity: "Activity",
	context: "Context & cost",
	results: "Results",
} as const;

const runDetailSearchSchema = z.object({
	event: z.union([z.string(), unknownAsAbsent]).optional(),
	focus: z.union([z.enum(["events"]), unknownAsAbsent]).optional(),
	layout: z.union([z.enum(RUN_DETAIL_LAYOUTS), unknownAsAbsent]).optional(),
	step: z.union([z.string(), unknownAsAbsent]).optional(),
	view: z.union([z.enum(RUN_WORKSPACE_VIEWS), unknownAsAbsent]).optional(),
});

type RunDetailSearch = z.output<typeof runDetailSearchSchema>;

export {
	RUN_DETAIL_LAYOUTS,
	RUN_WORKSPACE_VIEWS,
	runDetailSearchSchema,
	unknownAsAbsent,
	VIEW_LABELS,
};
export type { RunDetailSearch, RunWorkspaceView };
