import { describe, expect, it } from "bun:test";
import { render, screen, within } from "@testing-library/react";
import type { WhatMovedRow } from "#server/comparison-what-moved";
import { WhatMoved } from "./what-moved";

const OVERALL: WhatMovedRow = {
	kind: "overall",
	name: "build",
	arms: {
		control: {
			scale: "letters",
			grades: {
				state: "available",
				median: "C",
				lowest: "C",
				highest: "C",
				graded: 2,
			},
		},
		baseline: {
			scale: "letters",
			grades: {
				state: "available",
				median: "C",
				lowest: "C",
				highest: "B",
				graded: 2,
			},
		},
		candidate: {
			scale: "letters",
			grades: {
				state: "available",
				median: "B",
				lowest: "B",
				highest: "A",
				graded: 2,
			},
		},
	},
	readings: {
		candidateMinusBaseline: {
			interval: {
				minuend: { low: "B", high: "A" },
				subtrahend: { low: "C", high: "B" },
			},
			verdict: { kind: "insideRerunNoise" },
		},
	},
};

const BLOCKER: WhatMovedRow = {
	kind: "hardBlocker",
	name: "scope-declared",
	stage: "build",
	arms: {
		control: { state: "available", fired: 2, of: 2 },
		baseline: { state: "available", fired: 1, of: 2 },
		candidate: { state: "available", fired: 0, of: 2 },
	},
	readings: {
		candidateMinusBaseline: {
			interval: {
				minuend: { low: "0%", high: "66%" },
				subtrahend: { low: "9%", high: "91%" },
			},
			verdict: { kind: "insideRerunNoise" },
		},
	},
};

const DIMENSION: WhatMovedRow = {
	kind: "dimension",
	name: "observability",
	stage: "build",
	arms: {
		control: {
			state: "available",
			median: "B",
			lowest: "B",
			highest: "B",
			graded: 2,
		},
		baseline: {
			state: "available",
			median: "A",
			lowest: "A",
			highest: "A",
			graded: 2,
		},
		candidate: {
			state: "available",
			median: "B",
			lowest: "B",
			highest: "B",
			graded: 2,
		},
	},
	readings: {
		candidateMinusBaseline: {
			interval: {
				minuend: { low: "B", high: "B" },
				subtrahend: { low: "A", high: "A" },
			},
			verdict: { kind: "separated", arm: "baseline" },
		},
	},
};

const REPLY_LENGTH: WhatMovedRow = {
	kind: "meter",
	name: "replyLength",
	arms: {
		control: { state: "available", mean: 292, low: 259, high: 325, counted: 2 },
		baseline: {
			state: "available",
			mean: 523.5,
			low: 510,
			high: 537,
			counted: 2,
		},
		candidate: {
			state: "available",
			mean: 432,
			low: 396,
			high: 468,
			counted: 2,
		},
	},
	readings: {
		candidateMinusBaseline: {
			interval: {
				minuend: { low: 396, high: 468 },
				subtrahend: { low: 510, high: 537 },
			},
			change: "-17%",
			verdict: { kind: "insideRerunNoise" },
		},
	},
};

const UNRECORDED = "this report records no word count for its attempts";

const UNRECORDED_LENGTH: WhatMovedRow = {
	kind: "meter",
	name: "replyLength",
	arms: {
		control: { state: "unavailable", reasons: [UNRECORDED] },
		baseline: { state: "unavailable", reasons: [UNRECORDED] },
		candidate: { state: "unavailable", reasons: [UNRECORDED] },
	},
	readings: {
		candidateMinusBaseline: {
			interval: { minuend: undefined, subtrahend: undefined },
			change: undefined,
			verdict: { kind: "unavailable", reasons: [UNRECORDED] },
		},
	},
};

const COST: WhatMovedRow = {
	kind: "meter",
	name: "costPerAttempt",
	arms: {
		control: {
			state: "available",
			mean: 0.738,
			low: 0.72,
			high: 0.75,
			counted: 2,
		},
		baseline: {
			state: "available",
			mean: 1.999,
			low: 1.91,
			high: 2.08,
			counted: 2,
		},
		candidate: {
			state: "available",
			mean: 2.4,
			low: 2.3,
			high: 2.5,
			counted: 2,
		},
	},
	readings: {
		candidateMinusBaseline: {
			interval: {
				minuend: { low: 2.3, high: 2.5 },
				subtrahend: { low: 1.91, high: 2.08 },
			},
			change: "+20%",
			verdict: { kind: "higher", arm: "candidate" },
		},
	},
};

const TWO_EACH = { control: 2, baseline: 2, candidate: 2 } as const;

function renderWhatMoved(
	rows: readonly WhatMovedRow[],
	attemptsPerArm: Readonly<
		Record<"control" | "baseline" | "candidate", number>
	> = TWO_EACH,
): void {
	render(
		<WhatMoved
			caseId="audit-log"
			rows={rows}
			attemptsPerArm={attemptsPerArm}
		/>,
	);
}

function table(): HTMLElement {
	return screen.getByRole("table", { name: "What moved · audit-log" });
}

