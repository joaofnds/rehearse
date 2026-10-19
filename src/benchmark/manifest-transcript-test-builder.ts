import type { JsonValue } from "./json-value";
import type { TranscriptLine } from "./transcript";
import { parseTranscript } from "./transcript";

interface TranscriptRecords {
	readonly records: readonly JsonValue[];
}
class ManifestTranscriptBuilder {
	readonly #records: JsonValue[];
	public constructor(values: Partial<TranscriptRecords> = {}) {
		this.#records = [...(values.records ?? [])];
	}
	public build(): readonly TranscriptLine[] {
		return parseTranscript(
			this.#records.map((record) => JSON.stringify(record)).join("\n"),
		);
	}
	public withRecord(record: JsonValue): this {
		this.#records.push(record);
		return this;
	}
	public toolCall(id: string, name: string, input: JsonValue): this {
		this.#records.push({
			message: { content: [{ id, input, name, type: "tool_use" }] },
			type: "assistant",
		});
		return this;
	}

	public skillUse(skill: string): this {
		return this.toolCall("toolu_skill", "Skill", { skill });
	}

	public readUse(filePath: string): this {
		return this.toolCall("toolu_read", "Read", { file_path: filePath });
	}

	public bashUse(): this {
		return this.toolCall("toolu_bash", "Bash", { command: "ls" });
	}

	public outputStyle(style: string): this {
		this.#records.push({
			attachment: { style, type: "output_style" },
			type: "attachment",
		});
		return this;
	}

	public slashCommand(name: string): this {
		this.#records.push({
			message: {
				content: `<command-message>${name}</command-message>\n<command-name>/${name}</command-name>`,
			},
			type: "user",
		});
		return this;
	}

	public skillBody(directory: string): this {
		this.#records.push({
			isMeta: true,
			message: {
				content: [
					{
						text: `Base directory for this skill: ${directory}\n\nReply with the token.`,
						type: "text",
					},
				],
			},
			type: "user",
		});
		return this;
	}

	public errorResult(toolUseId: string): this {
		this.#records.push({
			message: {
				content: [
					{
						content: "<tool_use_error>Refused.</tool_use_error>",
						is_error: true,
						tool_use_id: toolUseId,
						type: "tool_result",
					},
				],
			},
			type: "user",
		});
		return this;
	}

	public instructions(path: string): this {
		this.#records.push({
			attachment: {
				files: [{ content: "# Instructions", path, type: "Project" }],
				type: "instructions",
			},
			type: "attachment",
		});
		return this;
	}
}
export { ManifestTranscriptBuilder as default };
