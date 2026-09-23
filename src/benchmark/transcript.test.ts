import { describe, expect, it } from "bun:test";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { JsonValue } from "#benchmark/json-value";
import {
	filesRead,
	instructionFiles,
	outputStyles,
	parseTranscript,
	parseTranscriptFile,
	skillDirectories,
	toolUsesExceptFailed,
	transcriptDiagnostics,
	transcriptDiagnosticsSchema,
	toolUses,
} from "#benchmark/transcript";
import { TestResources } from "#benchmark/test-support";

const testResources = TestResources.forEachTest();

function line(record: JsonValue): string {
	return JSON.stringify(record);
}

function assistantWith(...blocks: readonly JsonValue[]): string {
	return line({ type: "assistant", message: { content: blocks } });
}

function toolResult(id: string, isError = false): JsonValue {
	return {
		type: "tool_result",
		tool_use_id: id,
		content: "result",
		is_error: isError,
	};
}

function bashCall(id: string, command: string): JsonValue {
	return { type: "tool_use", id, name: "Bash", input: { command } };
}

function readCall(id: string): JsonValue {
	return {
		type: "tool_use",
		id,
		name: "Read",
		input: { file_path: "/tmp/x.md" },
	};
}

const readBlock = {
	type: "tool_use",
	id: "toolu_1",
	name: "Read",
	input: { file_path: "/tmp/x.md" },
};

const bashBlock = {
	type: "tool_use",
	id: "toolu_2",
	name: "Bash",
	input: { command: "ls" },
};

describe(parseTranscript.name, () => {
	it("collects the tool_use blocks of every assistant record", () => {
		const transcript = parseTranscript(
			[
				line({ type: "user", message: { content: "hello" } }),
				assistantWith({ type: "text", text: "thinking" }, readBlock),
				assistantWith(bashBlock),
			].join("\n"),
		);

		expect(toolUses(transcript).map(({ name }) => name)).toEqual([
			"Read",
			"Bash",
		]);
	});

	it("reads a record type it does not recognize as one with no tool calls", () => {
		const transcript = parseTranscript(
			[
				line({ type: "queue-operation", operation: "enqueue" }),
				line({ type: "future-record-kind", payload: { anything: true } }),
			].join("\n"),
		);

		expect(toolUses(transcript)).toEqual([]);
	});

	it("reads a line that is not JSON as one with no tool calls", () => {
		expect(toolUses(parseTranscript("not json at all\n"))).toEqual([]);
	});

	it("ignores blank lines, including a trailing newline", () => {
		expect(parseTranscript(`${assistantWith(readBlock)}\n\n`)).toHaveLength(1);
	});
});