function cell(measure: string, column: string): HTMLElement {
	const columns = within(table())
		.getAllByRole("columnheader")
		.map((header) => header.textContent);
	const row = within(table()).getByRole("rowheader", {
		name: new RegExp(`^${measure}`, "u"),
	}).parentElement;
	if (row === null) {
		throw new Error(`Missing row ${measure}`);
	}
	const found = row.children[columns.indexOf(column)];
	if (!(found instanceof HTMLElement)) {
		throw new Error(`Missing ${column} cell in ${measure}`);
	}

	return found;
}

describe(WhatMoved.name, () => {
	it("shows every arm's measure and an explicitly scoped candidate versus baseline reading", () => {
		renderWhatMoved([OVERALL, DIMENSION]);

		expect(
			within(table())
				.getAllByRole("columnheader")
				.map((header) => header.textContent),
		).toEqual([
			"Measure",
			"Control",
			"Baseline (before)",
			"Candidate (after)",
			"Range and uncertainty",
			"Candidate vs baseline",
		]);
		expect(cell("build", "Control")).toHaveTextContent("C · n=2");
		expect(cell("build", "Baseline (before)")).toHaveTextContent("C · n=2");
		expect(cell("build", "Candidate (after)")).toHaveTextContent("B · n=2");
		expect(cell("build", "Candidate vs baseline")).toHaveTextContent(
			"inside rerun noise",
		);
		expect(cell("observability", "Candidate vs baseline")).toHaveTextContent(
			"baseline (before) separates",
		);
		expect(cell("observability", "Baseline (before)")).toHaveTextContent(
			"A · n=2",
		);
	});

	it("labels the aligned grade plot as an observed range with median points and keeps control visible", () => {
		renderWhatMoved([OVERALL]);

		const plot = within(cell("build", "Range and uncertainty")).getByRole(
			"figure",
			{ name: "build · Median and observed grade range" },
		);
		expect(plot).toHaveTextContent("Control");
		expect(plot).toHaveTextContent("C to C · C median");
		expect(plot).toHaveTextContent("C to B · C median");
		expect(plot).toHaveTextContent("B to A · B median");
		expect(plot).not.toHaveTextContent("confidence");
	});

	it("keeps firing counts distinct from letter grades and labels their confidence interval", () => {
		renderWhatMoved([BLOCKER]);

		expect(cell("scope-declared", "Control")).toHaveTextContent("2/2 fired");
		expect(cell("scope-declared", "Baseline (before)")).toHaveTextContent(
			"1/2 fired",
		);
		expect(cell("scope-declared", "Candidate (after)")).toHaveTextContent(
			"0/2 fired",
		);
		const range = cell("scope-declared", "Range and uncertainty");
		expect(range).toHaveTextContent("Firing rate · 95% confidence interval");
		expect(range).toHaveTextContent("0% to 66% · 0% observed rate");
		expect(range).toHaveTextContent("Control: range not recorded");
	});

	it("shows cost and reply-length means beside all three observed ranges, units and coverage", () => {
		renderWhatMoved([REPLY_LENGTH, COST]);

		expect(cell("Reply length", "Baseline (before)")).toHaveTextContent(
			"524 words · n=2",
		);
		const words = cell("Reply length", "Range and uncertainty");
		expect(words).toHaveTextContent("259 words to 325 words · 292 words mean");
		expect(words).toHaveTextContent("510 words to 537 words · 524 words mean");
		expect(words).toHaveTextContent("396 words to 468 words · 432 words mean");
		expect(words).toHaveTextContent(
			"Mean and observed range · candidate mean -17% vs baseline",
		);
		expect(words).not.toHaveTextContent("confidence");
		expect(cell("Cost per attempt", "Candidate (after)")).toHaveTextContent(
			"$2.40 · n=2",
		);
		expect(cell("Cost per attempt", "Range and uncertainty")).toHaveTextContent(
			"$2.30 to $2.50 · $2.40 mean",
		);
	});

	it("names candidate as the arm that ran higher when its cost exceeds baseline", () => {
		renderWhatMoved([COST]);

		expect(cell("Cost per attempt", "Baseline (before)")).toHaveTextContent(
			"$2.00 · n=2",
		);
		expect(cell("Cost per attempt", "Candidate (after)")).toHaveTextContent(
			"$2.40 · n=2",
		);
		expect(cell("Cost per attempt", "Candidate vs baseline")).toHaveTextContent(
			"candidate (after) ran higher",
		);
	});

	it("preserves each arm's saved attempt denominator when they differ", () => {
		renderWhatMoved([OVERALL], { control: 2, baseline: 3, candidate: 2 });

		expect(screen.getByText(/Saved attempts:/u)).toHaveTextContent(
			"Control 2 · Baseline (before) 3 · Candidate (after) 2",
		);
	});

	it("keeps a missing measure unavailable with its reason and draws no range", () => {
		renderWhatMoved([UNRECORDED_LENGTH]);

		expect(cell("Reply length", "Candidate vs baseline")).toHaveTextContent(
			"unavailable",
		);
		expect(cell("Reply length", "Baseline (before)")).toHaveTextContent(
			"Not recorded",
		);
		expect(cell("Reply length", "Range and uncertainty")).toHaveTextContent(
			UNRECORDED,
		);
		expect(
			within(cell("Reply length", "Range and uncertainty")).queryByRole(
				"figure",
			),
		).not.toBeInTheDocument();
	});
});
