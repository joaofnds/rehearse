import { describe, expect, it } from "bun:test";
import type { Immutable } from "#benchmark/contracts";
import type { SessionCase } from "#benchmark/case";
import type { SessionSettings } from "#benchmark/claude";
import type { ResolvedCorpusFile } from "#benchmark/corpus-file";
import type { JsonObject } from "#benchmark/json-value";
import type { SessionAttempt } from "#benchmark/session-attempt";
import type {
	CorpusSnapshotOrigin,
	LegacySessionAttemptRecord,
	SessionAttemptRecord,
} from "#benchmark/session-record";
import {
	buildSessionAttemptRecord,
	parseSessionAttemptRecord,
	sessionAttemptRecordSchema,
} from "#benchmark/session-record";
import {
	contextEvidenceSchema,
	contextEvidenceSourceSchema,
	normalizeContextEvidence,
} from "#benchmark/context-evidence";

function record(
	overrides: Immutable<Partial<LegacySessionAttemptRecord>> = {},
): Immutable<LegacySessionAttemptRecord> {
	return {
		schemaVersion: 1,
		caseId: "smoke",
		lineage: "a".repeat(64),
		model: "haiku",
		sessionBudgetUsd: 0.2,
		corpusFiles: [],
		prompt: "Reply with the single word OK.",
		reply: "OK",
		transcriptFile: "/runs/transcript.jsonl",
		outcome: "SUCCESSFUL",
		checks: [{ kind: "word-band", status: "PASS", detail: "1 word" }],
		elapsedMs: 900,
		...overrides,
	};
}

/**
 * An omitted optional key and one set to undefined are different shapes under
 * exact optional property types, and the schema tells them apart, so the tests
 * for a missing reply must actually delete the key.
 */
function withoutReply(
	overrides: Immutable<Partial<LegacySessionAttemptRecord>> = {},
): Omit<Immutable<LegacySessionAttemptRecord>, "reply"> {
	const { reply: _dropped, ...rest } = record(overrides);

	return rest;
}

function smokeCase(): SessionCase {
	return {
		kind: "session",
		declaration: {
			id: "smoke",
			kind: "session",
			title: "Smoke",
			prompt: "Reply with the single word OK.",
			tools: [],
			corpusFiles: [],
			projectFiles: [],
			checks: [{ kind: "word-band", max: 1 }],
		},
		fixturePath: undefined,
		transcriptPath: undefined,
		prompt: "Reply with the single word OK.",
		tools: [],
		settings: undefined,
		agents: undefined,
		corpusFiles: [],
		projectFiles: [],
		checks: [{ kind: "word-band", max: 1 }],
	};
}

function smokeAttempt(): SessionAttempt {
	return {
		attemptDirectory: "/runs/attempt",
		metrics: undefined,
		transcriptFile: "/runs/transcript.jsonl",
		transcriptDiagnostics: {
			state: "complete",
			prefixLinesExcluded: 0,
			sourceLineCount: 1,
			measuredLineCount: 1,
			toolUseOccurrences: { total: 0, byName: [] },
			toolErrors: [],
			repeatedBashCommands: [],
			issues: [],
		},
		reply: "OK",
		outcome: "SUCCESSFUL",
		checks: [{ kind: "word-band", status: "PASS", detail: "1 word" }],
		contextManifest: undefined,
	};
}

