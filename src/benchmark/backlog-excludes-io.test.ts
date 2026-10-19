import { describe, expect, it } from "bun:test";
import { lstat, readFile } from "node:fs/promises";

import {
	appendExcludePatterns,
	readExcludePatterns,
} from "./backlog-excludes-io";
import {
	ExcludeAppendReaders,
	captureBothReaders,
	capturedBytes,
	createExcludeFixture,
	excludeAlias,
	excludeMetadata,
	rootedPatterns,
	worktreeStatuses,
} from "./backlog-excludes-test-support";
import excludeWorkflowState from "./backlog-workflow-excludes";
import { TestResources } from "./test-support";

const resources = TestResources.forEachTest();
const PREFIX_START = 0;
const LARGE_PATTERN_CHARACTER_COUNT = 4096;
const prefixes = [
	{ name: "empty file", prefix: Buffer.from("") },
	{
		name: "CRLF and blank lines",
		prefix: Buffer.from("# keep spacing\r\n\r\n"),
	},
	{ name: "unterminated line", prefix: Buffer.from("# keep spacing") },
	{ name: "invalid UTF-8", prefix: Buffer.from("fffe0a", "hex") },
];

interface ExcludePrefix {
	readonly name: string;
	readonly prefix: Readonly<Buffer<ArrayBuffer>>;
}

async function retainsBothReaders({ prefix }: ExcludePrefix): Promise<void> {
	const fixture = await createExcludeFixture(resources, prefix);
	await using readers = new ExcludeAppendReaders();
	await captureBothReaders(readers, fixture);
	expect(await capturedBytes(fixture)).toEqual([prefix, prefix]);

	await readers.append();
	const contents = await readFile(fixture.excludePath);

	expect(contents.subarray(PREFIX_START, prefix.length)).toEqual(prefix);
	expect(await rootedPatterns(fixture.excludePath)).toEqual([
		"/backlog.config.yml",
		"/board-left/",
		"/board-right/",
	]);
	expect(await worktreeStatuses(fixture)).toEqual(["", ""]);
}

async function preservesFileIdentity(
	kind: "regular" | "symlink" | "hardlink",
): Promise<void> {
	const prefix = Buffer.from("# keep spacing\n");
	const fixture = await createExcludeFixture(resources, prefix);
	const path = await excludeAlias(fixture.excludePath, kind);
	const before = await excludeMetadata(path);

	await appendExcludePatterns({
		excludePath: path,
		existing: await readExcludePatterns(path),
		missing: ["/board-left/"],
	});
	const after = await lstat(path);

	expect(await excludeMetadata(path)).toEqual(before);
	expect(await readFile(fixture.excludePath)).toEqual(
		Buffer.concat([prefix, Buffer.from("/board-left/\n")]),
	);
	expect(after.isSymbolicLink()).toBe(kind === "symlink");
}

async function retainsRepeatedUpdates(): Promise<void> {
	const fixture = await createExcludeFixture(
		resources,
		Buffer.from("# keep spacing"),
	);
	await excludeWorkflowState(fixture.primary);
	await excludeWorkflowState(fixture.linked);
	const before = await readFile(fixture.excludePath);

	await excludeWorkflowState(fixture.primary);
	await excludeWorkflowState(fixture.linked);

	expect(await readFile(fixture.excludePath)).toEqual(before);
	expect(await worktreeStatuses(fixture)).toEqual(["", ""]);
}

async function continuesAfterInterruption(): Promise<void> {
	const fixture = await createExcludeFixture(
		resources,
		Buffer.from("# keep spacing\n"),
	);
	await using readers = new ExcludeAppendReaders();
	await captureBothReaders(readers, fixture);
	await readers.stop();

	await excludeWorkflowState(fixture.primary);
	await excludeWorkflowState(fixture.linked);

	expect(await worktreeStatuses(fixture)).toEqual(["", ""]);
}

async function reportsRetainedShortAppend(): Promise<void> {
	const prefix = Buffer.from("# retained prefix\n");
	const fixture = await createExcludeFixture(resources, prefix);
	const payload = Buffer.from(
		`/${"x".repeat(LARGE_PATTERN_CHARACTER_COUNT)}\n`,
	);
	await using readers = new ExcludeAppendReaders();

	const report = await readers.shortAppend({
		excludePath: fixture.excludePath,
		missing: [payload.toString("utf8").trimEnd()],
	});
	const retained = await readFile(fixture.excludePath);

	expect(report).toEqual({
		bytesWritten: retained.length - prefix.length,
		excludePath: fixture.excludePath,
		expectedBytes: payload.length,
		message: `Git exclude append wrote ${retained.length - prefix.length} of ${payload.length} bytes: ${fixture.excludePath}`,
		name: "ShortExcludeAppendError",
	});
	expect(report.bytesWritten).toBeGreaterThan(PREFIX_START);
	expect(report.bytesWritten).toBeLessThan(payload.length);
	expect(retained).toEqual(
		Buffer.concat([prefix, payload]).subarray(PREFIX_START, retained.length),
	);
}

function concurrentAppends(): void {
	it.each(prefixes)(
		"retains both stale readers' patterns and the $name prefix",
		retainsBothReaders,
	);
}

function fileIdentity(): void {
	it.each(["regular", "symlink", "hardlink"] as const)(
		"preserves file identity and permissions through a %s destination",
		preservesFileIdentity,
	);
}

function repeatedAndInterruptedUpdates(): void {
	it(
		"leaves bytes unchanged when both worktrees repeat their ordinary update",
		retainsRepeatedUpdates,
	);
	it(
		"allows an ordinary update after both paused writers are killed",
		continuesAfterInterruption,
	);
}

describe("private workflow exclude updates", () => {
	describe("when worktrees read the same old file", concurrentAppends);
	describe("when the destination already exists", fileIdentity);
	describe(
		"when updates repeat or are interrupted",
		repeatedAndInterruptedUpdates,
	);
	describe("when the filesystem writes only part of the append", () => {
		it(
			"reports the failure and retains the written prefix",
			reportsRetainedShortAppend,
		);
	});
});
