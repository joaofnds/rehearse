import { createHash } from "node:crypto";
import { join } from "node:path";
import { CommandError, runCommand } from "./command";
import { MAX_CONTEXT_FILE_BYTES, MAX_CONTEXT_TOTAL_BYTES } from "./config";
import type { ContextFile, LocalCheckResult } from "./contracts";
import type { TargetCheck } from "./pipeline";

class TargetCheckLaunchError extends Error {
	public override name = "TargetCheckLaunchError";

	public constructor(
		public readonly command: readonly string[],
		cause: Readonly<Error>,
	) {
		super(`Target check could not launch: ${command.join(" ")}`, { cause });
	}
}

export async function runChecks(
	targetDir: string,
	label: string,
	checks: readonly TargetCheck[],
	log: (message: string) => void,
): Promise<void> {
	log(`\n${label}`);

	for (const check of checks) {
		try {
			await runCommand(check.command, targetDir, { env: check.env });
		} catch (error) {
			if (error instanceof CommandError) {
				throw error;
			}

			const cause = error instanceof Error ? error : new Error(String(error));
			throw new TargetCheckLaunchError(check.command, cause);
		}
	}
}

export async function captureTreatmentChecks(
	targetDir: string,
	checks: readonly TargetCheck[],
	log: (message: string) => void,
): Promise<LocalCheckResult> {
	try {
		await runChecks(targetDir, "Treatment checks", checks, log);
		return {
			status: "PASS",
			evidence: [
				{
					source: "local-checks",
					path: checks.map(({ command }) => command.join(" ")).join("; "),
					claim: "All treatment checks exited successfully",
				},
			],
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
			status: "FAIL",
			evidence: [
				{
					source: "local-checks",
					path: command,
					claim: `Treatment check exited ${exitCode}`,
				},
			],
		};
	}
}

export async function captureFileHashes(
	directory: string,
	integrityFiles: readonly string[],
): Promise<Map<string, string>> {
	const hashes = new Map<string, string>();

	for (const path of integrityFiles) {
		const file = Bun.file(join(directory, path));
		const exists = await file.exists();
		if (!exists) {
			throw new Error(`Declared check-integrity file is missing: ${path}`);
		}

		const content = await file.bytes();
		hashes.set(path, createHash("sha256").update(content).digest("hex"));
	}

	return hashes;
}

export async function captureCheckIntegrity(
	directory: string,
	baselineHashes: ReadonlyMap<string, string>,
): Promise<LocalCheckResult> {
	const changedPaths: string[] = [];

	for (const [path, baselineHash] of baselineHashes) {
		const file = Bun.file(join(directory, path));
		if (!(await file.exists())) {
			changedPaths.push(path);
			continue;
		}

		const treatmentHash = createHash("sha256")
			.update(await file.bytes())
			.digest("hex");
		if (treatmentHash !== baselineHash) {
			changedPaths.push(path);
		}
	}
	const integrityFiles = [...baselineHashes.keys()];

	return {
		status: changedPaths.length === 0 ? "PASS" : "FAIL",
		evidence: [
			{
				source: "local-checks",
				path: integrityFiles.join(", "),
				claim:
					changedPaths.length === 0
						? "Check scripts and configurations match the baseline"
						: `Build modified check definitions: ${changedPaths.join(", ")}`,
			},
		],
	};
}

export async function captureBoundedContent(
	file: ReturnType<typeof Bun.file>,
): Promise<string> {
	if (file.size > MAX_CONTEXT_FILE_BYTES) {
		return `[${file.size} bytes omitted: exceeds the ${MAX_CONTEXT_FILE_BYTES}-byte capture limit]`;
	}

	const bytes = await file.bytes();
	if (bytes.subarray(0, 8192).includes(0)) {
		return "[binary file omitted]";
	}

	return new TextDecoder().decode(bytes);
}

export async function captureBaselineContext(
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

	for (const path of trackedPaths) {
		const file = Bun.file(join(directory, path));
		if (!(await file.exists())) {
			continue;
		}

		if (totalBytes + file.size > MAX_CONTEXT_TOTAL_BYTES) {
			context.push({
				path,
				content: "[omitted: total capture budget exhausted]",
			});
			continue;
		}

		const content = await captureBoundedContent(file);
		context.push({ path, content });
		totalBytes += content.length;
	}

	return context;
}

/**
 * Prepares a freshly created worktree so the target's checks can run in it. A
 * worktree carries only tracked files, so a target whose checks need installed
 * dependencies fails in one until its setup has run. Every rep installs its
 * own, because reps that shared a tree would not be independent.
 */
export async function runSetup(
	targetDir: string,
	setup: readonly TargetCheck[] | undefined,
	log: (message: string) => void,
): Promise<void> {
	if (setup === undefined) {
		return;
	}

	await runChecks(targetDir, "Target setup", setup, log);
}