describe(transcriptDiagnostics.name, () => {
	it("reports post-prefix tool occurrences, errors, and exact repeated Bash inputs", () => {
		const transcript = parseTranscript(
			[
				assistantWith(bashCall("prefix", "ls")),
				line({ type: "user", message: { content: [toolResult("prefix")] } }),
				assistantWith(bashCall("bash-1", "ls")),
				line({ type: "user", message: { content: [toolResult("bash-1")] } }),
				assistantWith(readCall("read-1")),
				line({ type: "user", message: { content: [toolResult("read-1")] } }),
				assistantWith(bashCall("bash-2", "ls")),
				line({
					type: "user",
					message: { content: [toolResult("bash-2", true)] },
				}),
				assistantWith(bashCall("bash-3", "ls ")),
				line({ type: "user", message: { content: [toolResult("bash-3")] } }),
			].join("\n"),
		);

		const diagnostics = transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 2,
			sourceAvailable: true,
		});

		expect(diagnostics).toEqual({
			state: "complete",
			prefixLinesExcluded: 2,
			sourceLineCount: 10,
			measuredLineCount: 8,
			toolUseOccurrences: {
				total: 4,
				byName: [
					{ name: "Bash", count: 3 },
					{ name: "Read", count: 1 },
				],
			},
			toolErrors: [
				{
					toolUseId: "bash-2",
					toolName: "Bash",
					call: { line: 7, block: 1 },
					result: { line: 8, block: 1 },
				},
			],
			repeatedBashCommands: [
				{
					commandSha256:
						"c7b68ac37f364473e922936708e7f43c293dd07b295171566c07ff5fe024fab9",
					commandCharacters: 2,
					preview: "ls",
					previewTruncated: false,
					occurrences: [
						{ toolUseId: "bash-1", location: { line: 3, block: 1 } },
						{ toolUseId: "bash-2", location: { line: 7, block: 1 } },
					],
				},
			],
			issues: [],
		});
	});

	it("distinguishes complete zero observations from unavailable evidence", () => {
		const transcript = parseTranscript(
			[
				line({ type: "user", message: { content: "hello" } }),
				line({ type: "queue-operation", operation: "enqueue" }),
			].join("\n"),
		);

		expect(
			transcriptDiagnostics({
				lines: transcript,
				prefixLinesExcluded: 0,
				sourceAvailable: true,
			}),
		).toEqual({
			state: "complete",
			prefixLinesExcluded: 0,
			sourceLineCount: 2,
			measuredLineCount: 2,
			toolUseOccurrences: { total: 0, byName: [] },
			toolErrors: [],
			repeatedBashCommands: [],
			issues: [],
		});
		expect(
			transcriptDiagnostics({
				lines: [],
				prefixLinesExcluded: 7,
				sourceAvailable: false,
			}),
		).toEqual({
			state: "unavailable",
			prefixLinesExcluded: 7,
		});
	});

	it("rejects contradictory persisted completeness states", () => {
		const complete = transcriptDiagnostics({
			lines: parseTranscript(
				line({ type: "user", message: { content: "hello" } }),
			),
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		});
		const issue = {
			kind: "invalid-json" as const,
			occurrences: 1,
			locations: [{ line: 1, block: 1 }],
			locationsTruncated: false,
		};

		expect(
			transcriptDiagnosticsSchema.safeParse({ ...complete, issues: [issue] })
				.success,
		).toBe(false);
		expect(
			transcriptDiagnosticsSchema.safeParse({
				...complete,
				state: "partial",
				issues: [],
			}).success,
		).toBe(false);
	});

	it("rejects contradictory persisted counts, repeat identities, order, and preview bounds", () => {
		const transcript = parseTranscript(
			[
				assistantWith(bashCall("bash-1", "pwd")),
				line({
					type: "user",
					message: { content: [toolResult("bash-1")] },
				}),
				assistantWith(bashCall("bash-2", "pwd")),
				line({
					type: "user",
					message: { content: [toolResult("bash-2")] },
				}),
			].join("\n"),
		);
		const complete = transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		});
		if (complete.state !== "complete") {
			throw new Error("Expected complete transcript diagnostics");
		}
		const [repeat] = complete.repeatedBashCommands;
		if (repeat === undefined) {
			throw new Error("Expected repeated Bash command evidence");
		}

		expect(
			transcriptDiagnosticsSchema.safeParse({
				...complete,
				toolUseOccurrences: { ...complete.toolUseOccurrences, total: 1 },
			}).success,
		).toBe(false);
		expect(
			transcriptDiagnosticsSchema.safeParse({
				...complete,
				repeatedBashCommands: [
					{
						...repeat,
						occurrences: repeat.occurrences.map((occurrence) => ({
							...occurrence,
							toolUseId: "duplicate",
						})),
					},
				],
			}).success,
		).toBe(false);
		expect(
			transcriptDiagnosticsSchema.safeParse({
				...complete,
				repeatedBashCommands: [
					{ ...repeat, occurrences: repeat.occurrences.toReversed() },
				],
			}).success,
		).toBe(false);
		expect(
			transcriptDiagnosticsSchema.safeParse({
				...complete,
				repeatedBashCommands: [{ ...repeat, preview: "x".repeat(161) }],
			}).success,
		).toBe(false);
	});

	it("treats string-valued assistant content as malformed evidence", () => {
		const transcript = parseTranscript(
			line({ type: "assistant", message: { content: "not block content" } }),
		);

		expect(
			transcriptDiagnostics({
				lines: transcript,
				prefixLinesExcluded: 0,
				sourceAvailable: true,
			}),
		).toEqual({
			state: "partial",
			prefixLinesExcluded: 0,
			sourceLineCount: 1,
			measuredLineCount: 1,
			toolUseOccurrences: { total: 0, byName: [] },
			toolErrors: [],
			repeatedBashCommands: [],
			issues: [
				{
					kind: "invalid-message-content",
					occurrences: 1,
					locations: [{ line: 1, block: 1 }],
					locationsTruncated: false,
				},
			],
		});
	});

	it("does not accept tool-shaped message content from an unknown record kind", () => {
		const transcript = parseTranscript(
			line({
				type: "future-assistant",
				message: { content: [bashCall("bash-1", "pwd")] },
			}),
		);

		expect(
			transcriptDiagnostics({
				lines: transcript,
				prefixLinesExcluded: 0,
				sourceAvailable: true,
			}),
		).toEqual({
			state: "partial",
			prefixLinesExcluded: 0,
			sourceLineCount: 1,
			measuredLineCount: 1,
			toolUseOccurrences: { total: 0, byName: [] },
			toolErrors: [],
			repeatedBashCommands: [],
			issues: [
				{
					kind: "invalid-message-content",
					occurrences: 1,
					locations: [{ line: 1, block: 1 }],
					locationsTruncated: false,
				},
			],
		});
	});

	it("marks malformed or empty measured evidence partial without hiding raw counts", () => {
		const malformed = parseTranscript(
			[
				"not json",
				assistantWith(bashCall("bash-1", "pwd")),
				line({
					type: "user",
					message: { content: [toolResult("bash-1")] },
				}),
			].join("\n"),
		);

		expect(
			transcriptDiagnostics({
				lines: malformed,
				prefixLinesExcluded: 0,
				sourceAvailable: true,
			}),
		).toEqual({
			state: "partial",
			prefixLinesExcluded: 0,
			sourceLineCount: 3,
			measuredLineCount: 3,
			toolUseOccurrences: {
				total: 1,
				byName: [{ name: "Bash", count: 1 }],
			},
			toolErrors: [],
			repeatedBashCommands: [],
			issues: [
				{
					kind: "invalid-json",
					occurrences: 1,
					locations: [{ line: 1, block: 1 }],
					locationsTruncated: false,
				},
			],
		});

		expect(
			transcriptDiagnostics({
				lines: [],
				prefixLinesExcluded: 3,
				sourceAvailable: true,
			}),
		).toEqual({
			state: "partial",
			prefixLinesExcluded: 3,
			sourceLineCount: 0,
			measuredLineCount: 0,
			toolUseOccurrences: { total: 0, byName: [] },
			toolErrors: [],
			repeatedBashCommands: [],
			issues: [
				{
					kind: "empty-measured-transcript",
					occurrences: 1,
					locations: [{ line: 4, block: 1 }],
					locationsTruncated: false,
				},
			],
		});
	});

	it("keeps ambiguous identities partial and out of repeated-command groups", () => {
		const transcript = parseTranscript(
			[
				assistantWith(
					bashCall("duplicate", "pwd"),
					bashCall("duplicate", "pwd"),
				),
				line({
					type: "user",
					message: {
						content: [
							toolResult("duplicate", true),
							toolResult("unmatched", true),
						],
					},
				}),
			].join("\n"),
		);

		expect(
			transcriptDiagnostics({
				lines: transcript,
				prefixLinesExcluded: 0,
				sourceAvailable: true,
			}),
		).toEqual({
			state: "partial",
			prefixLinesExcluded: 0,
			sourceLineCount: 2,
			measuredLineCount: 2,
			toolUseOccurrences: {
				total: 2,
				byName: [{ name: "Bash", count: 2 }],
			},
			toolErrors: [
				{
					toolUseId: "duplicate",
					result: { line: 2, block: 1 },
				},
				{
					toolUseId: "unmatched",
					result: { line: 2, block: 2 },
				},
			],
			repeatedBashCommands: [],
			issues: [
				{
					kind: "duplicate-tool-use-id",
					occurrences: 2,
					locations: [
						{ line: 1, block: 1 },
						{ line: 1, block: 2 },
					],
					locationsTruncated: false,
				},
				{
					kind: "unmatched-tool-result",
					occurrences: 1,
					locations: [{ line: 2, block: 2 }],
					locationsTruncated: false,
				},
			],
		});
	});

	it("does not fabricate joins or repeats from missing tool identities", () => {
		const transcript = parseTranscript(
			[
				assistantWith(
					{ type: "tool_use", name: "Bash", input: { command: "pwd" } },
					{ type: "tool_use", name: "Bash", input: { command: "pwd" } },
				),
				line({
					type: "user",
					message: {
						content: [{ type: "tool_result", is_error: true }],
					},
				}),
			].join("\n"),
		);

		expect(
			transcriptDiagnostics({
				lines: transcript,
				prefixLinesExcluded: 0,
				sourceAvailable: true,
			}),
		).toEqual({
			state: "partial",
			prefixLinesExcluded: 0,
			sourceLineCount: 2,
			measuredLineCount: 2,
			toolUseOccurrences: {
				total: 2,
				byName: [{ name: "Bash", count: 2 }],
			},
			toolErrors: [{ result: { line: 2, block: 1 } }],
			repeatedBashCommands: [],
			issues: [
				{
					kind: "missing-tool-use-id",
					occurrences: 2,
					locations: [
						{ line: 1, block: 1 },
						{ line: 1, block: 2 },
					],
					locationsTruncated: false,
				},
				{
					kind: "missing-tool-result-id",
					occurrences: 1,
					locations: [{ line: 2, block: 1 }],
					locationsTruncated: false,
				},
			],
		});
	});

	it("marks an unsupported tool-bearing block and a missing result partial", () => {
		const transcript = parseTranscript(
			assistantWith(bashCall("bash-1", "pwd"), {
				type: "server_tool_use",
				name: "future-tool",
				input: {},
			}),
		);

		expect(
			transcriptDiagnostics({
				lines: transcript,
				prefixLinesExcluded: 0,
				sourceAvailable: true,
			}),
		).toEqual({
			state: "partial",
			prefixLinesExcluded: 0,
			sourceLineCount: 1,
			measuredLineCount: 1,
			toolUseOccurrences: {
				total: 1,
				byName: [{ name: "Bash", count: 1 }],
			},
			toolErrors: [],
			repeatedBashCommands: [],
			issues: [
				{
					kind: "unsupported-content-block",
					occurrences: 1,
					locations: [{ line: 1, block: 2 }],
					locationsTruncated: false,
				},
				{
					kind: "missing-tool-result",
					occurrences: 1,
					locations: [{ line: 1, block: 1 }],
					locationsTruncated: false,
				},
			],
		});
	});

	it("names invalid tool blocks and duplicate result identities", () => {
		const transcript = parseTranscript(
			[
				assistantWith({
					type: "tool_use",
					id: "invalid-use",
					name: "Bash",
					input: "not an object",
				}),
				line({
					type: "user",
					message: {
						content: [
							{
								type: "tool_result",
								tool_use_id: "invalid-result",
								is_error: "yes",
							},
						],
					},
				}),
				assistantWith(readCall("read-1")),
				line({
					type: "user",
					message: {
						content: [toolResult("read-1"), toolResult("read-1")],
					},
				}),
			].join("\n"),
		);

		expect(
			transcriptDiagnostics({
				lines: transcript,
				prefixLinesExcluded: 0,
				sourceAvailable: true,
			}),
		).toEqual({
			state: "partial",
			prefixLinesExcluded: 0,
			sourceLineCount: 4,
			measuredLineCount: 4,
			toolUseOccurrences: {
				total: 1,
				byName: [{ name: "Read", count: 1 }],
			},
			toolErrors: [],
			repeatedBashCommands: [],
			issues: [
				{
					kind: "invalid-tool-use",
					occurrences: 1,
					locations: [{ line: 1, block: 1 }],
					locationsTruncated: false,
				},
				{
					kind: "invalid-tool-result",
					occurrences: 1,
					locations: [{ line: 2, block: 1 }],
					locationsTruncated: false,
				},
				{
					kind: "duplicate-tool-result",
					occurrences: 2,
					locations: [
						{ line: 4, block: 1 },
						{ line: 4, block: 2 },
					],
					locationsTruncated: false,
				},
			],
		});
	});

	it("marks a Bash call without a string command partial", () => {
		const transcript = parseTranscript(
			[
				assistantWith({
					type: "tool_use",
					id: "bash-1",
					name: "Bash",
					input: {},
				}),
				line({
					type: "user",
					message: { content: [toolResult("bash-1")] },
				}),
			].join("\n"),
		);

		expect(
			transcriptDiagnostics({
				lines: transcript,
				prefixLinesExcluded: 0,
				sourceAvailable: true,
			}),
		).toEqual({
			state: "partial",
			prefixLinesExcluded: 0,
			sourceLineCount: 2,
			measuredLineCount: 2,
			toolUseOccurrences: {
				total: 1,
				byName: [{ name: "Bash", count: 1 }],
			},
			toolErrors: [],
			repeatedBashCommands: [],
			issues: [
				{
					kind: "invalid-bash-command",
					occurrences: 1,
					locations: [{ line: 1, block: 1 }],
					locationsTruncated: false,
				},
			],
		});
	});

	it("orders repeat groups and their calls by first source occurrence", () => {
		const transcript = parseTranscript(
			[
				assistantWith(bashCall("pwd-1", "pwd")),
				assistantWith(bashCall("ls-1", "ls")),
				line({
					type: "user",
					message: {
						content: [toolResult("pwd-1"), toolResult("ls-1")],
					},
				}),
				assistantWith(bashCall("ls-2", "ls")),
				assistantWith(bashCall("pwd-2", "pwd")),
				line({
					type: "user",
					message: {
						content: [toolResult("ls-2"), toolResult("pwd-2")],
					},
				}),
			].join("\n"),
		);
		const diagnostics = transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		});

		expect(diagnostics.state).toBe("complete");
		if (diagnostics.state !== "complete") {
			throw new Error("Expected complete transcript diagnostics");
		}
		expect(
			diagnostics.repeatedBashCommands.map(({ preview, occurrences }) => ({
				preview,
				lines: occurrences.map(({ location }) => location.line),
			})),
		).toEqual([
			{ preview: "pwd", lines: [1, 5] },
			{ preview: "ls", lines: [2, 4] },
		]);
	});

	it("bounds the persisted repeated-command preview", () => {
		const command = "x".repeat(161);
		const transcript = parseTranscript(
			[
				assistantWith(bashCall("bash-1", command)),
				line({
					type: "user",
					message: { content: [toolResult("bash-1")] },
				}),
				assistantWith(bashCall("bash-2", command)),
				line({
					type: "user",
					message: { content: [toolResult("bash-2")] },
				}),
			].join("\n"),
		);

		const diagnostics = transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		});

		expect(diagnostics.state).toBe("complete");
		if (diagnostics.state !== "complete") {
			throw new Error("Expected complete transcript diagnostics");
		}
		expect(diagnostics.repeatedBashCommands).toHaveLength(1);
		expect(diagnostics.repeatedBashCommands[0]).toEqual({
			commandSha256:
				"fdb7f3c40645e79ca4c5d1638753243ccb283f5dd126ceb21de5fa7d40953c65",
			commandCharacters: 161,
			preview: "x".repeat(160),
			previewTruncated: true,
			occurrences: [
				{ toolUseId: "bash-1", location: { line: 1, block: 1 } },
				{ toolUseId: "bash-2", location: { line: 3, block: 1 } },
			],
		});
	});

	it("bounds a repeated command containing an unbounded combining sequence", () => {
		const command = `a${"\u0301".repeat(10_000)}`;
		const transcript = parseTranscript(
			[
				assistantWith(bashCall("bash-1", command)),
				line({
					type: "user",
					message: { content: [toolResult("bash-1")] },
				}),
				assistantWith(bashCall("bash-2", command)),
				line({
					type: "user",
					message: { content: [toolResult("bash-2")] },
				}),
			].join("\n"),
		);
		const diagnostics = transcriptDiagnostics({
			lines: transcript,
			prefixLinesExcluded: 0,
			sourceAvailable: true,
		});

		expect(diagnostics.state).toBe("complete");
		if (diagnostics.state !== "complete") {
			throw new Error("Expected complete transcript diagnostics");
		}
		expect(diagnostics.repeatedBashCommands[0]).toMatchObject({
			commandCharacters: 10_001,
			previewTruncated: true,
		});
		expect(diagnostics.repeatedBashCommands[0]?.preview).toHaveLength(160);
	});
});

