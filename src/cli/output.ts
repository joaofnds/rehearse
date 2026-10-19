import { CONTROL_DIR } from "#benchmark/config";
import type { SignalStopDiagnostics } from "#benchmark/stop-on-signal";

interface CommandOutput {
	readonly stdout: (text: string) => void;
	readonly stderr: (text: string) => void;
	readonly flush?: (() => Promise<void>) | undefined;
}

async function writeStderrAfter(
	previous: Promise<void>,
	text: string,
): Promise<void> {
	await previous;
	await Bun.write(Bun.stderr, text);
}

function processCommandOutput(): CommandOutput {
	let pendingWrites = Promise.resolve();
	return {
		flush: async () => {
			await pendingWrites;
		},
		stderr: (text) => {
			pendingWrites = writeStderrAfter(pendingWrites, text);
		},
		stdout: (text) => {
			process.stdout.write(text);
		},
	};
}

const processOutput = processCommandOutput();

/**
 * The only thing stdout carries: the strict record a command wrote, or the
 * path to it. Every command answers `--json` the same way, so the rule lives
 * here rather than at each command's last line.
 */
async function writeRecord(
	output: CommandOutput,
	recordFile: string,
	json: boolean,
): Promise<void> {
	output.stdout(json ? await Bun.file(recordFile).text() : `${recordFile}\n`);
}

/**
 * A harness function's progress writer, bound to the command's stderr. The
 * pipeline's own functions take one rather than printing, so a caller reading
 * stdout for the record never has to separate it from the progress beside it.
 */
function diagnosticWriter(output: CommandOutput): (message: string) => void {
	return (message) => {
		output.stderr(`${message}\n`);
	};
}

function signalDiagnostics(output: CommandOutput): SignalStopDiagnostics {
	return {
		flush: async () => {
			await output.flush?.();
		},
		log: diagnosticWriter(output),
	};
}

function writeDiagnostic(output: CommandOutput, message?: string): void {
	if (message === undefined) {
		return;
	}

	diagnosticWriter(output)(message);
}

/**
 * A record a command could not read, named by the id `show` accepts back and
 * by the reason. A short id registry is named by its directory instead, such
 * as `short-ids/<case>`, which `show` does not accept. Every listing collects
 * these rather than throwing, because one half-written record must not hide
 * the ones beside it.
 */
interface UnreadableRecord {
	readonly id: string;
	readonly reason: string;
}

/**
 * A reason is printed for a person, and the README tells a session to paste it
 * onto a card others read: a filesystem error names an absolute path, and
 * under the control root that discloses the home directory while naming the
 * same file the control-relative path names.
 */
function controlRelative(reason: string): string {
	return reason.replaceAll(`${CONTROL_DIR}/`, "");
}

/**
 * Where an unreadable record goes: stderr, one line each, before the answers
 * that did read. Every command that reads more than one record answers this
 * the same way, so the rule lives here rather than at each command's own loop.
 */
function writeUnreadable(
	output: CommandOutput,
	unreadable: readonly UnreadableRecord[],
): void {
	for (const { id, reason } of unreadable) {
		output.stderr(`${id}: ${reason}\n`);
	}
}

export {
	controlRelative,
	diagnosticWriter,
	processOutput,
	signalDiagnostics,
	writeDiagnostic,
	writeRecord,
	writeUnreadable,
};
export type { CommandOutput, UnreadableRecord };
