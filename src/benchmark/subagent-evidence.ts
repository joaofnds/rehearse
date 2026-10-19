import { mkdir } from "node:fs/promises";
import { join } from "node:path";

import type { SubagentEvidence } from "./agent-tree";
import type { Immutable } from "./contracts";
import {
	lstatIfPresent,
	readdirIfPresent,
	textIfPresent,
} from "./file-presence";
import serialMap from "./serial-map";
import type { TranscriptLine } from "./transcript";

/**
 * The provider's name for a session's sub-agent directory, which the record
 * keeps under the same name beside its transcript.
 */
const SUBAGENTS_DIRECTORY = "subagents";

/** The ids the provider gives its agents, and so the names their files carry. */
const PROVIDER_AGENT_ID = "[a-z0-9]+";

const AGENT_ID = new RegExp(`^${PROVIDER_AGENT_ID}$`, "u");

const SUBAGENT_TRANSCRIPT = new RegExp(
	`^agent-(${PROVIDER_AGENT_ID})\\.jsonl$`,
	"u",
);

const SUBAGENT_FILE = new RegExp(
	`^agent-${PROVIDER_AGENT_ID}\\.(?:jsonl|meta\\.json)$`,
	"u",
);

const UNREADABLE = Symbol("unreadable");

/**
 * The provider writes each sub-agent's transcript and meta file under a
 * directory named for the session, beside the session's own `<sessionId>.jsonl`
 * and outside the directory the session ran in, so they survive only if the
 * record copies them.
 */
function providerSessionDirectory(sessionTranscript: string): string {
	return sessionTranscript.replace(/\.jsonl$/u, "");
}

/** A sub-agent file the provider wrote, as one walk of its directory found it. */
interface SubagentFiles {
	readonly source: string;
	readonly names: readonly string[];
	readonly complete: boolean;
}

/**
 * The session under test can write into its own session directory, so the walk
 * takes only a real directory and, in it, only regular files carrying the names
 * the provider gives them. A symlink there would copy whatever it points at into
 * the record. An entry it cannot read leaves the walk incomplete rather than
 * failing it, since the attempt that wrote it has already been paid for and its
 * record is worth more than the one file.
 */
async function subagentFiles(
	sessionTranscript: string,
): Promise<SubagentFiles> {
	const sessionDirectory = providerSessionDirectory(sessionTranscript);
	const source = join(sessionDirectory, SUBAGENTS_DIRECTORY);
	const directories = await readable(async () => {
		const session = await lstatIfPresent(sessionDirectory);
		const subagents =
			session?.isDirectory() === true
				? await lstatIfPresent(source)
				: undefined;

		return subagents?.isDirectory() === true;
	});
	if (directories !== true) {
		return { complete: directories !== UNREADABLE, names: [], source };
	}

	const entries = await readable(async () => await readdirIfPresent(source));
	if (entries === UNREADABLE) {
		return { complete: false, names: [], source };
	}

	return await regularSubagentFiles(source, entries ?? []);
}

async function regularSubagentFiles(
	source: string,
	entries: readonly string[],
): Promise<SubagentFiles> {
	const names: string[] = [];
	let complete = true;
	await Array.fromAsync(
		entries.filter((each) => SUBAGENT_FILE.test(each)),
		async (name) => {
			const entry = await readable(
				async () => await lstatIfPresent(join(source, name)),
			);
			if (entry === UNREADABLE) {
				complete = false;
			} else if (entry?.isFile() === true) {
				names.push(name);
			}
		},
	);

	return { complete, names, source };
}

/**
 * The result of a read, or `UNREADABLE` where the filesystem refused it, kept
 * apart from the `undefined` a missing path reads as.
 */
async function readable<T>(
	read: () => Promise<T>,
): Promise<T | typeof UNREADABLE> {
	try {
		return await read();
	} catch (error) {
		if (error instanceof Error && "code" in error) {
			return UNREADABLE;
		}

		throw error;
	}
}

/**
 * Copies the session's sub-agent files into the record. A file it cannot read
 * stays out of the record, and the agent it belongs to then reads as
 * unavailable there.
 */