describe(parseTranscriptFile.name, () => {
	async function transcriptFile(lines: readonly string[]): Promise<string> {
		const directory = await mkdtemp(join(tmpdir(), "rehearse-transcript-"));
		testResources.track(directory);
		const path = join(directory, "transcript.jsonl");
		await writeFile(path, `${lines.join("\n")}\n`);

		return path;
	}

	function filler(ordinal: number): string {
		return line({ type: "user", ordinal, filler: "x".repeat(4096) });
	}

	it("reads the tool calls of a transcript on disk", async () => {
		const path = await transcriptFile([
			assistantWith({ type: "text", text: "thinking" }, readBlock),
			assistantWith(bashBlock),
		]);

		const transcript = await parseTranscriptFile(path);

		expect(toolUses(transcript).map(({ name }) => name)).toEqual([
			"Read",
			"Bash",
		]);
	});

	it("reads an absent transcript as one with no records", async () => {
		expect(await parseTranscriptFile("/no/such/transcript.jsonl")).toEqual([]);
	});

	/**
	 * ACT-25's resumed cases carry real multi-megabyte transcripts, so this
	 * reads like the capture path rather than holding the file as one string.
	 * An observer that is never called leaves the count at zero, which is what
	 * a non-streaming subject would do.
	 */
	const ONE_CHUNK_AND_A_LINE = 768 * 1024;

	it("never holds the whole transcript, only one read chunk and a partial line", async () => {
		const path = await transcriptFile(
			Array.from({ length: 400 }, (_value, index) => filler(index)),
		);
		let widest = 0;
		let observations = 0;

		await parseTranscriptFile(path, {
			carry: (characters) => {
				observations += 1;
				widest = Math.max(widest, characters);
			},
		});

		expect(Bun.file(path).size).toBeGreaterThan(1024 * 1024);
		expect(observations).toBeGreaterThan(1);
		expect(widest).toBeLessThan(ONE_CHUNK_AND_A_LINE);
	});
});

