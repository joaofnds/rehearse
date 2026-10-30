import { join } from "node:path";

import type { SessionCase } from "./case";
import { loadCase, readCaseDeclaration, requireSessionCase } from "./case";
import type { ComparisonArm } from "./comparison-record";
import type { Immutable } from "./contracts";
import { runSessionAttempt } from "./session-attempt";
import { writeComparisonCorpus } from "./session-comparison-corpus-test-fixture";
import SessionComparisonRequestBuilder, {
	ABSENT_HOME,
} from "./session-comparison-request-test-builder";
import StateScoringProvider from "./session-comparison-state-provider-fixture";
import type { StateGroupCase } from "./session-comparison-test-contract";
import { runSessionConfirmation } from "./session-confirmation";

interface StateComparisonDirectories {
	readonly root: string;
	readonly projectsDirectory: string;
}

interface StateGroup {
	readonly groupRecordFile: string;
	readonly seenStyles: readonly string[];
}

interface StateComparisonGroups {
	readonly baseline: StateGroup;
	readonly candidate: StateGroup;
	readonly control: StateGroup;
}

interface StateComparisonInputs {
	readonly manifestPath: string;
	readonly runsDirectory: string;
	readonly groups: StateComparisonGroups;
}

interface StateGroupRequest extends StateGroupCase {
	readonly runsDirectory: string;
	readonly role: ComparisonArm;
}

async function readDeclaredStateCheck(): Promise<
	Immutable<NonNullable<SessionCase["declaration"]["stateCheck"]>>
> {
	const declaration = await readCaseDeclaration("state-probe");
	if (declaration.kind !== "session") {
		throw new Error("state-probe is expected to be a session case");
	}

	const { stateCheck } = declaration;
	if (stateCheck === undefined) {
		throw new Error("state-probe is expected to declare a state check");
	}

	return stateCheck;
}

async function stateGroupCase(): Promise<StateGroupCase> {
	const benchmarkCase = requireSessionCase(await loadCase("state-probe"));
	const { sessionBudgetUsd } = benchmarkCase.declaration;
	if (sessionBudgetUsd === undefined) {
		throw new Error("state-probe is expected to declare a session budget");
	}

	return { benchmarkCase, declaredBudgetUsd: sessionBudgetUsd };
}

function armCase(benchmarkCase: SessionCase, role: ComparisonArm): SessionCase {
	if (role !== "control") {
		return benchmarkCase;
	}

	return {
		...benchmarkCase,
		corpusFiles: [],
		declaration: { ...benchmarkCase.declaration, corpusFiles: [] },
	};
}

class StateComparisonFixture {
	public constructor(private readonly props: StateComparisonDirectories) {}

	public async writeManifest(): Promise<StateComparisonInputs> {
		const runsDirectory = join(this.props.root, "runs");
		const benchmark = await stateGroupCase();
		const groups = {
			baseline: await this.writeGroup({
				...benchmark,
				role: "baseline",
				runsDirectory,
			}),
			candidate: await this.writeGroup({
				...benchmark,
				role: "candidate",
				runsDirectory,
			}),
			control: await this.writeGroup({
				...benchmark,
				role: "control",
				runsDirectory,
			}),
		};
		const arms = {
			baseline: groups.baseline.groupRecordFile,
			candidate: groups.candidate.groupRecordFile,
			control: groups.control.groupRecordFile,
		};
		const manifestPath = join(this.props.root, "comparison.json");

		await Bun.write(
			manifestPath,
			`${JSON.stringify({ cases: [{ arms, caseId: "state-probe" }], schemaVersion: 1 })}\n`,
		);

		return { groups, manifestPath, runsDirectory };
	}

	private async writeGroup({
		benchmarkCase,
		declaredBudgetUsd,
		role,
		runsDirectory,
	}: StateGroupRequest): Promise<StateGroup> {
		const corpus = await writeComparisonCorpus(
			{ root: this.props.root, runsDirectory },
			{ caseId: "state-probe", role },
		);
		const provider = new StateScoringProvider({
			projectsDirectory: this.props.projectsDirectory,
		});
		const seenStyles: string[] = [];
		const runClaude = provider.forRole({
			recordStyle: (style) => {
				seenStyles.push(style);
			},
			role,
		});
		const request = new SessionComparisonRequestBuilder({
			corpus,
			groupId: `state-probe-${role}`,
			runsDirectory,
			sessionBudgetUsd: declaredBudgetUsd,
			sessionCase: armCase(benchmarkCase, role),
		}).build();

		const outcome = await runSessionConfirmation(
			{
				executeAttempt: async (plan) =>
					await runSessionAttempt({
						corpusSnapshot: plan.corpusSnapshot,
						environment: {},
						home: ABSENT_HOME,
						liveCitations: { home: ABSENT_HOME, roots: [] },
						projectsDirectory: this.props.projectsDirectory,
						recordDirectory: plan.recordDirectory,
						runClaude,
						sessionCase: plan.sessionCase,
						settings: plan.settings,
					}),
			},
			request,
		);

		return { groupRecordFile: outcome.groupRecordFile, seenStyles };
	}
}

export { StateComparisonFixture as default, readDeclaredStateCheck };