describe("sessionAttemptRecordSchema", () => {
	function failedRecord(): Immutable<
		Extract<SessionAttemptRecord, { schemaVersion: 2 }>
	> {
		const {
			reply: _reply,
			contextManifest: _contextManifest,
			divergences: _divergences,
			...base
		} = record();

		return {
			...base,
			schemaVersion: 2 as const,
			error: "provider rejected the call",
			outcome: "EXECUTION_FAILED" as const,
			checks: [],
		};
	}

	it("accepts a checked attempt whose outcome matches its results", () => {
		expect(sessionAttemptRecordSchema.parse(record())).toMatchObject({
			outcome: "SUCCESSFUL",
		});
	});

	it("accepts an attempt that produced no reply, with no reply and no check", () => {
		expect(
			sessionAttemptRecordSchema.parse(
				withoutReply({ outcome: "NO_REPLY", checks: [] }),
			),
		).toMatchObject({ outcome: "NO_REPLY" });
	});

	it("refuses an attempt with no reply that still records a check result", () => {
		const parsed = sessionAttemptRecordSchema.safeParse(
			withoutReply({ outcome: "NO_REPLY" }),
		);

		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0]?.message).toBe(
			"A session attempt with no reply evaluates no check",
		);
	});

	it("refuses an attempt with no reply that still records one", () => {
		const parsed = sessionAttemptRecordSchema.safeParse(
			record({ outcome: "NO_REPLY", checks: [] }),
		);

		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0]?.message).toBe(
			"A session attempt with no reply records no reply",
		);
	});

	it("refuses a checked attempt that records no reply", () => {
		const parsed = sessionAttemptRecordSchema.safeParse(withoutReply());

		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0]?.message).toBe(
			"A session attempt that was checked records the reply it checked",
		);
	});

	it("refuses a checked attempt that evaluated no check", () => {
		const parsed = sessionAttemptRecordSchema.safeParse(record({ checks: [] }));

		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0]?.message).toBe(
			"A checked session attempt records one result per declared check",
		);
	});

	/**
	 * A record on disk is data, so the kind arrives as an unchecked string; the
	 * compiler refuses this literal in typed code, which is the same guarantee
	 * one layer earlier.
	 */
	it("carries a directory origin's source", () => {
		expect(
			sessionAttemptRecordSchema.parse(
				record({ corpusOrigin: { kind: "directory", source: "/corpus" } }),
			).corpusOrigin,
		).toEqual({ kind: "directory", source: "/corpus" });
	});

	/**
	 * Records written before the origin existed carry no such field, and they
	 * were all the live install, which is what an absent origin means.
	 */
	it("accepts a record written before the origin existed", () => {
		const { corpusOrigin: _dropped, ...legacy } = record();

		expect(
			sessionAttemptRecordSchema.parse(legacy).corpusOrigin,
		).toBeUndefined();
	});

	/**
	 * The manifest is observed name-only (ACT-59, doc-9 gap 2): the transcript
	 * never carries the corpus's own bytes, so a manifest entry is a layout path
	 * and nothing a hash could attach to.
	 */
	it("carries the observed context manifest's paths", () => {
		expect(
			sessionAttemptRecordSchema.parse(
				record({
					contextManifest: {
						paths: [{ path: "skills/verify/SKILL.md", half: "corpus" }],
					},
					divergences: [],
				}),
			).contextManifest,
		).toEqual({ paths: [{ path: "skills/verify/SKILL.md", half: "corpus" }] });
	});

	it("carries a named divergence between the manifest and the declaration", () => {
		expect(
			sessionAttemptRecordSchema.parse(
				record({
					contextManifest: { paths: [] },
					divergences: [
						{
							kind: "unloaded-file",
							path: "skills/verify/SKILL.md",
							half: "corpus",
						},
					],
				}),
			).divergences,
		).toEqual([
			{ kind: "unloaded-file", path: "skills/verify/SKILL.md", half: "corpus" },
		]);
	});

	/**
	 * Records written before the manifest existed carry neither field, and no
	 * observation was made of what they loaded, which is different from having
	 * observed zero divergence.
	 */
	it("accepts a record written before the context manifest existed", () => {
		const parsed = sessionAttemptRecordSchema.parse(record());

		expect(parsed.contextManifest).toBeUndefined();
		expect(parsed.divergences).toBeUndefined();
	});

	it("accepts a historical record with no transcript diagnostics", () => {
		expect(
			sessionAttemptRecordSchema.parse(record()).transcriptDiagnostics,
		).toBeUndefined();
	});

	it("treats omitted context evidence as unavailable rather than zero", () => {
		const parsed = sessionAttemptRecordSchema.parse(record());

		expect(parsed.contextEvidence).toBeUndefined();
	});

	it("reopens the normalized context evidence saved with an attempt", async () => {
		const source = contextEvidenceSourceSchema.parse(
			await Bun.file(
				new URL("__fixtures__/context-evidence-source.json", import.meta.url),
			).json(),
		);
		const contextEvidence = normalizeContextEvidence(source);

		const parsed = parseSessionAttemptRecord(
			JSON.stringify({ ...record(), contextEvidence }),
		);

		const reopened = contextEvidenceSchema.parse(
			structuredClone(contextEvidence),
		);
		expect(parsed.contextEvidence).toEqual(reopened);
	});

	it("keeps the persisted transcript cut without consulting a current case declaration", () => {
		const parsed = parseSessionAttemptRecord(
			JSON.stringify(
				record({
					transcriptDiagnostics: {
						state: "complete",
						prefixLinesExcluded: 2,
						sourceLineCount: 5,
						measuredLineCount: 3,
						toolUseOccurrences: { total: 0, byName: [] },
						toolErrors: [],
						repeatedBashCommands: [],
						issues: [],
					},
				}),
			),
		);

		expect(parsed.transcriptDiagnostics?.prefixLinesExcluded).toBe(2);
	});

	it("refuses a divergence naming a kind that does not exist", () => {
		const parsed = sessionAttemptRecordSchema.safeParse({
			...record({ contextManifest: { paths: [] } }),
			divergences: [
				{
					kind: "renamed-file",
					path: "skills/verify/SKILL.md",
					half: "corpus",
				},
			],
		});

		expect(parsed.success).toBe(false);
	});

	it("carries a project-half divergence's half tag through the record", () => {
		expect(
			sessionAttemptRecordSchema.parse(
				record({
					contextManifest: { paths: [] },
					divergences: [
						{ kind: "unloaded-file", path: "NOTES.md", half: "project" },
					],
				}),
			).divergences,
		).toEqual([{ kind: "unloaded-file", path: "NOTES.md", half: "project" }]);
	});

	/**
	 * An origin is the live install or a directory, and nothing else. A record on
	 * disk is data, so the kind arrives as an unchecked string; the compiler
	 * refuses this shape in typed code, which is the same guarantee one layer
	 * earlier.
	 */
	it("refuses an origin naming a kind that does not exist", () => {
		const parsed = sessionAttemptRecordSchema.safeParse({
			...record(),
			corpusOrigin: { kind: "rendered", ref: "HEAD", commit: "0".repeat(40) },
		});

		expect(parsed.success).toBe(false);
	});

	it("refuses a result naming a check kind that does not exist", () => {
		const parsed = sessionAttemptRecordSchema.safeParse({
			...record({ checks: [] }),
			checks: [{ kind: "typo-band", status: "PASS", detail: "1 word" }],
		});

		expect(parsed.success).toBe(false);
	});

	it.each(["word-band", "forbidden-text", "tool-calls", "files-read"])(
		"accepts a result of the %s kind",
		(kind) => {
			expect(
				sessionAttemptRecordSchema.safeParse(
					record({ checks: [{ kind, status: "PASS", detail: "ok" }] }),
				).success,
			).toBe(true);
		},
	);

	it("refuses a successful attempt whose check failed", () => {
		const parsed = sessionAttemptRecordSchema.safeParse(
			record({
				checks: [{ kind: "word-band", status: "FAIL", detail: "9 words" }],
			}),
		);

		expect(parsed.success).toBe(false);
		expect(parsed.error?.issues[0]?.message).toBe(
			"A session attempt is successful when and only when every check passes",
		);
	});

	it("accepts a v2 execution failure with a non-empty error", () => {
		expect(sessionAttemptRecordSchema.parse(failedRecord())).toMatchObject({
			schemaVersion: 2,
			outcome: "EXECUTION_FAILED",
			error: "provider rejected the call",
		});
	});

	it.each([
		{ error: undefined },
		{ reply: "partial reply" },
		{ checks: [{ kind: "word-band", status: "FAIL", detail: "failed" }] },
	])("refuses contradictory v2 execution-failure evidence", (override) => {
		expect(
			sessionAttemptRecordSchema.safeParse({ ...failedRecord(), ...override })
				.success,
		).toBe(false);
	});

	it("keeps the v1 success schema closed to failure-only fields", () => {
		expect(
			sessionAttemptRecordSchema.safeParse({
				...record(),
				error: "cannot accompany success",
			}).success,
		).toBe(false);
	});

	it("parses a legacy pre-ACT-61 record whose manifest entries are bare strings and divergences carry no half, retaining exact bytes without adding or defaulting half", () => {
		const legacyRaw = {
			...record(),
			schemaVersion: 1,
			contextManifest: {
				paths: ["output-styles/brief.md"],
			},
			divergences: [
				{
					kind: "unloaded-file",
					path: "CLAUDE.md",
				},
			],
		};
		const parsed = parseSessionAttemptRecord(JSON.stringify(legacyRaw));

		expect(parsed.schemaVersion).toBe(1);
		expect(parsed.contextManifest).toEqual({
			paths: ["output-styles/brief.md"],
		});
		expect(parsed.divergences).toEqual([
			{
				kind: "unloaded-file",
				path: "CLAUDE.md",
			},
		]);
		expect("half" in (parsed.divergences?.[0] ?? {})).toBe(false);
	});

	it("holds a schemaVersion 3 record to the same outcome and check consistency rules as a version 1 record", () => {
		const current = { ...record(), schemaVersion: 3 };

		expect(sessionAttemptRecordSchema.safeParse(current).success).toBe(true);
		expect(
			sessionAttemptRecordSchema.safeParse({ ...current, checks: [] }).success,
		).toBe(false);
		expect(
			sessionAttemptRecordSchema.safeParse({
				...current,
				outcome: "UNSUCCESSFUL",
			}).success,
		).toBe(false);
		expect(
			sessionAttemptRecordSchema.safeParse({ ...current, reply: undefined })
				.success,
		).toBe(false);
	});

	it("buildSessionAttemptRecord produces a schemaVersion 3 record that roundtrips with half on manifest and divergence entries", () => {
		const sampleCase: SessionCase = {
			kind: "session",
			declaration: {
				id: "smoke",
				kind: "session",
				title: "Smoke",
				prompt: "Reply with the single word OK.",
				tools: [],
				corpusFiles: ["skills/verify/SKILL.md"],
				projectFiles: ["NOTES.md"],
				checks: [{ kind: "word-band", max: 1 }],
			},
			fixturePath: undefined,
			transcriptPath: undefined,
			prompt: "Reply with the single word OK.",
			tools: [],
			settings: undefined,
			agents: undefined,
			corpusFiles: ["skills/verify/SKILL.md"],
			projectFiles: ["NOTES.md"],
			checks: [{ kind: "word-band", max: 1 }],
		};
		const sampleSettings: SessionSettings = {
			model: "haiku",
			budgetUsd: 0.2,
		};
		const sampleCorpusFiles: readonly ResolvedCorpusFile[] = [
			{
				path: "skills/verify/SKILL.md",
				resolvedPath: "/path/to/SKILL.md",
				sha256: "a".repeat(64),
			},
		];
		const sampleOrigin: CorpusSnapshotOrigin = { kind: "live" };
		const sampleAttempt: SessionAttempt = {
			attemptDirectory: "/runs/attempt",
			metrics: undefined,
			transcriptFile: "/runs/transcript.jsonl",
			transcriptDiagnostics: {
				state: "complete",
				prefixLinesExcluded: 0,
				sourceLineCount: 1,
				measuredLineCount: 1,
				toolUseOccurrences: { total: 0, byName: [] },
				toolErrors: [],
				repeatedBashCommands: [],
				issues: [],
			},
			reply: "OK",
			outcome: "SUCCESSFUL",
			checks: [{ kind: "word-band", status: "PASS", detail: "1 word" }],
			contextManifest: {
				paths: [
					{ path: "skills/verify/SKILL.md", half: "corpus" },
					{ path: "NOTES.md", half: "project" },
				],
			},
		};

		const built = buildSessionAttemptRecord({
			sessionCase: sampleCase,
			settings: sampleSettings,
			lineage: "b".repeat(64),
			corpusFiles: sampleCorpusFiles,
			corpusOrigin: sampleOrigin,
			attempt: sampleAttempt,
			elapsedMs: 123,
		});

		expect(built.schemaVersion).toBe(3);
		expect(built.contextManifest?.paths).toEqual([
			{ path: "skills/verify/SKILL.md", half: "corpus" },
			{ path: "NOTES.md", half: "project" },
		]);
		expect(built.divergences).toEqual([]);

		const roundtripped = parseSessionAttemptRecord(JSON.stringify(built));
		expect(roundtripped).toEqual(built);
		expect(roundtripped.schemaVersion).toBe(3);
		if (roundtripped.schemaVersion === 3) {
			expect(roundtripped.contextManifest?.paths[0]?.half).toBe("corpus");
			expect(roundtripped.contextManifest?.paths[1]?.half).toBe("project");
		}
	});

	const savedAttempts: readonly {
		readonly name: string;
		readonly schemaVersion: 1 | 3;
	}[] = [
		{ name: "v1-successful.json", schemaVersion: 1 },
		{ name: "v1-successful-with-manifest.json", schemaVersion: 1 },
		{ name: "v1-unsuccessful.json", schemaVersion: 1 },
		{ name: "v1-unsuccessful-with-manifest.json", schemaVersion: 1 },
		{ name: "v3-successful-with-manifest.json", schemaVersion: 3 },
	];

	for (const { name, schemaVersion } of savedAttempts) {
		it(`parses the saved attempt ${name} unchanged`, async () => {
			const text = await Bun.file(
				new URL(`__fixtures__/saved-attempts/${name}`, import.meta.url),
			).text();

			const parsed = parseSessionAttemptRecord(text);

			expect(parsed.schemaVersion).toBe(schemaVersion);
			expect(parsed.metrics?.modelUsage).toBeUndefined();
		});
	}

	/**
	 * An arm's behavior settings are not corpus files, so no per-file digest
	 * covers them: two arms differing only in `settings` would present identical
	 * recorded identities while running different sessions. The digest names that
	 * difference. A case declaring no settings records none, so every earlier
	 * record stays valid and comparable.
	 */
	it("records a settings digest that distinguishes two arms differing only in settings", () => {
		const withBrief = buildSessionAttemptRecord({
			sessionCase: { ...smokeCase(), settings: { outputStyle: "brief" } },
			settings: { model: "haiku", budgetUsd: 0.2 },
			lineage: "b".repeat(64),
			corpusFiles: [],
			corpusOrigin: { kind: "live" },
			attempt: smokeAttempt(),
			elapsedMs: 1,
		});
		const withVerbose = buildSessionAttemptRecord({
			sessionCase: { ...smokeCase(), settings: { outputStyle: "verbose" } },
			settings: { model: "haiku", budgetUsd: 0.2 },
			lineage: "b".repeat(64),
			corpusFiles: [],
			corpusOrigin: { kind: "live" },
			attempt: smokeAttempt(),
			elapsedMs: 1,
		});
		const withNone = buildSessionAttemptRecord({
			sessionCase: smokeCase(),
			settings: { model: "haiku", budgetUsd: 0.2 },
			lineage: "b".repeat(64),
			corpusFiles: [],
			corpusOrigin: { kind: "live" },
			attempt: smokeAttempt(),
			elapsedMs: 1,
		});

		expect(withBrief.settingsDigest).toMatch(/^[0-9a-f]{64}$/u);
		expect(withBrief.settingsDigest).not.toBe(withVerbose.settingsDigest);
		expect(withNone.settingsDigest).toBeUndefined();
		expect(parseSessionAttemptRecord(JSON.stringify(withBrief))).toEqual(
			withBrief,
		);
	});

	/**
	 * A permission grant lives under `permissions.allow`, so a digest that only
	 * covered top-level keys would give two arms differing in what they may do
	 * the same identity. Key order is not a difference: the same settings written
	 * in another order are the same settings.
	 */
	it("distinguishes a nested settings difference and ignores key order", () => {
		function digestOf(settings: Readonly<JsonObject>): string | undefined {
			return buildSessionAttemptRecord({
				sessionCase: { ...smokeCase(), settings },
				settings: { model: "haiku", budgetUsd: 0.2 },
				lineage: "b".repeat(64),
				corpusFiles: [],
				corpusOrigin: { kind: "live" },
				attempt: smokeAttempt(),
				elapsedMs: 1,
			}).settingsDigest;
		}

		const permitted = digestOf({
			outputStyle: "brief",
			permissions: { allow: ["Edit"] },
		});
		const denied = digestOf({
			outputStyle: "brief",
			permissions: { allow: [] },
		});
		const reordered = digestOf({
			permissions: { allow: ["Edit"] },
			outputStyle: "brief",
		});
		const nestedReordered = digestOf({
			outputStyle: "brief",
			permissions: { deny: [], allow: ["Edit"] },
		});
		const nestedDeclarationOrder = digestOf({
			outputStyle: "brief",
			permissions: { allow: ["Edit"], deny: [] },
		});

		expect(permitted).not.toBe(denied);
		expect(permitted).toBe(reordered);
		expect(nestedReordered).toBe(nestedDeclarationOrder);
	});

	it("retains the provider's per-model usage block on a built record", () => {
		const built = buildSessionAttemptRecord({
			sessionCase: smokeCase(),
			settings: { model: "haiku", budgetUsd: 0.2 },
			lineage: "b".repeat(64),
			corpusFiles: [],
			corpusOrigin: { kind: "live" },
			attempt: {
				...smokeAttempt(),
				metrics: {
					costUsd: 0.029973,
					inputTokens: 2,
					outputTokens: 5,
					cacheReadTokens: 0,
					cacheWriteTokens: 14_973,
					turns: 1,
					modelUsage: {
						"claude-haiku-4-5-20251001": {
							inputTokens: 2,
							outputTokens: 5,
							cacheReadInputTokens: 0,
							cacheCreationInputTokens: 14_973,
							costUSD: 0.029973,
							contextWindow: 200_000,
							maxOutputTokens: 32_000,
							canonicalModel: "claude-haiku-4-5",
							provider: "firstParty",
							costBasis: "list",
						},
					},
				},
			},
			elapsedMs: 123,
		});

		const roundtripped = parseSessionAttemptRecord(JSON.stringify(built));

		expect(roundtripped.metrics?.modelUsage).toEqual({
			"claude-haiku-4-5-20251001": {
				inputTokens: 2,
				outputTokens: 5,
				cacheReadInputTokens: 0,
				cacheCreationInputTokens: 14_973,
				costUSD: 0.029973,
				contextWindow: 200_000,
				maxOutputTokens: 32_000,
				canonicalModel: "claude-haiku-4-5",
				provider: "firstParty",
				costBasis: "list",
			},
		});
	});

	it("rejects manifest entries that are bare strings when building a session attempt record rather than spreading them into character indices", () => {
		const sampleCase: SessionCase = {
			kind: "session",
			declaration: {
				id: "smoke",
				kind: "session",
				title: "Smoke",
				prompt: "Reply with the single word OK.",
				tools: [],
				corpusFiles: [],
				projectFiles: [],
				checks: [{ kind: "word-band", max: 1 }],
			},
			fixturePath: undefined,
			transcriptPath: undefined,
			prompt: "Reply with the single word OK.",
			tools: [],
			settings: undefined,
			agents: undefined,
			corpusFiles: [],
			projectFiles: [],
			checks: [{ kind: "word-band", max: 1 }],
		};
		const sampleSettings: SessionSettings = {
			model: "haiku",
			budgetUsd: 0.2,
		};
		const sampleAttempt = {
			attemptDirectory: "/runs/attempt",
			metrics: undefined,
			transcriptFile: "/runs/transcript.jsonl",
			transcriptDiagnostics: {
				state: "complete",
				prefixLinesExcluded: 0,
				sourceLineCount: 1,
				measuredLineCount: 1,
				toolUseOccurrences: { total: 0, byName: [] },
				toolErrors: [],
				repeatedBashCommands: [],
				issues: [],
			},
			reply: "OK",
			outcome: "SUCCESSFUL" as const,
			checks: [
				{
					kind: "word-band" as const,
					status: "PASS" as const,
					detail: "1 word",
				},
			],
			contextManifest: {
				paths: ["output-styles/brief.md"],
			},
		};

		expect(() =>
			// SAFETY: Exercising runtime rejection when raw session attempt data carries legacy string paths
			buildSessionAttemptRecord({
				sessionCase: sampleCase,
				settings: sampleSettings,
				lineage: "b".repeat(64),
				corpusFiles: [],
				corpusOrigin: { kind: "live" },
				// oxlint-disable-next-line anti-slop/no-chained-type-assertions, typescript/no-unsafe-type-assertion
				attempt: sampleAttempt as unknown as SessionAttempt,
				elapsedMs: 123,
			}),
		).toThrow(/expected object, received string/u);
	});
});

