import { z } from "zod";

import { RecordedRunsFixture } from "#benchmark/run-records-test-support";
import { parseSessionAttemptRecord } from "#benchmark/session-record";
import { appServer } from "#server/app-test-fixture";
import type { AppServer } from "#server/app-test-fixture";

const timedRowSchema = z.object({ kind: z.string(), wallTime: z.unknown() });

async function recordedApp(): Promise<
	AppServer & {
		readonly fixture: RecordedRunsFixture;
		readonly record: ReturnType<typeof parseSessionAttemptRecord>;
	}
> {
	const server = await appServer();
	const fixture = new RecordedRunsFixture(server.runsRoot);
	await fixture.write();
	const record = parseSessionAttemptRecord(
		await Bun.file(fixture.sessionAttemptFile).text(),
	);
	return { ...server, fixture, record };
}

export { recordedApp, timedRowSchema };
