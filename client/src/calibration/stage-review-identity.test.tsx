import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor } from "@testing-library/react";

import { renderAppAt } from "#client/test-support/render-app";

import {
	LISTED_LINEAGE,
	UNLISTED_LINEAGE,
	serveListedReplay,
	serveUnlistedReplay,
} from "./replay-review-fixtures";
import StageReviewPage from "./stage-review-page";
import {
	BLIND_REVIEW,
	JUDGE_SUMMARY,
	REVIEW_PATH,
	RUN,
	choose,
	originalFetch,
	serving,
} from "./stage-review-test-fixtures";

const EXPECTED_GRADE_REQUESTS = 1;

const REVIEW_DESTINATIONS: readonly ReviewDestination[] = [
	{
		kind: "a confirmation rep",
		page: "/calibration/groups/group-1/reps/rep-2/stages/shape",
		returnHref: "/groups/group-1/reps/rep-2/attempt?view=results",
		returnLabel: "Back to attempt Results",
		reviewPath: "/api/calibration/groups/group-1/reps/rep-2/stages/shape",
	},
	{
		kind: "a replay",
		page: `/calibration/replays/lineage-1/${RUN}`,
		returnHref: `/replays/lineage-1/${RUN}?view=results`,
		returnLabel: "Back to replay Results",
		reviewPath: `/api/calibration/replays/lineage-1/${RUN}`,
	},
];

afterEach(() => {
	globalThis.fetch = originalFetch;
});
describe(StageReviewPage.name, () => {
	describe("a replay with a recorded listing identity", listedReplayReview);

	it(
		"keeps a readable replay fallback and canonical identity when the listing is unavailable",
		keepsAReadableReplayFallbackAndCanonicalIdentityWhenTheListingIsUnavailable,
	);

	it(
		"returns to Judge calibration from a contextual step review",
		returnsToJudgeCalibrationFromAContextualStepReview,
	);

	it(
		"keeps the contextual return to the judged run after recording",
		keepsTheContextualReturnToTheJudgedRunAfterRecording,
	);

	it.each([...REVIEW_DESTINATIONS])(
		"opens and records $kind the link names",
		recordsReviewDestination,
	);

	it(
		"asks for the stage the link names, a slash in it escaped rather than followed",
		asksForTheStageTheLinkNamesASlashInItEscapedRatherThanFollowed,
	);
});

function listedReplayReview(): void {
	beforeEach(opensListedReplayReview);
	it(
		"uses its exact listed short identity without showing canonical keys",
		readsListedReplayHeader,
	);
	it(
		"keeps canonical replay identity in inspectable provenance",
		opensCanonicalReplayIdentity,
	);
}
async function opensListedReplayReview(): Promise<void> {
	serveListedReplay();
	renderAppAt(`/calibration/replays/${LISTED_LINEAGE}/${RUN}`);
	await screen.findByRole("heading", { level: 1, name: "Review step" });
}
async function readsListedReplayHeader(): Promise<void> {
	const lineage = LISTED_LINEAGE;
	const heading = await screen.findByRole("heading", {
		level: 1,
		name: "Review step",
	});
	const header = heading.closest("header");
	await waitFor(() => {
		expect(header).toHaveTextContent(
			"r2 · audit-log · replay · shape · Judge opus",
		);
	});
	expect(header).not.toHaveTextContent(lineage);
	expect(screen.queryByText(JUDGE_SUMMARY)).not.toBeInTheDocument();
}
function opensCanonicalReplayIdentity(): void {
	const lineage = LISTED_LINEAGE;
	const timestamp = RUN;
	const summary = screen.getByText("Recorded step identity");
	const disclosure = summary.closest("details");
	expect(disclosure).not.toHaveAttribute("open");
	fireEvent.click(summary);
	expect(disclosure).toHaveAttribute("open");
	expect(screen.getByText(lineage)).toBeVisible();
	expect(disclosure).toHaveTextContent(timestamp);
}

async function keepsAReadableReplayFallbackAndCanonicalIdentityWhenTheListingIsUnavailable(): Promise<void> {
	const expectedRadioGroupCount = 3;
	serveUnlistedReplay();
	renderAppAt(`/calibration/replays/${UNLISTED_LINEAGE}/${RUN}`);
	await screen.findByRole("region", { name: "What the judge read" });
	const header = screen.getByRole("heading", { level: 1 }).closest("header");
	expect(header).toHaveTextContent("Replay · shape · Judge opus");
	expect(header).not.toHaveTextContent(UNLISTED_LINEAGE);
	fireEvent.click(screen.getByText("Recorded step identity"));
	expect(screen.getByText(UNLISTED_LINEAGE)).toBeVisible();
	expect(screen.getAllByRole("radiogroup")).toHaveLength(
		expectedRadioGroupCount,
	);
}

async function returnsToJudgeCalibrationFromAContextualStepReview(): Promise<void> {
	serving(BLIND_REVIEW);
	renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
	expect(
		await screen.findByRole("link", { name: "Judge calibration" }),
	).toHaveAttribute("href", "/settings?view=judges");
}

async function keepsTheContextualReturnToTheJudgedRunAfterRecording(): Promise<void> {
	const server = serving(BLIND_REVIEW);
	renderAppAt(`/calibration/runs/${RUN}/stages/shape`);
	await screen.findByRole("region", { name: "What the judge read" });

	choose("invalid-stage-delivery", "PASS");
	choose("goal-stated", "PASS");
	choose("decision-quality", "B");
	fireEvent.click(screen.getByRole("button", { name: "Record my grade" }));

	await screen.findByRole("table", {
		name: "Your grade against the judge's",
	});
	expect(server.posted(`${REVIEW_PATH}/grade`)).toHaveLength(
		EXPECTED_GRADE_REQUESTS,
	);
	expect(
		screen.getByRole("link", { name: "Back to run Results" }),
	).toHaveAttribute("href", `/runs/${RUN}?view=results&step=shape`);
}

async function asksForTheStageTheLinkNamesASlashInItEscapedRatherThanFollowed(): Promise<void> {
	const server = serving(BLIND_REVIEW);
	renderAppAt("/calibration/runs/a%2F..%2F..%2Freplays%2Fx/stages/shape");

	await waitFor(() => {
		expect(
			server.sent.some(({ pathname }) =>
				pathname.startsWith("/api/calibration/runs/a"),
			),
		).toBe(true);
	});

	expect(
		server.sent
			.map(({ pathname }) => pathname)
			.filter((pathname) => pathname.startsWith("/api/calibration/r")),
	).toEqual(["/api/calibration/runs/a%2F..%2F..%2Freplays%2Fx/stages/shape"]);
}

interface ReviewDestination {
	readonly kind: string;
	readonly page: string;
	readonly reviewPath: string;
	readonly returnLabel: string;
	readonly returnHref: string;
}
async function recordsReviewDestination({
	page,
	reviewPath,
	returnLabel,
	returnHref,
}: ReviewDestination): Promise<void> {
	const server = serving(BLIND_REVIEW, reviewPath);
	renderAppAt(page);
	await screen.findByRole("region", { name: "What the judge read" });

	choose("invalid-stage-delivery", "PASS");
	choose("goal-stated", "PASS");
	choose("decision-quality", "B");
	fireEvent.click(screen.getByRole("button", { name: "Record my grade" }));
	await screen.findByRole("table", {
		name: "Your grade against the judge's",
	});

	expect(server.posted(`${reviewPath}/grade`)).toHaveLength(
		EXPECTED_GRADE_REQUESTS,
	);
	expect(screen.getByRole("link", { name: returnLabel })).toHaveAttribute(
		"href",
		returnHref,
	);
}
