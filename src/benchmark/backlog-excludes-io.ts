import { mkdir, open, readFile } from "node:fs/promises";
import { dirname } from "node:path";

const EMPTY_BYTE_COUNT = 0;

interface WorkflowExcludeAppend {
	readonly excludePath: string;
	readonly existing: Readonly<Buffer>;
	readonly missing: readonly string[];
}

interface ExcludeAppendWrite {
	readonly bytesWritten: number;
	readonly excludePath: string;
	readonly expectedBytes: number;
}

class ShortExcludeAppendError extends Error {
	public override readonly name = "ShortExcludeAppendError";
	public readonly bytesWritten: number;
	public readonly excludePath: string;
	public readonly expectedBytes: number;

	public constructor({
		bytesWritten,
		excludePath,
		expectedBytes,
	}: ExcludeAppendWrite) {
		super(
			`Git exclude append wrote ${bytesWritten} of ${expectedBytes} bytes: ${excludePath}`,
		);
		this.bytesWritten = bytesWritten;
		this.excludePath = excludePath;
		this.expectedBytes = expectedBytes;
	}
}

async function readExcludePatterns(excludePath: string): Promise<Buffer> {
	try {
		return await readFile(excludePath);
	} catch (error) {
		if (
			!(error instanceof Error && "code" in error && error.code === "ENOENT")
		) {
			throw error;
		}

		return Buffer.alloc(EMPTY_BYTE_COUNT);
	}
}

async function appendExcludePatterns({
	excludePath,
	existing,
	missing,
}: WorkflowExcludeAppend): Promise<void> {
	const separator =
		existing.length === EMPTY_BYTE_COUNT ||
		existing.toString("utf8").endsWith("\n")
			? ""
			: "\n";
	const bytes = Buffer.from(`${separator}${missing.join("\n")}\n`);

	await mkdir(dirname(excludePath), { recursive: true });

	await using file = await open(excludePath, "a");
	const { bytesWritten } = await file.write(bytes);
	if (bytesWritten !== bytes.length) {
		throw new ShortExcludeAppendError({
			bytesWritten,
			excludePath,
			expectedBytes: bytes.length,
		});
	}
}

export { ShortExcludeAppendError, appendExcludePatterns, readExcludePatterns };
