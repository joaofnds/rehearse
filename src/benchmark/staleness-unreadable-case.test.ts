import { afterEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import { CASES_DIRECTORY } from "./case";
import { CONTROL_DIR } from "./config";
import { directorySource } from "./run-records-test-support";
import { sessionAttemptStaleness } from "./staleness-report";
import SessionCorpusFixtures from "./staleness-session-test-fixtures";
import { TestResources } from "./test-support";

const fixtures = new SessionCorpusFixtures();
afterEach(async () => {
	await fixtures.cleanup();
});
describe("unreadable case evidence", () => {
	const resources = TestResources.forEachTest();
	it(`${sessionAttemptStaleness.name} > when a case declaration cannot be read > names it as unreadable rather than reading as fresh`, async () => {
		const stray = join(CONTROL_DIR, CASES_DIRECTORY, "zz-stale-probe");
		resources.track(stray);
		await mkdir(stray, { recursive: true });
		const root = await fixtures.temporaryDirectory("rehearse-case-unread-");

		const report = await sessionAttemptStaleness(
			root,
			directorySource(await fixtures.styleCorpus("the brief style\n")),
		);

		expect(report.unreadable.map(({ id }) => id)).toEqual([
			"case:zz-stale-probe",
		]);
	});
});
