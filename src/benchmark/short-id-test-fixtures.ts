import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";

const SUCCESSFUL_CHILD_EXIT_CODE = 0;

const EXPECTED_RECORDED_SHORT_ID_COUNT = 2;

const OUT_OF_RANGE_CHECKPOINT_STAGE_NUMBER = 3;

const ORDINAL_BASE = 1;

const NO_ACCESS_MODE = 0o000;

const EXECUTABLE_DIRECTORY_MODE = 0o755;

const CASE_ID = "audit-log";

const runsDirectory = join(tmpdir(), `rehearse-short-id-${randomUUID()}`);

interface ClaimInProcessesFixtureInput {
	readonly processes: number;
	readonly claimsEach: number;
}

async function claimInProcesses({
	processes,
	claimsEach,
}: ClaimInProcessesFixtureInput): Promise<readonly number[]> {
	const script = `
		import { claimShortId } from ${JSON.stringify(join(import.meta.dir, "short-id.ts"))};
		for (let i = 0; i < ${String(claimsEach)}; i++) {
			await claimShortId(${JSON.stringify(runsDirectory)}, ${JSON.stringify(CASE_ID)}, {
				kind: "run",
				run: \`claimed-\${process.pid}-\${i}\`,
			});
		}
	`;
	const children = Array.from({ length: processes }, () =>
		Bun.spawn([process.execPath, "-e", script], { stderr: "inherit" }),
	);

	return await Promise.all(children.map(async (child) => await child.exited));
}
export {
	SUCCESSFUL_CHILD_EXIT_CODE,
	EXPECTED_RECORDED_SHORT_ID_COUNT,
	OUT_OF_RANGE_CHECKPOINT_STAGE_NUMBER,
	ORDINAL_BASE,
	NO_ACCESS_MODE,
	EXECUTABLE_DIRECTORY_MODE,
	CASE_ID,
	runsDirectory,
	claimInProcesses,
};