describe("the state grades a session attempt record carries", () => {
	function noReplyAttempt(
		grade: Immutable<Partial<SessionAttempt>>,
	): SessionAttempt {
		return {
			...smokeAttempt(),
			reply: undefined,
			outcome: "NO_REPLY",
			checks: [],
			contextManifest: undefined,
			...grade,
		};
	}

	function built(
		grade: Immutable<Partial<SessionAttempt>>,
	): SessionAttemptRecord {
		return buildSessionAttemptRecord({
			sessionCase: smokeCase(),
			settings: { model: "haiku", effort: "low", budgetUsd: 0.2 },
			lineage: "b".repeat(64),
			corpusFiles: [],
			corpusOrigin: { kind: "live" },
			attempt: noReplyAttempt(grade),
			elapsedMs: 123,
		});
	}

	it("records the named results beside an empty checks array for a no-reply attempt", () => {
		const graded = built({
			stateResults: [{ name: "tree-clean", status: "PASS", detail: "clean" }],
		});

		expect(graded).toMatchObject({
			outcome: "NO_REPLY",
			checks: [],
			stateResults: [{ name: "tree-clean", status: "PASS", detail: "clean" }],
		});
		expect(parseSessionAttemptRecord(JSON.stringify(graded))).toEqual(graded);
	});

	it("records a grading error rather than a state result when the scorer could not grade", () => {
		const graded = built({
			stateGradingError: "scorer sh score.sh exited 4: broken",
		});

		expect(graded).toMatchObject({
			stateGradingError: "scorer sh score.sh exited 4: broken",
		});
		expect(graded).not.toHaveProperty("stateResults");
	});

	it("refuses a record carrying both graded results and the reason it could not grade", () => {
		const graded = built({
			stateResults: [{ name: "tree-clean", status: "PASS", detail: "clean" }],
		});

		const both = {
			...graded,
			stateGradingError: "scorer sh score.sh exited 4: broken",
		};

		expect(sessionAttemptRecordSchema.safeParse(both).success).toBe(false);
	});
});
