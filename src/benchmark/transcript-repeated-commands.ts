import type { z } from "zod";

import type { Immutable } from "./contracts";
import type {
	TranscriptLocation,
	repeatedBashCommandSchema,
} from "./transcript-diagnostics-contract";
import { MAX_PREVIEW_CODE_UNITS } from "./transcript-diagnostics-contract";
import type {
	IdentifiedToolUse,
	LocatedDiagnosticIssue,
	LocatedToolUse,
	LocatedToolUseMap,
	RepeatedBashDiagnostics,
} from "./transcript-line-contract";

const SINGLE_COMMAND_OCCURRENCE_COUNT = 1;

const SINGLE_ITEM_COUNT = 1;
const COMMAND_CHARACTER_COUNT_INCREMENT = 1;

class BashCommandOccurrences {
	private readonly grouped = new Map<string, IdentifiedToolUse[]>();
	private readonly issues: LocatedDiagnosticIssue[] = [];
	public constructor(private readonly usesById: LocatedToolUseMap) {}
	public observe(use: Immutable<LocatedToolUse>): void {
		if (use.use.name !== "Bash") {
			return;
		}

		const { command } = use.use.input;
		if (command === undefined) {
			this.issues.push({
				kind: "invalid-bash-command",
				location: use.location,
			});
			return;
		}

		this.observeCommand({
			command,
			location: use.location,
			toolUseId: use.toolUseId,
		});
	}
	private observeCommand({
		command,
		location,
		toolUseId,
	}: BashCommandObservation): void {
		if (
			toolUseId === undefined ||
			this.usesById.get(toolUseId)?.length !== SINGLE_ITEM_COUNT
		) {
			return;
		}
		const occurrences = this.grouped.get(command) ?? [];
		occurrences.push({ location, toolUseId });
		this.grouped.set(command, occurrences);
	}

	public diagnostics(): RepeatedBashDiagnostics {
		return {
			commands: [...this.grouped]
				.filter(
					([_command, occurrences]) =>
						occurrences.length > SINGLE_COMMAND_OCCURRENCE_COUNT,
				)
				.map(([command, occurrences]) =>
					describeRepeatedCommand(command, occurrences),
				),
			issues: this.issues,
		};
	}
}

function repeatedBashCommands(
	uses: Immutable<readonly LocatedToolUse[]>,
	usesById: LocatedToolUseMap,
): RepeatedBashDiagnostics {
	const occurrences = new BashCommandOccurrences(usesById);
	for (const use of uses) {
		occurrences.observe(use);
	}
	return occurrences.diagnostics();
}

function describeRepeatedCommand(
	command: string,
	occurrences: Immutable<readonly IdentifiedToolUse[]>,
): z.infer<typeof repeatedBashCommandSchema> {
	let commandCharacters = 0;
	let preview = "";
	let previewComplete = true;
	for (const character of command) {
		commandCharacters += COMMAND_CHARACTER_COUNT_INCREMENT;
		if (
			!previewComplete ||
			preview.length + character.length > MAX_PREVIEW_CODE_UNITS
		) {
			previewComplete = false;
		} else {
			preview += character;
		}
	}

	return {
		commandCharacters,
		commandSha256: new Bun.CryptoHasher("sha256").update(command).digest("hex"),
		occurrences: occurrences.map(({ toolUseId, location }) => ({
			location,
			toolUseId,
		})),
		preview,
		previewTruncated: !previewComplete,
	};
}

interface BashCommandObservation {
	readonly command: string;
	readonly location: TranscriptLocation;
	readonly toolUseId: string | undefined;
}

export { repeatedBashCommands as default };
