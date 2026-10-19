import { afterEach, describe, expect, it } from "bun:test";

import { fireEvent, screen, waitFor, within } from "@testing-library/react";

import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";

import {
	EMPTY_COLLECTION_LENGTH,
	IN_FLIGHT,
	NEWER,
	OLDER,
	acceptedStopResponse,
	bar,
	originalFetch,
	refusedStopResponse,
	renderBarWithLaunch,
	renderRunInFlight,
	servingListing,
} from "./in-flight-test-fixtures";

const expectedAskedCount = 1;

afterEach(() => {
	globalThis.fetch = originalFetch;
});

describe("the run in flight on every screen", () => {
	it(
		"stops the run through the launch that started it",
		stopsTheRunThroughTheLaunchThatStartedIt,
	);

	it(
		"stops a run started outside the browser through the run itself",
		stopsARunStartedOutsideTheBrowserThroughTheRunItself,
	);

	it("says why the server refused a stop", saysWhyTheServerRefusedAStop);

	it(
		"offers Stop for the run left in flight after the newest is stopped",
		offersStopForTheRunLeftInFlightAfterTheNewestIsStopped,
	);

	it(
		"leaves once its Stop is accepted, without waiting for a poll",
		leavesOnceItsStopIsAcceptedWithoutWaitingForAPoll,
	);
});

async function stopsTheRunThroughTheLaunchThatStartedIt(): Promise<void> {
	const asked: string[] = [];
	const stub = async (input: RequestInfo | URL): Promise<Response> => {
		asked.push(input instanceof Request ? input.url : String(input));

		return await Promise.resolve(Response.json({}));
	};
	stub.preconnect = originalFetch.preconnect;
	globalThis.fetch = stub;
	renderRunInFlight([
		new PipelineRunRowBuilder({ launchId: "launch-1" })
			.withExecutionProgress()
			.build(),
	]);

	fireEvent.click(within(bar()).getByRole("button", { name: "Stop" }));

	await waitFor(() => {
		expect(within(bar()).getByRole("button", { name: "Stop" })).toBeDisabled();
	});
	const [observedFirstAsked] = asked;

	expect(asked).toHaveLength(expectedAskedCount);
	expect(observedFirstAsked).toEndWith("/api/launches/launch-1/stop");
}

async function stopsARunStartedOutsideTheBrowserThroughTheRunItself(): Promise<void> {
	const asked: string[] = [];
	const stub = async (input: RequestInfo | URL): Promise<Response> => {
		asked.push(input instanceof Request ? input.url : String(input));

		return await Promise.resolve(Response.json({}));
	};
	stub.preconnect = originalFetch.preconnect;
	globalThis.fetch = stub;
	renderRunInFlight([
		new PipelineRunRowBuilder({
			launchId: undefined,
			run: "2026-09-30T10-00-00.000Z",
		})
			.withExecutionProgress()
			.build(),
	]);

	fireEvent.click(within(bar()).getByRole("button", { name: "Stop" }));

	await waitFor(() => {
		expect(within(bar()).getByRole("button", { name: "Stop" })).toBeDisabled();
	});
	const [observedFirstAsked] = asked;

	expect(asked).toHaveLength(expectedAskedCount);
	expect(observedFirstAsked).toEndWith(
		"/api/runs/2026-09-30T10-00-00.000Z/stop",
	);
}

async function saysWhyTheServerRefusedAStop(): Promise<void> {
	globalThis.fetch = Object.assign(refusedStopResponse, {
		preconnect: originalFetch.preconnect,
	});
	renderRunInFlight([
		new PipelineRunRowBuilder({ launchId: "launch-1" })
			.withExecutionProgress()
			.build(),
	]);

	fireEvent.click(within(bar()).getByRole("button", { name: "Stop" }));

	expect(await within(bar()).findByRole("alert")).toHaveTextContent(
		"launch already ended",
	);
}

async function offersStopForTheRunLeftInFlightAfterTheNewestIsStopped(): Promise<void> {
	globalThis.fetch = Object.assign(acceptedStopResponse, {
		preconnect: originalFetch.preconnect,
	});
	const older = {
		...new PipelineRunRowBuilder({ launchId: "launch-b", run: OLDER })
			.withExecutionProgress()
			.build(),
		shortId: "r-0147",
	};
	const { rerender } = renderRunInFlight([
		{
			...new PipelineRunRowBuilder({ launchId: "launch-a", run: NEWER })
				.withExecutionProgress()
				.build(),
			shortId: "r-0149",
		},
		older,
	]);
	const newest = screen.getByRole("region", { name: "Run r-0149 in flight" });
	fireEvent.click(within(newest).getByRole("button", { name: "Stop" }));
	await waitFor(() => {
		expect(within(newest).getByRole("button", { name: "Stop" })).toBeDisabled();
	});

	rerender([older]);

	expect(within(bar()).getByRole("button", { name: "Stop" })).toBeEnabled();
}

async function leavesOnceItsStopIsAcceptedWithoutWaitingForAPoll(): Promise<void> {
	const server = servingListing(
		() =>
			server.posted("/api/launches/launch-1/stop").length ===
			EMPTY_COLLECTION_LENGTH
				? [
						new PipelineRunRowBuilder({ launchId: "launch-1" })
							.withExecutionProgress()
							.build(),
					]
				: [],
		new Map([["POST /api/launches/launch-1/stop", { body: {}, status: 200 }]]),
	);
	renderBarWithLaunch();
	const shown = await screen.findByRole("region", { name: IN_FLIGHT });

	fireEvent.click(within(shown).getByRole("button", { name: "Stop" }));

	await waitFor(() => {
		expect(screen.queryByRole("region", { name: IN_FLIGHT })).toBeNull();
	});
}