describe(toolUsesExceptFailed.name, () => {
	it("returns every tool use except those answered with an error", () => {
		const transcript = parseTranscript(
			[
				assistantWith(readCall("toolu_ok"), readCall("toolu_failed")),
				line({
					type: "user",
					message: {
						content: [toolResult("toolu_ok"), toolResult("toolu_failed", true)],
					},
				}),
			].join("\n"),
		);

		expect(toolUsesExceptFailed(transcript).map((use) => use.id)).toEqual([
			"toolu_ok",
		]);
	});
});

describe(filesRead.name, () => {
	it("returns the file_path of every Read call and nothing else", () => {
		const transcript = parseTranscript(assistantWith(readBlock, bashBlock));

		expect(filesRead(toolUses(transcript))).toEqual(["/tmp/x.md"]);
	});
});

const skillBlock = {
	type: "tool_use",
	id: "toolu_3",
	name: "Skill",
	input: { skill: "verify" },
};

const skillBody = {
	type: "text",
	text: "Base directory for this skill: /tmp/attempt/.claude/skills/verify\n\nReply with the token.",
};

function userWith(...blocks: readonly JsonValue[]): string {
	return line({ type: "user", message: { content: blocks } });
}

function metaUserWith(...blocks: readonly JsonValue[]): string {
	return line({ type: "user", isMeta: true, message: { content: blocks } });
}

