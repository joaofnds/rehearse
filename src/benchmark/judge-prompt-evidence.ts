import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
	captureBaselineContext,
	captureCheckIntegrity,
	captureFileHashes,
	captureTreatmentChecks,
} from "./checks";
import { runCommand } from "./command";
import type { ContextFile, LocalCheckResult } from "./contracts";

interface PromptResources {
	readonly track: (directory: string) => void;
}

interface PromptEvidence {
	readonly baselineContext: readonly ContextFile[];
	readonly baselineHashes: ReadonlyMap<string, string>;
	readonly checkIntegrity: LocalCheckResult;
	readonly directory: string;
	readonly localChecks: LocalCheckResult;
}

async function capturePromptEvidence(
	resources: PromptResources,
): Promise<PromptEvidence> {
	const directory = await mkdtemp(join(tmpdir(), "rehearse-judge-prompts-"));
	resources.track(directory);

	await runCommand(["git", "init", "-b", "main"], directory);
	await Bun.write(join(directory, "context.md"), "Context text\n");
	await runCommand(["git", "add", "context.md"], directory);

	const baselineContext = await captureBaselineContext(directory);
	const baselineHashes = await captureFileHashes(directory, ["context.md"]);
	const checkIntegrity = await captureCheckIntegrity(directory, baselineHashes);
	const localChecks = await captureTreatmentChecks(
		directory,
		[{ command: ["true"] }],
		(): void => undefined,
	);

	return {
		baselineContext,
		baselineHashes,
		checkIntegrity,
		directory,
		localChecks,
	};
}

export { capturePromptEvidence as default };
export type { PromptEvidence, PromptResources };
