import { afterEach, describe, expect, it } from "bun:test";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
	fireEvent,
	render,
	screen,
	waitFor,
	within,
} from "@testing-library/react";

import { sessionReviewSchema } from "#benchmark/session-review";
import { FakeServer } from "#client/test-support/fetch-stub";

import { AttemptEvidence } from "./attempt-evidence";
import type { SessionReviewReading } from "./session-review-query";

const originalFetch = globalThis.fetch;
const ID = "attempt:session:case-a/attempt-a";
const PATH = `/api/session-reviews/${encodeURIComponent(ID)}`;
const SHA256_LENGTH = 64;
const HTTP_CREATED = 201;
const HTTP_CONFLICT = 409;
const SOURCE = "a".repeat(SHA256_LENGTH);
const READING: SessionReviewReading = {
	agreement: undefined,
	id: ID,
	judge: undefined,
	requirements: [],
	review: undefined,
	rubric: undefined,
	sourceSha256: SOURCE,
	stale: false,
};
const RECORDED: SessionReviewReading = {
	...READING,
	agreement: {
		differences: [{ human: "FAIL", id: "accuracy", judge: "PASS" }],
		verdict: false,
	},
	review: {
		recordedAt: "2026-11-01T21:00:00.000Z",
		requirements: [{ id: "accuracy", status: "FAIL" }],
		schemaVersion: 1,
		sourceId: ID,
		sourceSha256: SOURCE,
		summary: "The answer is incorrect.",
		verdict: "FAIL",
	},
};
afterEach(() => {
	globalThis.fetch = originalFetch;
});

const SAVED_EVIDENCE = {
	kind: "session",
	record: {
		caseId: "case-a",
		checks: [{ detail: "within range", kind: "word-band", status: "PASS" }],
		outcome: "SUCCESSFUL",
		reply: "The saved answer.",
	},
	sourceSha256: SOURCE,
	state: "available",
};

function show(
	reading: SessionReviewReading,
	status = HTTP_CREATED,
): FakeServer {
	const server = new FakeServer(
		new Map([
			[
				`GET /api/attempt-evidence/${encodeURIComponent(ID)}`,
				{
					body: SAVED_EVIDENCE,
					status: 200,
				},
			],
			[`GET ${PATH}`, { body: reading, status: 200 }],
			[
				`POST ${PATH}`,
				{
					body:
						status === HTTP_CREATED
							? RECORDED
							: {
									error:
										"The saved attempt changed; reload it before reviewing",
								},
					status,
				},
			],
		]),
	);
	server.install();
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false } },
	});
	render(
		<QueryClientProvider client={client}>
			<AttemptEvidence id={ID} />
		</QueryClientProvider>,
	);
	return server;
}

describe(AttemptEvidence.name, () => {
	it(
		"refuses to review a context that differs from the displayed Results",
		refusesChangedResults,
	);
	it.each(["constructor", "toString", "__proto__"])(
		"requires an explicit grade for rubric ID %s",
		refusesInheritedGrade,
	);
	it(
		"records an independent review and replaces the form with persisted agreement",
		recordsAnIndependentReviewAndReplacesTheFormWithPersistedAgreement,
	);
	it(
		"reads an existing review without offering a second submission",
		readsAnExistingReviewWithoutOfferingASecondSubmission,
	);
	it(
		"retains the draft and displays a refused save",
		retainsTheDraftAndDisplaysARefusedSave,
	);
	it(
		"withholds agreement when the reviewed evidence changes",
		withholdsAgreementWhenTheReviewedEvidenceChanges,
	);
});

async function recordsAnIndependentReviewAndReplacesTheFormWithPersistedAgreement(): Promise<void> {
	const server = show({
		...READING,
		requirements: ["accuracy"],
		rubric: "1. `accuracy`: Answers accurately.",
	});
	const choices = await screen.findByRole("radiogroup", { name: "accuracy" });
	expect(
		screen.getByRole("button", { name: "Record human review" }),
	).toBeDisabled();

	fireEvent.click(within(choices).getByRole("radio", { name: "FAIL" }));
	fireEvent.change(screen.getByLabelText("Review summary"), {
		target: { value: "The answer is incorrect." },
	});
	fireEvent.click(screen.getByRole("button", { name: "Record human review" }));

	expect(await screen.findByText("Human verdict: FAIL")).toBeVisible();
	expect(screen.getByText("Human and Judge verdicts disagree.")).toBeVisible();
	expect(screen.getByText("accuracy: human FAIL, Judge PASS")).toBeVisible();
	expect(
		server
			.posted(PATH)
			.map(({ body }) => sessionReviewSchema.parse(JSON.parse(body))),
	).toEqual([
		{
			requirements: [{ id: "accuracy", status: "FAIL" }],
			sourceSha256: SOURCE,
			summary: "The answer is incorrect.",
			verdict: "FAIL",
		},
	]);
}

async function readsAnExistingReviewWithoutOfferingASecondSubmission(): Promise<void> {
	show(RECORDED);

	expect(await screen.findByText("Human verdict: FAIL")).toBeVisible();
	expect(
		screen.queryByRole("button", { name: "Record human review" }),
	).toBeNull();
}

async function retainsTheDraftAndDisplaysARefusedSave(): Promise<void> {
	show(READING, HTTP_CONFLICT);
	const choices = await screen.findByRole("radiogroup", {
		name: "Human verdict",
	});
	fireEvent.click(within(choices).getByRole("radio", { name: "PASS" }));
	fireEvent.change(screen.getByLabelText("Review summary"), {
		target: { value: "Looks correct." },
	});

	fireEvent.click(screen.getByRole("button", { name: "Record human review" }));

	await waitFor(() => {
		expect(screen.getByRole("alert")).toHaveTextContent(
			"The saved attempt changed",
		);
	});
	expect(screen.getByLabelText("Review summary")).toHaveValue("Looks correct.");
}

async function withholdsAgreementWhenTheReviewedEvidenceChanges(): Promise<void> {
	show({ ...RECORDED, agreement: undefined, stale: true });

	expect(
		await screen.findByText(
			"Saved attempt changed after review. Agreement is unavailable.",
		),
	).toBeVisible();
	expect(screen.queryByText("Human and Judge verdicts disagree.")).toBeNull();
}

async function refusesInheritedGrade(id: string): Promise<void> {
	show({ ...READING, requirements: [id] });
	await screen.findByRole("radiogroup", { name: id });
	fireEvent.change(screen.getByLabelText("Review summary"), {
		target: { value: "I have not graded the requirement yet." },
	});
	expect(
		screen.getByRole("button", { name: "Record human review" }),
	).toBeDisabled();
}

async function refusesChangedResults(): Promise<void> {
	show({ ...READING, sourceSha256: "b".repeat(SHA256_LENGTH) });
	expect(await screen.findByRole("alert")).toHaveTextContent(
		"Saved attempt changed while Results loaded",
	);
	expect(
		screen.queryByRole("button", { name: "Record human review" }),
	).toBeNull();
}
