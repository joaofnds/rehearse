import { cva } from "class-variance-authority";

/**
 * A pane row the reader picks, marked by the selected tint and a 2px accent
 * edge. Sources toggle as pressed buttons and events and requests are
 * listbox options, so each names the attribute that marks it.
 */
export const selectableRow = cva(
	"min-h-14 w-full border-b border-l-2 border-b-subtle border-l-transparent px-3 py-2.5 text-left text-secondary-foreground hover:bg-row-hover",
	{
		variants: {
			markedBy: {
				pressed:
					"aria-pressed:border-l-primary aria-pressed:bg-selected aria-pressed:text-bright",
				selected:
					"aria-selected:border-l-primary aria-selected:bg-selected aria-selected:text-bright",
			},
		},
	},
);
