import { screen } from "@testing-library/react";

const FIRST_POSTED_REQUEST_INDEX = 0;

const originalFetch = globalThis.fetch;

async function rootCauseSection(): Promise<HTMLElement> {
	return await screen.findByRole("region", {
		name: "Root-cause analysis",
	});
}

export { FIRST_POSTED_REQUEST_INDEX, originalFetch, rootCauseSection };