async function preserveSubagentFiles(
	sessionTranscript: string,
	recordDirectory: string,
): Promise<void> {
	const { source, names } = await subagentFiles(sessionTranscript);
	const destination = join(recordDirectory, SUBAGENTS_DIRECTORY);

	await Array.fromAsync(names, async (name) => {
		const bytes = await readable(
			async () => await Bun.file(join(source, name)).bytes(),
		);
		if (bytes !== UNREADABLE) {
			await mkdir(destination, { recursive: true });
			await Bun.write(join(destination, name), bytes);
		}
	});
}

/**
 * Whether the record holds every sub-agent file the provider left, so removing
 * the provider's copies loses nothing. A directory or file the walk could not
 * read, or a copy the recording never made because it failed first, says no.
 */
async function subagentFilesRetained(
	sessionTranscript: string,
	recordDirectory: string,
): Promise<boolean> {
	const { names, complete } = await subagentFiles(sessionTranscript);
	if (!complete) {
		return false;
	}
	for await (const exists of serialMap(
		names.values(),
		async (name) =>
			await Bun.file(join(recordDirectory, SUBAGENTS_DIRECTORY, name)).exists(),
	)) {
		if (!exists) {
			return false;
		}
	}

	return true;
}

/**
 * The agents the session's lines name that left no transcript in the record.
 * The session wrote those names, so one outside the provider's id shape names
 * no file the record could hold and is never joined into a path.
 * Saying so lets a reader mark the session's sub-agent coverage incomplete,
 * where silence would read as an agent that ran nothing and cost nothing.
 */
async function unavailableSubagents(
	lines: Immutable<readonly TranscriptLine[]>,
	recordDirectory: string,
): Promise<readonly string[]> {
	const named = new Set(
		lines.map((line) => line.namedAgent).filter((id) => id !== undefined),
	);
	const unavailable: string[] = [];
	await Array.fromAsync(named, async (agentId) => {
		const transcript = join(
			recordDirectory,
			SUBAGENTS_DIRECTORY,
			`agent-${agentId}.jsonl`,
		);
		if (!AGENT_ID.test(agentId) || !(await Bun.file(transcript).exists())) {
			unavailable.push(agentId);
		}
	});

	return unavailable;
}

/**
 * The sub-agent files a record kept, one per transcript, with the agent's meta
 * file where the record holds one. A record written before sub-agent files
 * were kept reads as holding none. Only regular files are read, as when they
 * were copied in, so an entry that is not one reads as absent and its agent as
 * unavailable rather than failing the read or following a link out of the
 * record.
 */
async function recordedSubagents(
	recordDirectory: string,
): Promise<readonly SubagentEvidence[]> {
	const directory = join(recordDirectory, SUBAGENTS_DIRECTORY);
	const names = (await readdirIfPresent(directory)) ?? [];
	const agentIds = names
		.map((name) => subagentTranscriptAgentId(name))
		.filter((agentId) => agentId !== undefined)
		.toSorted();
	const subagents = await Promise.all(
		agentIds.map(async (agentId) => {
			const transcript = await regularFileText(
				join(directory, `agent-${agentId}.jsonl`),
			);
			const meta = await regularFileText(
				join(directory, `agent-${agentId}.meta.json`),
			);

			return { agentId, meta, transcript };
		}),
	);

	return subagents.filter(
		(each): each is SubagentEvidence => each.transcript !== undefined,
	);
}

/** The agent a sub-agent transcript's file name names, if it names one. */
function subagentTranscriptAgentId(name: string): string | undefined {
	const [, agentId] = SUBAGENT_TRANSCRIPT.exec(name) ?? [];
	return agentId;
}

async function regularFileText(path: string): Promise<string | undefined> {
	const entry = await lstatIfPresent(path);

	return entry?.isFile() === true ? await textIfPresent(path) : undefined;
}

export {
	SUBAGENTS_DIRECTORY,
	providerSessionDirectory,
	preserveSubagentFiles,
	subagentFilesRetained,
	unavailableSubagents,
	recordedSubagents,
	subagentTranscriptAgentId,
};
