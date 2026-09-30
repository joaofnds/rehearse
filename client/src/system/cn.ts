import { createCn } from "cn/config";

/** The design's type scale (SPEC.md:404) as `theme.css` names its steps. */
export const TYPE_STEPS = [
	"30",
	"26",
	"24",
	"22",
	"20",
	"19",
	"17",
	"16",
	"15",
	"14",
	"13",
	"12-5",
	"12",
	"11-5",
	"11",
	"10-5",
	"10",
	"9",
] as const;

export const RADIUS_STEPS = ["tight"] as const;

export const TRACKING_STEPS = ["label", "caps", "figure"] as const;

/**
 * Class merging that knows the theme's own steps. Without them a type step
 * such as `text-11-5` reads as a text colour and drops the colour beside it.
 */
export const cn = createCn({
	extend: {
		theme: {
			text: [...TYPE_STEPS],
			radius: [...RADIUS_STEPS],
			tracking: [...TRACKING_STEPS],
		},
	},
});
