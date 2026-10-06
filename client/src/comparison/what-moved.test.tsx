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
		control: { state: "available", median: "B", lowest: "B", highest: "B" },
		baseline: { state: "available", median: "A", lowest: "A", highest: "A" },
		candidate: { state: "available", median: "B", lowest: "B", highest: "B" },
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
	it("draws one row per measure with a column per arm, the spread and the reading", () => {
		renderWhatMoved([OVERALL]);

		const columns = within(table())
			.getAllByRole("columnheader")
			.map((header) => header.textContent);

		expect(columns).toEqual([
			"Measure",
			"Baseline",
			"Arm A",
			"Arm B",
			"Spread across 2 attempts",
			"Reading",
		]);
		expect(cell("build", "Measure")).toHaveTextContent("buildoverall");
		expect(cell("build", "Baseline")).toHaveTextContent("C");
		expect(cell("build", "Arm A")).toHaveTextContent("C");
		expect(cell("build", "Arm B")).toHaveTextContent("B");
	});

	it("reads arm B against arm A as a glyph and the served verdict's phrase", () => {
		renderWhatMoved([OVERALL, DIMENSION]);

		expect(cell("build", "Reading")).toHaveTextContent("~inside rerun noise");
		expect(cell("observability", "Reading")).toHaveTextContent(
			"↓arm A separates",
		);
	});

	it("draws the spread of arms A and B on the measure's scale with a note naming each range", () => {
		renderWhatMoved([OVERALL]);

		expect(cell("build", "Spread across 2 attempts")).toHaveTextContent(
			"├─┼─┤arm A C to B · arm B B to A",
		);
	});

	it("counts a hard blocker's firings per arm rather than grading them", () => {
		renderWhatMoved([BLOCKER]);

		expect(cell("scope-declared", "Measure")).toHaveTextContent(
			"scope-declaredhard blocker",
		);
		expect(cell("scope-declared", "Baseline")).toHaveTextContent("2/2 fired");
		expect(cell("scope-declared", "Arm A")).toHaveTextContent("1/2 fired");
		expect(cell("scope-declared", "Arm B")).toHaveTextContent("0/2 fired");
	});

	it("states each arm's mean on a meter and arm B's change against arm A", () => {
		renderWhatMoved([REPLY_LENGTH, COST]);

		expect(cell("reply length", "Measure")).toHaveTextContent(
			"reply lengthmeter",
		);
		expect(cell("reply length", "Arm A")).toHaveTextContent("524 words");
		expect(cell("reply length", "Spread across 2 attempts")).toHaveTextContent(
			"arm A 510 to 537 words · arm B 396 to 468 words · -17%",
		);
		expect(cell("cost per attempt", "Arm B")).toHaveTextContent("$2.40");
		expect(cell("cost per attempt", "Reading")).toHaveTextContent(
			"↑arm B ran higher",
		);
	});

	it("names the spread across attempts without a count when the arms hold different numbers", () => {
		renderWhatMoved([OVERALL], { control: 2, baseline: 3, candidate: 2 });

		expect(
			within(table()).getByRole("columnheader", {
				name: "Spread across attempts",
			}),
		).toBeInTheDocument();
	});

	describe("when an arm recorded nothing to measure", () => {
		it("reads the row unavailable, never inside rerun noise, and says why", () => {
			renderWhatMoved([UNRECORDED_LENGTH]);

			expect(cell("reply length", "Reading")).toHaveTextContent("?unavailable");
			expect(cell("reply length", "Reading")).not.toHaveTextContent(
				"inside rerun noise",
			);
			expect(cell("reply length", "Arm A")).toHaveTextContent("not recorded");
			expect(
				cell("reply length", "Spread across 2 attempts"),
			).toHaveTextContent(UNRECORDED);
		});
	});
});
