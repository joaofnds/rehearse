import { afterEach, expect } from "bun:test";
import { GlobalRegistrator } from "@happy-dom/global-registrator";
import type * as Matchers from "@testing-library/jest-dom/matchers";
import type { cleanup as Cleanup } from "@testing-library/react";
import { FakeEventSource } from "./src/test-support/event-source";

GlobalRegistrator.register();
Object.defineProperty(globalThis, "EventSource", {
	value: FakeEventSource,
	configurable: true,
	writable: true,
});

const { cleanup }: { cleanup: typeof Cleanup } =
	await import("@testing-library/react");
const matchers: typeof Matchers =
	await import("@testing-library/jest-dom/matchers");

expect.extend(matchers);

afterEach(() => {
	cleanup();
	FakeEventSource.opened = [];
});
