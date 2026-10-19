import { describe, expect, it } from "bun:test";
import { basename, join } from "node:path";

import { failureOf } from "#cli/cli-test-support";

import { parseConfirmationGroupRecord } from "./confirmation-record";
import { SymlinkedEntryError } from "./file-presence";
import { runSessionConfirmation } from "./session-confirmation";
import { skillMutationProvider } from "./session-confirmation-provider-test-fixtures";
import {
	PROVIDER_CALL_COUNT_INCREMENT,
	TRACKED_GIT_PATH_COMPONENT_INDEX,
	confirmationRequest,
	declaredCorpusCase,
	recordedAttempt,
} from "./session-confirmation-test-fixtures";
import {
	PRIVATE_PREFIX_BYTES,
	historyFilePaths,
	historySessionWorkspace,
	hostileCorpus,
	instructionCorpus,
	resources,
	symlinkedPrefixWorkspace,
} from "./session-confirmation-workspace-test-fixtures";
import { readShortIds } from "./short-id";

resources.registerCleanup();

async function claimsNoShortIdWhenItsCorpusIsRefused(): Promise<void> {
	const { root, sessionCase, source } = await hostileCorpus();

	const execution = runSessionConfirmation(
		{
			executeAttempt: async () =>
				await Promise.reject(new Error("a provider call must not happen")),
			resolveCorpus: async () => await Promise.resolve(source),
		},
		confirmationRequest({
			groupId: "hostile-live-group",
			preflight: { missing: "metrics", status: "MISSING" },
			runsDirectory: join(root, "runs"),
			sessionCase,
		}),
	);
	await failureOf(execution);

	expect(await readShortIds(join(root, "runs"), "hostile-live")).toEqual([]);
}

async function refusesAnOutOfExtentLiveCorpusFileBeforeStartingARep(): Promise<void> {
	const expectedProviderCalls = 0;

	const { root, sessionCase, source } = await hostileCorpus();
	let providerCalls = 0;

	const execution = runSessionConfirmation(
		{
			executeAttempt: async () => {
				providerCalls += PROVIDER_CALL_COUNT_INCREMENT;
				return await Promise.reject(
					new Error("a provider call must not happen"),
				);
			},
			resolveCorpus: async () => await Promise.resolve(source),
		},
		confirmationRequest({
			groupId: "hostile-live-group",
			preflight: { missing: "metrics", status: "MISSING" },
			runsDirectory: join(root, "runs"),
			sessionCase,
		}),
	);
	const failure = await failureOf(execution);

	expect(failure.message).toContain("output-styles/foreign.md");
	expect(providerCalls).toBe(expectedProviderCalls);
}

async function freezesADeclaredSkillAndCLAUDEMdSoASourceEditCannotReachALaterRep(): Promise<void> {
	const { root, corpusRoot } = await instructionCorpus(
		"rehearse-session-skill-",
		{
			"CLAUDE.md": "original instructions\n",
			"skills/verify/SKILL.md": "original skill\n",
		},
	);
	const sessionCase = declaredCorpusCase("skill-group", [
		"skills/verify/SKILL.md",
		"CLAUDE.md",
	]);
	const provider = skillMutationProvider(corpusRoot);

	await runSessionConfirmation(
		provider,
		confirmationRequest({
			corpus: corpusRoot,
			groupId: "skill-group",
			runsDirectory: join(root, "runs"),
			sessionCase,
		}),
	);

	expect(provider.observed).toEqual([
		"original skill\n|original instructions\n",
		"original skill\n|original instructions\n",
	]);
}

async function freezesEveryFileOfAFixtureSCommittedHistoryAsANamedInput(): Promise<void> {
	const lowerBoundForHistoryCount = 0;

	const { root, corpusRoot, fixture, sessionCase } =
		await historySessionWorkspace();

	const outcome = await runSessionConfirmation(
		{
			executeAttempt: async (plan) => await recordedAttempt(plan),
		},
		confirmationRequest({
			corpus: corpusRoot,
			groupId: "history-group",
			runsDirectory: join(root, "runs"),
			sessionCase,
		}),
	);

	const group = parseConfirmationGroupRecord(
		await Bun.file(outcome.groupRecordFile).text(),
	);
	const frozen = group.inputs.files
		.filter((file) => file.kind === "fixture")
		.map((file) => file.path);
	const history = frozen.filter((path) => path.includes("dot-git/"));

	expect(history.length).toBeGreaterThan(lowerBoundForHistoryCount);
	expect(
		new Set(
			history.map(
				(path) => path.split("dot-git/")[TRACKED_GIT_PATH_COMPONENT_INDEX],
			),
		),
	).toEqual(new Set(await historyFilePaths(fixture.path)));
}

const linkedPrefixDigests = [
	{
		name: "matching digest",
		sha256: new Bun.CryptoHasher("sha256")
			.update(PRIVATE_PREFIX_BYTES)
			.digest("hex"),
	},
	{
		name: "mismatching digest",
		sha256: new Bun.CryptoHasher("sha256")
			.update("different prefix\n")
			.digest("hex"),
	},
];

function symlinkedTranscriptCases(): void {
	it.each(linkedPrefixDigests)(
		"refuses a $name before copying bytes or starting a rep",
		async ({ sha256 }) => {
			const { root, corpusRoot, transcriptPath, sessionCase } =
				await symlinkedPrefixWorkspace(sha256);
			const runsDirectory = join(root, "runs");
			const frozenPrefix = join(
				runsDirectory,
				"confirmations",
				"linked-prefix",
				"inputs",
				"transcript",
				basename(transcriptPath),
			);
			const calls: string[] = [];

			const failure = await failureOf(
				runSessionConfirmation(
					{
						executeAttempt: async (plan) => {
							calls.push(plan.recordDirectory);
							return await recordedAttempt(plan);
						},
					},
					confirmationRequest({
						corpus: corpusRoot,
						groupId: "linked-prefix",
						runsDirectory,
						sessionCase,
					}),
				),
			);

			expect(failure).toBeInstanceOf(SymlinkedEntryError);
			expect(calls).toEqual([]);
			expect(await Bun.file(frozenPrefix).exists()).toBe(false);
		},
	);
}

describe(runSessionConfirmation.name, () => {
	it(
		"claims no short id when its corpus is refused",
		claimsNoShortIdWhenItsCorpusIsRefused,
	);
	it(
		"refuses an out-of-extent live corpus file before starting a rep",
		refusesAnOutOfExtentLiveCorpusFileBeforeStartingARep,
	);
	it(
		"freezes a declared skill and CLAUDE.md so a source edit cannot reach a later rep",
		freezesADeclaredSkillAndCLAUDEMdSoASourceEditCannotReachALaterRep,
	);
	it(
		"freezes every file of a fixture's committed history as a named input",
		freezesEveryFileOfAFixtureSCommittedHistoryAsANamedInput,
	);
	describe(
		"when the declared transcript is a symlink",
		symlinkedTranscriptCases,
	);
});
