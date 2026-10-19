import { createHash } from "node:crypto";
import { join } from "node:path";

import { CommandError, runCommand } from "./command";
import { MAX_CONTEXT_FILE_BYTES, MAX_CONTEXT_TOTAL_BYTES } from "./config";
import type { ContextFile, LocalCheckResult } from "./contracts";
import type { TargetCheck } from "./pipeline";

const PREFIX_START_INDEX = 0;

const EMPTY_COLLECTION_LENGTH = 0;

const BINARY_PROBE_BYTES = 8192;
const NUL_BYTE = 0;

class TargetCheckLaunchError extends Error {
	public override name = "TargetCheckLaunchError";

	public constructor(
		public readonly command: readonly string[],
		cause: Readonly<Error>,
	) {
		super(`Target check could not launch: ${command.join(" ")}`, { cause });
	}
}
interface TargetCheckSuite {
	readonly label: string;
	readonly checks: readonly TargetCheck[];
}

async function runChecks(
	targetDir: string,
	{ label, checks }: TargetCheckSuite,
	log: (message: string) => void,
): Promise<void> {
	log(`\n${label}`);

	await Array.fromAsync(checks, async (check) => {
		try {
			await runCommand(check.command, targetDir, { env: check.env });
		} catch (error) {
			if (error instanceof CommandError) {
				throw error;
			}

			const cause = error instanceof Error ? error : new Error(String(error));
			throw new TargetCheckLaunchError(check.command, cause);
		}
	});
}

async function captureTreatmentChecks(
	targetDir: string,
	checks: readonly TargetCheck[],
	log: (message: string) => void,
): Promise<LocalCheckResult> {
	try {
		await runChecks(targetDir, { checks, label: "Treatment checks" }, log);
		return {
			evidence: [
				{
					claim: "All treatment checks exited successfully",
					path: checks.map(({ command }) => command.join(" ")).join("; "),
					source: "local-checks",
				},
			],
			status: "PASS",
		};
	} catch (error) {
		let command = "unknown command";
		if (
			error instanceof CommandError ||
			error instanceof TargetCheckLaunchError
		) {
			command = error.command.join(" ");
		}
		const exitCode = error instanceof CommandError ? error.exitCode : "unknown";
		log(`Treatment check failed: ${command} exited ${exitCode}`);

		return {
			evidence: [
				{
					claim: `Treatment check exited ${exitCode}`,
					path: command,
					source: "local-checks",
				},
			],
			status: "FAIL",
		};
	}
}

async function captureFileHashes(
	directory: string,
	integrityFiles: readonly string[],
): Promise<Map<string, string>> {
	const hashes = new Map<string, string>();

	await Array.fromAsync(integrityFiles, async (path) => {
		const file = Bun.file(join(directory, path));
		const exists = await file.exists();
		if (!exists) {
			throw new Error(`Declared check-integrity file is missing: ${path}`);
		}

		const content = await file.bytes();
		hashes.set(path, createHash("sha256").update(content).digest("hex"));
	});

	return hashes;
}

async function captureCheckIntegrity(
	directory: string,
	baselineHashes: ReadonlyMap<string, string>,
): Promise<LocalCheckResult> {
	const changedPaths: string[] = [];

	await Array.fromAsync(baselineHashes, async ([path, baselineHash]) => {
		const file = Bun.file(join(directory, path));
		if (!(await file.exists())) {
			changedPaths.push(path);
			return;
		}

		const treatmentHash = createHash("sha256")
			.update(await file.bytes())
			.digest("hex");
		if (treatmentHash !== baselineHash) {
			changedPaths.push(path);
		}
	});
	const integrityFiles = [...baselineHashes.keys()];

	return {
		evidence: [
			{
				claim:
					changedPaths.length === EMPTY_COLLECTION_LENGTH
						? "Check scripts and configurations match the baseline"
						: `Build modified check definitions: ${changedPaths.join(", ")}`,
				path: integrityFiles.join(", "),
				source: "local-checks",
			},
		],
		status: changedPaths.length === EMPTY_COLLECTION_LENGTH ? "PASS" : "FAIL",
	};
}

async function captureBoundedContent(
	file: ReturnType<typeof Bun.file>,
): Promise<string> {
	if (file.size > MAX_CONTEXT_FILE_BYTES) {
		return `[${file.size} bytes omitted: exceeds the ${MAX_CONTEXT_FILE_BYTES}-byte capture limit]`;
	}

	const bytes = await file.bytes();
	if (
		bytes.subarray(PREFIX_START_INDEX, BINARY_PROBE_BYTES).includes(NUL_BYTE)
	) {
		return "[binary file omitted]";
	}

	return new TextDecoder().decode(bytes);
}

async function captureBaselineContext(
	directory: string,
): Promise<ContextFile[]> {
	const context: ContextFile[] = [];
	const trackedOutput = await runCommand(["git", "ls-files"], directory);
	const trackedPaths = trackedOutput
		.trim()
		.split("\n")
		.filter(Boolean)
		.filter((path) => path !== "bun.lock");
	let totalBytes = 0;

	await Array.fromAsync(trackedPaths, async (path) => {
		const file = Bun.file(join(directory, path));
		if (!(await file.exists())) {
			return;
		}

		if (totalBytes + file.size > MAX_CONTEXT_TOTAL_BYTES) {
			context.push({
				content: "[omitted: total capture budget exhausted]",
				path,
			});
			return;
		}

		const content = await captureBoundedContent(file);
		context.push({ content, path });
		totalBytes += content.length;
	});

	return context;
}

/**
 * Prepares a freshly created worktree so the target's checks can run in it. A
 * worktree carries only tracked files, so a target whose checks need installed
 * dependencies fails in one until its setup has run. Every rep installs its
 * own, because reps that shared a tree would not be independent.
 */
async function runSetup(
	targetDir: string,
	setup: readonly TargetCheck[] | undefined,
	log: (message: string) => void,
): Promise<void> {
	if (setup === undefined) {
		return;
	}

	await runChecks(targetDir, { checks: setup, label: "Target setup" }, log);
}

export {
	runChecks,
	captureTreatmentChecks,
	captureFileHashes,
	captureCheckIntegrity,
	captureBoundedContent,
	captureBaselineContext,
	runSetup,
};
