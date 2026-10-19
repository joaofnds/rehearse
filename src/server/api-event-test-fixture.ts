import { openRunEventStore } from "#benchmark/run-events";
import type { NewRunEvent } from "#benchmark/run-events";
import { runEventsDatabaseFile } from "#benchmark/run-layout";
import type ApiHttpDriver from "#server/api-test-http-driver";

interface ApiEventFixtureProps {
	readonly app: Readonly<ApiHttpDriver>;
	readonly runsDirectory: string;
}

/** Owns appending to the same event database the open HTTP stream polls. */
class ApiEventFixture {
	public constructor(private readonly props: ApiEventFixtureProps) {}

	public get app(): Readonly<ApiHttpDriver> {
		return this.props.app;
	}

	public async append(events: readonly NewRunEvent[]): Promise<void> {
		const store = await openRunEventStore(
			runEventsDatabaseFile(this.props.runsDirectory),
		);
		try {
			for (const event of events) {
				store.append(event);
			}
		} finally {
			store.close();
		}
	}
}

export { ApiEventFixture as default };
