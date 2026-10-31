import { describe, expect, it } from "bun:test";

import { takeLaunchOption } from "./launch-option";

const LAUNCH_ID = "8a1c0000-0000-4000-8000-000000000355";

describe(takeLaunchOption.name, () => {
	it("takes a launch id from ahead of the command", () => {
		expect(takeLaunchOption(["--launch", LAUNCH_ID, "replay"])).toEqual({
			argv: ["replay"],
			launchId: LAUNCH_ID,
		});
	});

	it("leaves an id that could name a path outside launches on the command line", () => {
		expect(takeLaunchOption(["--launch", "../escape", "replay"])).toEqual({
			argv: ["--launch", "../escape", "replay"],
			launchId: undefined,
		});
	});
});
