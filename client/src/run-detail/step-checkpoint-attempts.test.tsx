import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, within } from "@testing-library/react";

import { RUN, renderRunDetail } from "#client/test-support/run-detail";

import {
	BUILD_ATTEMPTS,
	BUILD_ATTEMPT_SERIES,
	originalFetch,
} from "./step-report-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the selected step in Results", () => {
	describe("attempts at the checkpoint", () => {
		it(
			"lists the original run, a replay and a rep at the checkpoint the selected step started from",
			listsTheOriginalRunAReplayAndARepAtTheCheckpointTheSelectedStepStartedFrom,
		);

		it(
			"reads the attempts of the step chosen in the rail",
			readsTheAttemptsOfTheStepChosenInTheRail,
		);
	});
});

async function listsTheOriginalRunAReplayAndARepAtTheCheckpointTheSelectedStepStartedFrom(): Promise<void> {
	renderRunDetail(new Map([[BUILD_ATTEMPTS, BUILD_ATTEMPT_SERIES]]));

	const list = await screen.findByRole("list", {
		name: "Attempts at audit-log/r2/s1",
	});
	const items = within(list).getAllByRole("listitem");

	expect(
		screen.getByRole("heading", { name: "Attempts at audit-log/r2/s1" }),
	).toBeInTheDocument();
	expect(items.map((item) => item.textContent)).toEqual([
		"audit-log/r2Doriginal run · version not recorded⚠ stale · skills/build/SKILL.md changed",
		"audit-log/r3Breplay · corpus@c0ffee✓ current corpus",
		"audit-log/r4Creplay · corpus@c0ffee✓ clear · nothing it read changed across 2 later corpus versions",
		"audit-log/g5 rep 1Aconfirmation rep · version not recordedstaleness not known: the group froze no pipeline to hash its stages against",
	]);
	expect(
		screen.getByRole("link", { name: "Compare these attempts" }),
	).toHaveAttribute("href", "/comparisons");
}

async function readsTheAttemptsOfTheStepChosenInTheRail(): Promise<void> {
	renderRunDetail(
		new Map([
			[BUILD_ATTEMPTS, BUILD_ATTEMPT_SERIES],
			[
				`/api/runs/${RUN}/stages/shape/attempts`,
				{ attempts: [], checkpoint: "audit-log/r2/s0" },
			],
		]),
	);
	await screen.findByRole("list", { name: "Attempts at audit-log/r2/s1" });

	fireEvent.click(screen.getByRole("button", { name: /shape/u }));

	expect(
		await screen.findByRole("list", {
			name: "Attempts at audit-log/r2/s0",
		}),
	).toBeInTheDocument();
}
