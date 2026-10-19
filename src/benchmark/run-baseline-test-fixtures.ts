import { mkdir, mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { ContextFile } from "./contracts";
import type { TargetCheck } from "./pipeline";

const FIRST_RECORDED_CHECK_INDEX = 0;
const INITIAL_SETUP_CALL_INDEX = 0;
class RunBaselineCaptureFixture {
	public readonly events: string[] = [];
	public readonly target = {
		checks: [{ command: ["bun", "run", "custom-baseline"] }],
		integrityFiles: ["custom-check.json"],
		setup: [{ command: ["bun", "install"] }],
	};
	public readonly hashes = new Map([["custom-check.json", "hash"]]);
	public readonly context = [{ content: "base\n", path: "base.txt" }];
	public readonly dependencies = {
		assertWorkspaceCleanAt: async (
			targetDir: string,
			sha: string,
		): Promise<void> => {
			this.events.push(`${targetDir}:clean:${sha}`);
			await Promise.resolve();
		},
		captureBaselineContext: async (
			targetDir: string,
		): Promise<ContextFile[]> => {
			this.events.push(`${targetDir}:context`);
			return await Promise.resolve(this.context);
		},
		captureFileHashes: async (
			targetDir: string,
			integrityFiles: readonly string[],
		): Promise<Map<string, string>> => {
			this.events.push(`${targetDir}:hash:${integrityFiles.join(",")}`);
			return await Promise.resolve(this.hashes);
		},
		runChecks: async (
			targetDir: string,
			label: string,
			checks: readonly TargetCheck[],
		): Promise<void> => {
			this.events.push(
				`${targetDir}:${label}:${checks[FIRST_RECORDED_CHECK_INDEX]?.command.join(" ")}`,
			);
			await Promise.resolve();
		},
		runSetup: async (
			targetDir: string,
			setup: readonly TargetCheck[] | undefined,
		): Promise<void> => {
			this.events.push(
				`${targetDir}:setup:${setup?.[INITIAL_SETUP_CALL_INDEX]?.command.join(" ")}`,
			);
			await Promise.resolve();
		},
	};
}
interface BaselineTestResources {
	readonly track: (directory: string) => void;
}
async function initialCheckpointTarget(
	resources: BaselineTestResources,
): Promise<string> {
	const targetDir = await mkdtemp(join(tmpdir(), "rehearse-initial-run-"));
	resources.track(targetDir);
	await mkdir(join(targetDir, "backlog"), { recursive: true });
	await Bun.write(join(targetDir, "backlog", "config.yml"), "statuses: []\n");
	return targetDir;
}
export { RunBaselineCaptureFixture, initialCheckpointTarget };
