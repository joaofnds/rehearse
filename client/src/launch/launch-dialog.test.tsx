import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import { LaunchDialog } from "./launch-dialog";
import {
	FIRST_POSTED_REQUEST_INDEX,
	openDialog,
	originalFetch,
	serving,
	startButton,
} from "./launch-test-fixtures";

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe(LaunchDialog.name, () => {
	it(
		"shows the selected case and its declared model before Start",
		showsTheSelectedCaseAndItsDeclaredModelBeforeStart,
	);

	it(
		"offers one, three, six or twelve attempts with one pressed",
		offersOneThreeSixOrTwelveAttemptsWithOnePressed,
	);

	it(
		"names the attempt count on the start button",
		namesTheAttemptCountOnTheStartButton,
	);

	it(
		"posts the first case that declares a model, and the attempts, as JSON when started",
		postsTheFirstCaseThatDeclaresAModelAndTheAttemptsAsJSONWhenStarted,
	);

	it("posts the case picked from the list", postsTheCasePickedFromTheList);

	describe("when opened on a case with its attempts chosen", () => {
		it(
			"posts that case and that many attempts",
			postsThatCaseAndThatManyAttempts,
		);

		it(
			"shows that case picked and that attempt count pressed",
			showsThatCasePickedAndThatAttemptCountPressed,
		);
	});

	it("closes once the launch is accepted", closesOnceTheLaunchIsAccepted);

	it(
		"marks a case with no declared model as one it cannot start",
		marksACaseWithNoDeclaredModelAsOneItCannotStart,
	);

	it(
		"closes on Esc and returns focus to the button that opened it",
		closesOnEscAndReturnsFocusToTheButtonThatOpenedIt,
	);
});

async function showsTheSelectedCaseAndItsDeclaredModelBeforeStart(): Promise<void> {
	serving();
	const dialog = await openDialog({ kind: "case" });
	const conditions = await within(dialog).findByRole("region", {
		name: "Launch conditions",
	});

	expect(conditions).toHaveTextContent("Audit log");
	expect(conditions).toHaveTextContent("Workflow modelsonnet");
	expect(conditions).toHaveTextContent(
		"Effort and Judge settings are resolved by the launcher; their effective values are not exposed by this API.",
	);
	fireEvent.change(within(dialog).getByLabelText("Case"), {
		target: { value: "smoke" },
	});
	expect(conditions).toHaveTextContent("Smoke");
	expect(conditions).not.toHaveTextContent("Audit log");
	expect(conditions).toHaveTextContent(
		"This session is evaluated by its declared checks.",
	);
}

async function offersOneThreeSixOrTwelveAttemptsWithOnePressed(): Promise<void> {
	serving();

	const dialog = await openDialog({ kind: "case" });

	const attempts = within(dialog).getByRole("group", { name: "Attempts" });
	expect(
		within(attempts)
			.getAllByRole("button")
			.map((button) => [
				button.textContent,
				button.getAttribute("aria-pressed"),
			]),
	).toEqual([
		["×1", "true"],
		["×3", "false"],
		["×6", "false"],
		["×12", "false"],
	]);
}

async function namesTheAttemptCountOnTheStartButton(): Promise<void> {
	serving();
	const dialog = await openDialog({ kind: "case" });

	fireEvent.click(within(dialog).getByRole("button", { name: "×3" }));

	expect(
		await within(dialog).findByRole("button", { name: "Start · 3 attempts" }),
	).toBeInTheDocument();
}

async function postsTheFirstCaseThatDeclaresAModelAndTheAttemptsAsJSONWhenStarted(): Promise<void> {
	const server = serving();
	const dialog = await openDialog({ kind: "case" });
	fireEvent.click(within(dialog).getByRole("button", { name: "×3" }));

	fireEvent.click(await startButton());

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
	});
	const [request] = server.posted("/api/launches");
	expect(request?.contentType).toBe("application/json");
	expect(JSON.parse(request?.body ?? "")).toEqual({
		attempts: 3,
		caseId: "audit-log",
		kind: "case",
	});
}

async function postsTheCasePickedFromTheList(): Promise<void> {
	const server = serving();
	const dialog = await openDialog({ kind: "case" });
	await within(dialog).findByRole("option", { name: "smoke · Smoke" });

	fireEvent.change(within(dialog).getByLabelText("Case"), {
		target: { value: "smoke" },
	});
	fireEvent.click(await startButton());

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
	});
	expect(
		JSON.parse(
			server.posted("/api/launches")[FIRST_POSTED_REQUEST_INDEX]?.body ?? "",
		),
	).toMatchObject({ caseId: "smoke" });
}

async function postsThatCaseAndThatManyAttempts(): Promise<void> {
	const server = serving();
	await openDialog({ attempts: 3, caseId: "smoke", kind: "case" });
	await screen.findByRole("option", { name: "smoke · Smoke" });

	fireEvent.click(await startButton());

	await waitFor(() => {
		const expectedPostedCount = 1;

		expect(server.posted("/api/launches")).toHaveLength(expectedPostedCount);
	});
	expect(
		JSON.parse(
			server.posted("/api/launches")[FIRST_POSTED_REQUEST_INDEX]?.body ?? "",
		),
	).toEqual({ attempts: 3, caseId: "smoke", kind: "case" });
}

async function showsThatCasePickedAndThatAttemptCountPressed(): Promise<void> {
	serving();
	const dialog = await openDialog({
		attempts: 3,
		caseId: "smoke",
		kind: "case",
	});
	await within(dialog).findByRole("option", { name: "smoke · Smoke" });

	expect(within(dialog).getByLabelText("Case")).toHaveValue("smoke");
	expect(within(dialog).getByRole("button", { name: "×3" })).toHaveAttribute(
		"aria-pressed",
		"true",
	);
}

async function closesOnceTheLaunchIsAccepted(): Promise<void> {
	serving();
	await openDialog({ kind: "case" });

	fireEvent.click(await startButton());

	await waitFor(() => {
		expect(screen.queryByRole("dialog")).toBeNull();
	});
}

async function marksACaseWithNoDeclaredModelAsOneItCannotStart(): Promise<void> {
	serving();

	const dialog = await openDialog({ kind: "case" });

	expect(
		await within(dialog).findByRole("option", {
			name: "no-model · declares no model",
		}),
	).toBeDisabled();
}

async function closesOnEscAndReturnsFocusToTheButtonThatOpenedIt(): Promise<void> {
	serving();
	const dialog = await openDialog({ kind: "case" });

	fireEvent.keyDown(dialog, { key: "Escape" });

	await waitFor(() => {
		expect(screen.queryByRole("dialog")).toBeNull();
	});
	expect(document.activeElement).toBe(
		screen.getByRole("button", { name: "New run" }),
	);
}
