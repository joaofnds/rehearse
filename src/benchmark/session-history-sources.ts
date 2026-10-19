import { basename, isAbsolute, relative, resolve } from "node:path";

import { z } from "zod";

import type { Immutable } from "./contracts";
import pathIsWithin from "./path-containment";
import type {
	CorpusFileLocation,
	SessionHistoryAttemptIdentity,
} from "./session-history-contract";
import declaredCorpusPath from "./session-history-corpus-path";
import type {
	MutableEvent,
	SourceIdentity,
} from "./session-history-event-contract";
import { locatorId } from "./session-history-location";
import type { HistoryBlockInput } from "./session-history-message";
import type { TranscriptLocation } from "./transcript";

/**
 * A skill is one source whether a Skill call or a slash command loaded it, so
 * both name it by the same path.
 */
function skillSource(skill: string): SourceIdentity {
	const path = `skills/${skill}/SKILL.md`;

	return { id: `skill:${path}`, kind: "skill", name: path, path };
}

interface HistoryToolCall {
	readonly toolName: string;
	readonly input: Readonly<HistoryBlockInput>;
}

interface HistoryTranscriptContext {
	readonly cwd: string | undefined;
	readonly location: Readonly<TranscriptLocation>;
}

interface HistoryCorpusContext {
	readonly kind: SessionHistoryAttemptIdentity["kind"];
	readonly resolvedCorpusFiles: readonly CorpusFileLocation[];
}

function sourceForCall(
	call: HistoryToolCall,
	context: HistoryTranscriptContext,
	corpus: HistoryCorpusContext,
): SourceIdentity {
	const source = skillCallSource(call);
	if (source !== undefined) {
		return source;
	}
	const { toolName } = call;
	const { location } = context;
	if (toolName !== "Read") {
		const id = locatorId(location);

		return {
			id: `tool-output:${id}`,
			kind: "tool-output",
			name: `${toolName} · ${id}`,
		};
	}

	return sourceForRead(call.input, context, corpus);
}

function unclassifiedSource(): SourceIdentity {
	return {
		id: "unclassified",
		kind: "unclassified",
		name: "Unclassified recorded content",
	};
}

function sourceForResult(
	call: Immutable<MutableEvent>,
): SourceIdentity | undefined {
	if (call.toolName !== "Skill") {
		return call.source;
	}

	return {
		id: `tool-output:${call.id}`,
		kind: "tool-output",
		name: `Skill result · ${call.id}`,
	};
}

function skillCallSource({
	toolName,
	input,
}: HistoryToolCall): SourceIdentity | undefined {
	if (toolName === "Skill") {
		const parsedSkill = z.string().nonempty().safeParse(input["skill"]);
		const skill = parsedSkill.success ? parsedSkill.data : undefined;
		if (skill !== undefined) {
			return skillSource(skill);
		}
	}

	return undefined;
}

function sourceForRead(
	input: Readonly<HistoryBlockInput>,
	{ cwd, location }: HistoryTranscriptContext,
	corpus: HistoryCorpusContext,
): SourceIdentity {
	const parsedPath = z.string().nonempty().safeParse(input["file_path"]);
	const observed = parsedPath.success ? parsedPath.data : undefined;
	if (observed === undefined) {
		return {
			id: `unclassified:${locatorId(location)}`,
			kind: "unclassified",
			name: "Unclassified recorded content",
		};
	}

	return declaredReadSource({ cwd, location, observed }, corpus);
}

interface ObservedReadPath extends HistoryTranscriptContext {
	readonly observed: string;
}

interface NormalizedReadPath extends ObservedReadPath {
	readonly normalizedObserved: string | undefined;
}

function normalizedReadPath(
	observed: string,
	normalizedCwd: string | undefined,
): string | undefined {
	if (isAbsolute(observed)) {
		return resolve(observed);
	}
	if (normalizedCwd !== undefined) {
		return resolve(normalizedCwd, observed);
	}
	return undefined;
}

function declaredReadSource(
	{ cwd, location, observed }: ObservedReadPath,
	{ kind, resolvedCorpusFiles }: HistoryCorpusContext,
): SourceIdentity {
	const normalizedCwd = cwd === undefined ? undefined : resolve(cwd);
	const normalizedObserved = normalizedReadPath(observed, normalizedCwd);
	const declaredCorpus = declaredCorpusPath(
		{ kind, normalizedCwd, normalizedObserved },
		resolvedCorpusFiles,
	);
	if (declaredCorpus !== undefined) {
		return {
			id: `corpus:${declaredCorpus}`,
			kind: "corpus",
			name: declaredCorpus,
			path: declaredCorpus,
		};
	}
	return recordedReadSource({ cwd, location, normalizedObserved, observed });
}

function recordedReadSource({
	cwd,
	location,
	observed,
	normalizedObserved,
}: NormalizedReadPath): SourceIdentity {
	if (cwd === undefined) {
		return isAbsolute(observed)
			? {
					id: `external:${observed}`,
					kind: "external",
					name: observed,
					path: observed,
				}
			: {
					id: `unclassified:${locatorId(location)}`,
					kind: "unclassified",
					name: "Unclassified recorded content",
				};
	}

	const savedCwd = resolve(cwd);
	const normalized = normalizedObserved ?? resolve(savedCwd, observed);
	if (!isAbsolute(observed) && !pathIsWithin(normalized, savedCwd)) {
		return {
			id: `unclassified:${locatorId(location)}`,
			kind: "unclassified",
			name: "Unclassified recorded content",
		};
	}

	return sourceUnderWorkingDirectory(normalized, savedCwd);
}

function sourceUnderWorkingDirectory(
	normalized: string,
	savedCwd: string,
): SourceIdentity {
	const corpusRoot = resolve(savedCwd, ".claude");
	if (pathIsWithin(normalized, corpusRoot)) {
		const path = relative(corpusRoot, normalized) || basename(normalized);

		return { id: `corpus:${path}`, kind: "corpus", name: path, path };
	}
	if (pathIsWithin(normalized, savedCwd)) {
		const path = relative(savedCwd, normalized) || basename(normalized);

		return { id: `project:${path}`, kind: "project", name: path, path };
	}

	return {
		id: `external:${normalized}`,
		kind: "external",
		name: normalized,
		path: normalized,
	};
}

export { skillSource, unclassifiedSource, sourceForCall, sourceForResult };
