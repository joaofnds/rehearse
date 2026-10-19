import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { act, screen, within } from "@testing-library/react";

import { renderAppAt } from "#client/test-support/render-app";

import type { SessionEvidenceGates } from "./group-session-test-fixtures";
import {
	MISSING_STATE_EVIDENCE,
	SESSION_ATTEMPT_INDEX,
	servePendingSessionEvidence,
} from "./group-session-test-fixtures";
import GroupWorkspacePage from "./group-workspace";
import {
	GROUP,
	originalFetch,
	serveSessionAssessment,
} from "./group-workspace-test-fixtures";

let sessionGates: SessionEvidenceGates | null = null;

afterEach(() => {
	sessionGates?.index.resolve(Response.json(SESSION_ATTEMPT_INDEX));
	sessionGates?.missing.resolve(Response.json(MISSING_STATE_EVIDENCE));
	sessionGates = null;
	globalThis.fetch = originalFetch;
});

describe(GroupWorkspacePage.name, () => {
	it(
		"retains recorded session success while counting saved state assessment and unavailable attempts separately",
		retainsRecordedSessionSuccessWhileCountingSavedStateAssessmentAndUnavailableAttemptsSeparately,
	);

	describe("while the session evidence index and initial reads settle", () => {
		beforeEach(opensPendingSessionEvidence);
		it(
			"keeps saved state figures pending until the index and every initial evidence response settle",
			keepsSavedStateFiguresPendingUntilTheIndexAndEveryInitialEvidenceResponseSettle,
		);
		it(
			"keeps figures pending while an initial evidence read is outstanding",
			waitsForAllInitialEvidence,
		);
		it(
			"reads assessed and unavailable attempts after every initial read settles",
			readsCompletedInitialEvidence,
		);
	});

	it(
		"shows failed saved state checks and unavailable assessment separately in group attempts",
		showsFailedSavedStateChecksAndUnavailableAssessmentSeparatelyInGroupAttempts,
	);
});

async function retainsRecordedSessionSuccessWhileCountingSavedStateAssessmentAndUnavailableAttemptsSeparately(): Promise<void> {
	serveSessionAssessment("results");

	expect(
		await screen.findByText(
			"1 of 2 assessed attempts passed every saved state check",
		),
	).toBeInTheDocument();
	expect(
		screen.getByText("3 of 3 recorded successful on reply/transcript checks"),
	).toBeInTheDocument();
	expect(
		screen.getByText("2 of 3 attempts have saved state checks"),
	).toBeInTheDocument();
	expect(
		screen.getByText("1 attempt unavailable or without saved state checks"),
	).toBeInTheDocument();
}

async function opensPendingSessionEvidence(): Promise<void> {
	sessionGates = servePendingSessionEvidence();
	renderAppAt(`/groups/${GROUP}?view=results`);
	await screen.findByRole("region", { name: "Session repetitions" });
}

async function keepsSavedStateFiguresPendingUntilTheIndexAndEveryInitialEvidenceResponseSettle(): Promise<void> {
	const panel = await screen.findByRole("region", {
		name: "Session repetitions",
	});
	expect(
		await within(panel).findByText("Reading saved state checks…"),
	).toBeInTheDocument();
	expect(panel).not.toHaveTextContent(
		"assessed attempts passed every saved state check",
	);
	expect(panel).not.toHaveTextContent(
		"unavailable or without saved state checks",
	);
}

async function waitsForAllInitialEvidence(): Promise<void> {
	const gates = sessionGates;
	if (gates === null) {
		throw new Error("session evidence setup did not run");
	}
	const panel = await screen.findByRole("region", {
		name: "Session repetitions",
	});
	await act(async () => {
		gates.index.resolve(Response.json(SESSION_ATTEMPT_INDEX));
		return await gates.index.promise;
	});
	expect(panel).toHaveTextContent("Reading saved state checks…");
	expect(panel).not.toHaveTextContent(
		"assessed attempts passed every saved state check",
	);
}

async function readsCompletedInitialEvidence(): Promise<void> {
	const gates = sessionGates;
	if (gates === null) {
		throw new Error("session evidence setup did not run");
	}
	const panel = await screen.findByRole("region", {
		name: "Session repetitions",
	});
	await act(async () => {
		gates.index.resolve(Response.json(SESSION_ATTEMPT_INDEX));
		return await gates.index.promise;
	});
	await act(async () => {
		gates.missing.resolve(Response.json(MISSING_STATE_EVIDENCE));
		return await gates.missing.promise;
	});
	expect(
		await within(panel).findByText(
			"1 of 1 assessed attempts passed every saved state check",
		),
	).toBeInTheDocument();
	expect(
		within(panel).getByText(
			"1 attempt unavailable or without saved state checks",
		),
	).toBeInTheDocument();
	expect(
		within(panel).queryByText("Reading saved state checks…"),
	).not.toBeInTheDocument();
}

async function showsFailedSavedStateChecksAndUnavailableAssessmentSeparatelyInGroupAttempts(): Promise<void> {
	serveSessionAssessment("attempts");

	const first = await screen.findByRole("row", { name: /rep-1/u });
	expect(
		await within(first).findByText("0 of 1 saved state checks passed"),
	).toBeInTheDocument();
	const missing = screen.getByRole("row", { name: /rep-3/u });
	expect(
		await within(missing).findByText("Saved state checks unavailable"),
	).toBeInTheDocument();
	expect(missing).not.toHaveTextContent("0 of");
}