describe(skillDirectories.name, () => {
	it("returns the directory every loaded skill body names", () => {
		const transcript = parseTranscript(metaUserWith(skillBody));

		expect(skillDirectories(transcript)).toEqual([
			"/tmp/attempt/.claude/skills/verify",
		]);
	});

	it("returns nothing for a Skill call whose body never loaded", () => {
		const transcript = parseTranscript(assistantWith(skillBlock));

		expect(skillDirectories(transcript)).toEqual([]);
	});

	it("returns nothing for a reply that quotes a skill body", () => {
		const transcript = parseTranscript(assistantWith(skillBody));

		expect(skillDirectories(transcript)).toEqual([]);
	});

	it("returns nothing for a skill body in a user message the provider did not mark as meta", () => {
		const transcript = parseTranscript(userWith(skillBody));

		expect(skillDirectories(transcript)).toEqual([]);
	});

	it("returns nothing for a message that names a skill directory after its first character", () => {
		const transcript = parseTranscript(
			metaUserWith({ type: "text", text: `Quoted: ${skillBody.text}` }),
		);

		expect(skillDirectories(transcript)).toEqual([]);
	});
});

function attachmentLine(attachment: JsonValue): string {
	return line({ type: "attachment", attachment });
}

describe(instructionFiles.name, () => {
	it("returns the path of every file an instructions attachment names", () => {
		const transcript = parseTranscript(
			attachmentLine({
				type: "instructions",
				files: [
					{ path: "/tmp/attempt/.claude/CLAUDE.md", type: "Project" },
					{ path: "/tmp/attempt/CLAUDE.md", type: "Project" },
				],
			}),
		);

		expect(instructionFiles(transcript)).toEqual([
			"/tmp/attempt/.claude/CLAUDE.md",
			"/tmp/attempt/CLAUDE.md",
		]);
	});

	it("returns nothing for a transcript with no instructions attachment", () => {
		expect(
			instructionFiles(parseTranscript(attachmentLine({ type: "budget_usd" }))),
		).toEqual([]);
	});
});

describe(outputStyles.name, () => {
	it("returns the style name of every output_style attachment in order", () => {
		const transcript = parseTranscript(
			[
				attachmentLine({ type: "output_style", style: "brief" }),
				attachmentLine({ type: "skill_listing", names: ["verify"] }),
				attachmentLine({ type: "output_style", style: "concise" }),
			].join("\n"),
		);

		expect(outputStyles(transcript)).toEqual(["brief", "concise"]);
	});

	it("returns nothing for a transcript with no output_style attachment", () => {
		expect(
			outputStyles(parseTranscript(attachmentLine({ type: "budget_usd" }))),
		).toEqual([]);
	});

	it("returns nothing for a record type it does not recognize", () => {
		expect(
			outputStyles(
				parseTranscript(
					line({ type: "future-record-kind", payload: { anything: true } }),
				),
			),
		).toEqual([]);
	});
});
