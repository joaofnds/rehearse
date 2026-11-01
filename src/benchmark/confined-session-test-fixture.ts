import { afterEach, beforeEach } from "bun:test";

import { CONFINED_VARIABLE } from "./claude-confinement";

/** Shell stand-ins exercise the live transport from a process marked as a run. */
function markTestProcessConfined(): void {
	let inherited = Bun.env[CONFINED_VARIABLE];
	beforeEach(() => {
		inherited = Bun.env[CONFINED_VARIABLE];
		Bun.env[CONFINED_VARIABLE] = "1";
	});
	afterEach(() => {
		if (inherited === undefined) {
			delete Bun.env["REHEARSE_CONFINED"];
		} else {
			Bun.env[CONFINED_VARIABLE] = inherited;
		}
	});
}

export { markTestProcessConfined as default };
