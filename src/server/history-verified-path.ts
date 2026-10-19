import { lstat, realpath } from "node:fs/promises";
import { resolve } from "node:path";

import { z } from "zod";

import pathIsWithin from "#benchmark/path-containment";
import serialMap from "#benchmark/serial-map";
import {
	SessionHistoryReaderError,
	parseIdentity,
} from "#server/history-read-identity";

const fileErrorSchema = z.object({ code: z.string() }).loose();

async function undefinedWhenMissing<T>(
	operation: () => Promise<T>,
): Promise<T | undefined> {
	try {
		return await operation();
	} catch (error) {
		const parsed = fileErrorSchema.safeParse(error);
		if (
			parsed.success &&
			(parsed.data.code === "ENOENT" || parsed.data.code === "ENOTDIR")
		) {
			return undefined;
		}

		throw error;
	}
}

async function lstatWhenPresent(
	path: string,
): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
	return await undefinedWhenMissing(async () => await lstat(path));
}

async function realpathWhenPresent(path: string): Promise<string | undefined> {
	return await undefinedWhenMissing(async () => await realpath(path));
}

async function canonicalRunsRoot(runsDirectory: string): Promise<string> {
	const root = await realpathWhenPresent(runsDirectory);
	if (root === undefined) {
		throw new SessionHistoryReaderError("not-found", "No saved run directory");
	}

	return root;
}

async function verifiedDirectory(
	root: string,
	segments: readonly string[],
): Promise<string> {
	const directory = await verifiedDirectoryWhenPresent(root, segments);
	if (directory === undefined) {
		throw new SessionHistoryReaderError(
			"not-found",
			"No saved attempt at this identity",
		);
	}

	return directory;
}

/**
 * The absent directory is the only outcome this returns rather than throws.
 * A caller that falls back on absence must still be refused a traversing or
 * symlinked segment, so catching the thrown refusal instead of separating the
 * two would turn a refusal into a read.
 */
async function verifiedDirectoryWhenPresent(
	root: string,
	segments: readonly string[],
): Promise<string | undefined> {
	let current = root;
	for await (const status of serialMap(segments.values(), async (segment) => {
		current = resolve(current, parseIdentity(segment));
		return await directoryStatusWhenPresent(current);
	})) {
		if (status === undefined) {
			return undefined;
		}

		const canonical = await realpathWhenPresent(current);
		if (canonical === undefined || !pathIsWithin(canonical, root)) {
			throw new SessionHistoryReaderError(
				"refused",
				"Saved-attempt path leaves the runs directory",
			);
		}

		current = canonical;
	}

	return current;
}

async function directoryStatusWhenPresent(
	path: string,
): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
	const status = await lstatWhenPresent(path);
	if (
		status !== undefined &&
		(status.isSymbolicLink() || !status.isDirectory())
	) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved-attempt path is not a real directory",
		);
	}

	return status;
}

interface VerifiedFileRequest {
	readonly directory: string;
	readonly name: string;
	readonly required: boolean;
}

function verifiedFile(
	root: string,
	request: VerifiedFileRequest & { readonly required: true },
): Promise<string>;
function verifiedFile(
	root: string,
	request: VerifiedFileRequest & { readonly required: false },
): Promise<string | undefined>;
async function verifiedFile(
	root: string,
	{ directory, name, required }: VerifiedFileRequest,
): Promise<string | undefined> {
	const path = resolve(directory, parseIdentity(name));
	const status = await regularFileStatusWhenPresent(path);
	if (status === undefined) {
		if (required) {
			throw new SessionHistoryReaderError(
				"not-found",
				"Saved-attempt evidence is unavailable",
			);
		}

		return undefined;
	}

	const canonical = await realpathWhenPresent(path);
	if (canonical === undefined || !pathIsWithin(canonical, root)) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved-attempt evidence leaves the runs directory",
		);
	}

	return canonical;
}

async function regularFileStatusWhenPresent(
	path: string,
): Promise<Awaited<ReturnType<typeof lstat>> | undefined> {
	const status = await lstatWhenPresent(path);
	if (status !== undefined && (status.isSymbolicLink() || !status.isFile())) {
		throw new SessionHistoryReaderError(
			"refused",
			"Saved-attempt evidence is not a real file",
		);
	}

	return status;
}

export {
	canonicalRunsRoot,
	verifiedDirectory,
	verifiedDirectoryWhenPresent,
	verifiedFile,
};
