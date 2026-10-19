import type { AgentMeta } from "./agent-metadata";
import type { AgentLinkBasis, AgentParent } from "./agent-tree-contract";
import type { Immutable } from "./contracts";
import { parseTranscript } from "./transcript";
import type { TranscriptLine } from "./transcript";

const FIRST_TOOL_RESULT_INDEX = 0;

const ROOT = Symbol("root");

type Owner = typeof ROOT | string;

interface Located {
	readonly owner: Owner;
	readonly line: number;
}

interface LaunchCall extends Located {
	readonly name: string;
}

interface NamingResult extends Located {
	readonly toolUseId: string | undefined;
}

/**
 * An agent's parent, the place its launch was recorded, if any was, and the
 * launching call's line where the call itself was found.
 */
interface AgentLink {
	readonly parent: AgentParent;
	readonly launch: Located | undefined;
	readonly callLine: number | undefined;
}

interface LaunchIndex {
	readonly calls: ReadonlyMap<string, LaunchCall>;
	readonly results: ReadonlyMap<string, NamingResult>;
}

class LaunchIndexBuilder {
	private readonly calls = new Map<string, LaunchCall>();
	private readonly results = new Map<string, NamingResult>();
	public addTranscript(owner: Owner, transcript: string): void {
		for (const parsed of parseTranscript(transcript)) {
			this.addCalls(owner, parsed);
			this.addResult(owner, parsed);
		}
	}
	public get value(): LaunchIndex {
		return { calls: this.calls, results: this.results };
	}
	private addCalls(owner: Owner, parsed: Immutable<TranscriptLine>): void {
		for (const { use, toolUseId } of parsed.locatedToolUses) {
			if (toolUseId !== undefined && !this.calls.has(toolUseId)) {
				this.calls.set(toolUseId, { line: parsed.line, name: use.name, owner });
			}
		}
	}
	private addResult(owner: Owner, parsed: Immutable<TranscriptLine>): void {
		const agentId = parsed.namedAgent;
		if (agentId !== undefined && !this.results.has(agentId)) {
			this.results.set(agentId, {
				line: parsed.line,
				owner,
				toolUseId:
					parsed.locatedToolResults[FIRST_TOOL_RESULT_INDEX]?.toolUseId,
			});
		}
	}
}
function launchIndex(transcripts: ReadonlyMap<Owner, string>): LaunchIndex {
	const builder = new LaunchIndexBuilder();
	for (const [owner, transcript] of transcripts) {
		builder.addTranscript(owner, transcript);
	}

	return builder.value;
}

function parentFor(
	agentId: string,
	meta: Readonly<AgentMeta>,
	index: LaunchIndex,
): AgentLink {
	const result = index.results.get(agentId);
	const answered =
		result?.toolUseId === undefined
			? undefined
			: index.calls.get(result.toolUseId);
	if (meta.parentAgentId !== undefined) {
		return {
			callLine:
				answered?.owner === meta.parentAgentId ? answered.line : undefined,
			launch: result,
			parent: {
				agentId: meta.parentAgentId,
				basis: "parent agent id",
				state: "agent",
			},
		};
	}

	const call =
		meta.toolUseId === undefined ? undefined : index.calls.get(meta.toolUseId);
	if (call !== undefined) {
		return {
			callLine: call.line,
			launch: call,
			parent: linkTo(call.owner, "launch call"),
		};
	}

	if (result === undefined) {
		return {
			callLine: undefined,
			launch: undefined,
			parent: { state: "unlinked" },
		};
	}

	return {
		callLine: answered?.line,
		launch: result,
		parent: linkTo(
			result.owner,
			answered?.name === "Skill" ? "skill result" : "agent result",
		),
	};
}

function linkTo(owner: Owner, basis: AgentLinkBasis): AgentParent {
	return owner === ROOT
		? { basis, state: "root" }
		: { agentId: owner, basis, state: "agent" };
}

interface AgentInheritanceContext {
	readonly links: ReadonlyMap<string, AgentLink>;
	readonly prefixLinesExcluded: number | undefined;
}

function isInherited(
	agentId: string,
	{ links, prefixLinesExcluded }: AgentInheritanceContext,
	seen: ReadonlySet<string> = new Set(),
): boolean {
	const link = links.get(agentId);
	if (link === undefined || seen.has(agentId)) {
		return false;
	}

	const { launch, parent } = link;
	if (
		launch?.owner === ROOT &&
		prefixLinesExcluded !== undefined &&
		launch.line <= prefixLinesExcluded
	) {
		return true;
	}

	return (
		parent.state === "agent" &&
		isInherited(
			parent.agentId,
			{ links, prefixLinesExcluded },
			new Set([...seen, agentId]),
		)
	);
}

export { ROOT, launchIndex, parentFor, isInherited };
export type { Owner, AgentLink };
