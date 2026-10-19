import { render, screen, within } from "@testing-library/react";

import type { WhatMovedRow } from "#server/comparison-what-moved";

import WhatMoved from "./what-moved";

const OVERALL: WhatMovedRow = {
	arms: {
		baseline: {
			grades: {
				graded: 2,
				highest: "B",
				lowest: "C",
				median: "C",
				state: "available",
			},
			scale: "letters",
		},
		candidate: {
			grades: {
				graded: 2,
				highest: "A",
				lowest: "B",
				median: "B",
				state: "available",
			},
			scale: "letters",
		},
		control: {
			grades: {
				graded: 2,
				highest: "C",
				lowest: "C",
				median: "C",
				state: "available",
			},
			scale: "letters",
		},
	},
	kind: "overall",
	name: "build",
	readings: {
		candidateMinusBaseline: {
			interval: {
				minuend: { high: "A", low: "B" },
				subtrahend: { high: "B", low: "C" },
			},
			verdict: { kind: "insideRerunNoise" },
		},
	},
};

const BLOCKER: WhatMovedRow = {
	arms: {
		baseline: { fired: 1, of: 2, state: "available" },
		candidate: { fired: 0, of: 2, state: "available" },
		control: { fired: 2, of: 2, state: "available" },
	},
	kind: "hardBlocker",
	name: "scope-declared",
	readings: {
		candidateMinusBaseline: {
			interval: {
				minuend: { high: "66%", low: "0%" },
				subtrahend: { high: "91%", low: "9%" },
			},
			verdict: { kind: "insideRerunNoise" },
		},
	},
	stage: "build",
};

const DIMENSION: WhatMovedRow = {
	arms: {
		baseline: {
			graded: 2,
			highest: "A",
			lowest: "A",
			median: "A",
			state: "available",
		},
		candidate: {
			graded: 2,
			highest: "B",
			lowest: "B",
			median: "B",
			state: "available",
		},
		control: {
			graded: 2,
			highest: "B",
			lowest: "B",
			median: "B",
			state: "available",
		},
	},
	kind: "dimension",
	name: "observability",
	readings: {
		candidateMinusBaseline: {
			interval: {
				minuend: { high: "B", low: "B" },
				subtrahend: { high: "A", low: "A" },
			},
			verdict: { arm: "baseline", kind: "separated" },
		},
	},
	stage: "build",
};

const REPLY_LENGTH: WhatMovedRow = {
	arms: {
		baseline: {
			counted: 2,
			high: 537,
			low: 510,
			mean: 523.5,
			state: "available",
		},
		candidate: {
			counted: 2,
			high: 468,
			low: 396,
			mean: 432,
			state: "available",
		},
		control: { counted: 2, high: 325, low: 259, mean: 292, state: "available" },
	},
	kind: "meter",
	name: "replyLength",
	readings: {
		candidateMinusBaseline: {
			change: "-17%",
			interval: {
				minuend: { high: 468, low: 396 },
				subtrahend: { high: 537, low: 510 },
			},
			verdict: { kind: "insideRerunNoise" },
		},
	},
};

const UNRECORDED = "this report records no word count for its attempts";

const UNRECORDED_LENGTH: WhatMovedRow = {
	arms: {
		baseline: { reasons: [UNRECORDED], state: "unavailable" },
		candidate: { reasons: [UNRECORDED], state: "unavailable" },
		control: { reasons: [UNRECORDED], state: "unavailable" },
	},
	kind: "meter",
	name: "replyLength",
	readings: {
		candidateMinusBaseline: {
			change: undefined,
			interval: { minuend: undefined, subtrahend: undefined },
			verdict: { kind: "unavailable", reasons: [UNRECORDED] },
		},
	},
};

const COST: WhatMovedRow = {
	arms: {
		baseline: {
			counted: 2,
			high: 2.08,
			low: 1.91,
			mean: 1.999,
			state: "available",
		},
		candidate: {
			counted: 2,
			high: 2.5,
			low: 2.3,
			mean: 2.4,
			state: "available",
		},
		control: {
			counted: 2,
			high: 0.75,
			low: 0.72,
			mean: 0.738,
			state: "available",
		},
	},
	kind: "meter",
	name: "costPerAttempt",
	readings: {
		candidateMinusBaseline: {
			change: "+20%",
			interval: {
				minuend: { high: 2.5, low: 2.3 },
				subtrahend: { high: 2.08, low: 1.91 },
			},
			verdict: { arm: "candidate", kind: "higher" },
		},
	},
};

const TWO_EACH = { baseline: 2, candidate: 2, control: 2 } as const;

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

export {
	BLOCKER,
	cell,
	COST,
	DIMENSION,
	OVERALL,
	renderWhatMoved,
	REPLY_LENGTH,
	table,
	UNRECORDED,
	UNRECORDED_LENGTH,
};
