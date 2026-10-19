import { LINE_TERMINATOR_WIDTH } from "./evidence-quote";

const DIFF_FILE_HEADER_PREFIX = "--- ";

interface DiffLine {
	readonly text: string;
	/** Where the line starts in the whole diff. */
	readonly offset: number;
}

interface DiffHunk {
	readonly file: string;
	readonly header: string;
	/** The file's own header lines, before its first hunk only. */
	readonly fileHeader: readonly DiffLine[];
	readonly headerLine: DiffLine;
	readonly lines: readonly DiffLine[];
}

const HUNK_HEADER = /^@@ [^@]* @@/u;

function diffFileName(line: string): string {
	return line.slice(DIFF_FILE_HEADER_PREFIX.length).replace(/^[ab]\//u, "");
}

const INITIAL_DIFF_OFFSET = 0;
interface MutableDiffHunk {
	readonly file: string;
	readonly header: string;
	readonly fileHeader: DiffLine[];
	readonly headerLine: DiffLine;
	readonly lines: DiffLine[];
}
class DiffHunkReader {
	private readonly parsed: MutableDiffHunk[] = [];
	private removed = "";
	private file = "";
	private fileHeader: DiffLine[] = [];
	private current: MutableDiffHunk | undefined = undefined;
	private offset = INITIAL_DIFF_OFFSET;
	public include(line: string): void {
		const start = this.offset;
		this.offset += line.length + LINE_TERMINATOR_WIDTH;
		if (line.startsWith("diff --git ")) {
			this.startFile(line, start);
			return;
		}

		this.updateFileNames(line);
		const [header] = HUNK_HEADER.exec(line) ?? [];
		if (header === undefined) {
			this.appendLine(line, start);
		} else {
			this.startHunk(line, start, header);
		}
	}
	private startFile(line: string, start: number): void {
		this.current = undefined;
		this.fileHeader = [{ offset: start, text: line }];
	}
	private updateFileNames(line: string): void {
		if (this.current !== undefined) {
			return;
		}

		if (line.startsWith("--- ")) {
			this.removed = diffFileName(line);
		}
		if (line.startsWith("+++ ")) {
			this.file = line === "+++ /dev/null" ? this.removed : diffFileName(line);
		}
	}
	private appendLine(line: string, start: number): void {
		if (this.current === undefined) {
			this.fileHeader.push({ offset: start, text: line });
		} else {
			this.current.lines.push({ offset: start, text: line });
		}
	}
	private startHunk(line: string, start: number, header: string): void {
		this.current = {
			file: this.file,
			fileHeader: this.fileHeader,
			header,
			headerLine: { offset: start, text: line },
			lines: [],
		};
		this.parsed.push(this.current);
		this.fileHeader = [];
	}
	public get value(): DiffHunk[] {
		return this.parsed;
	}
}
/**
 * The hunks of a unified diff, each under the file it changes: the `+++` name,
 * or the `---` name for a deleted file.
 */
function diffHunks(diff: string): DiffHunk[] {
	const reader = new DiffHunkReader();
	for (const line of diff.split("\n")) {
		reader.include(line);
	}

	return reader.value;
}

export { diffHunks as default };
export type { DiffHunk, DiffLine };
