import { z } from "zod";

const PREFIX_START_INDEX = 0;
const TRUNCATED_RECORD_CHARACTER_COUNT = 20;

const HALF_WRITTEN_UUID = "0f6b6f2a-0000-4000-8000-00000000000f";

const damagedStopRecords: readonly (readonly [
	string,
	(stageFile: (stage: string) => string) => Promise<void>,
])[] = [
	[
		"its stop record's reads do not parse",
		async (stageFile) => {
			const record = z
				.looseObject({})
				.parse(await Bun.file(stageFile("build")).json());
			await Bun.write(
				stageFile("build"),
				JSON.stringify({
					...record,
					corpusVersion: { digest: "not a digest", kind: "version" },
				}),
			);
		},
	],
	[
		"its stop record was cut short",
		async (stageFile) => {
			const record = await Bun.file(stageFile("build")).text();
			await Bun.write(
				stageFile("build"),
				record.slice(PREFIX_START_INDEX, TRUNCATED_RECORD_CHARACTER_COUNT),
			);
		},
	],
	[
		"another of its stage records was cut short",
		async (stageFile) => {
			await Bun.write(stageFile("aaa"), '{"status": "AWAIT');
		},
	],
];

const REPLAY_ATTEMPT = "attempt:stage:lineage-discuss/2026-09-03T01-00-00.000Z";

const SMOKE_ATTEMPT =
	"attempt:session:smoke/0f6b6f2a-0000-4000-8000-000000000001";

const OLDER = "0f6b6f2a-0000-4000-8000-00000000000a";

const NEWER = "0f6b6f2a-0000-4000-8000-00000000000b";

export {
	HALF_WRITTEN_UUID,
	damagedStopRecords,
	REPLAY_ATTEMPT,
	SMOKE_ATTEMPT,
	OLDER,
	NEWER,
};
