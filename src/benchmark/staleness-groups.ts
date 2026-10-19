import concurrentMap from "./concurrent-map";
import { parseConfirmationGroupRecord } from "./confirmation-record";
import type { ParsedConfirmationGroupRecord } from "./confirmation-record";
import type { Immutable } from "./contracts";
import { textIfPresent } from "./file-presence";
import { confirmationGroupIds, confirmationGroupPaths } from "./run-layout";
import type {
	CurrentSessionKnobs,
	RecordStaleness,
	StalenessReport,
} from "./staleness-contract";
import type { CorpusJudgedAgainst } from "./staleness-current-corpus";
import {
	sessionGroupChanges,
	stageGroupChanges,
} from "./staleness-group-corpus";
import judgeConfirmationGroup from "./staleness-group-judgment";
import { SessionCaseCorpora } from "./staleness-session-corpus";

class GroupStalenessRecords {
	private readonly sessionCorpora: SessionCaseCorpora;
	public constructor(
		private readonly runsDirectory: string,
		private readonly against: CorpusJudgedAgainst,
		private readonly knobs: CurrentSessionKnobs,
	) {
		this.sessionCorpora = new SessionCaseCorpora(against.source);
	}
	public async read(groupId: string): Promise<StalenessReport> {
		const { runsDirectory } = this;
		const paths = confirmationGroupPaths(runsDirectory, groupId);
		const text = await textIfPresent(paths.groupFile);
		if (text === undefined) {
			return { records: [], unreadable: [] };
		}
		return await this.readRecord(groupId, text);
	}
	private async readRecord(
		groupId: string,
		text: string,
	): Promise<StalenessReport> {
		const id = `group:${groupId}`;
		try {
			const record = parseConfirmationGroupRecord(text);
			const judged = await this.judge(groupId, record);
			return { records: [judged], unreadable: [] };
		} catch (error) {
			return {
				records: [],
				unreadable: [
					{
						id,
						reason: error instanceof Error ? error.message : String(error),
					},
				],
			};
		}
	}

	private async judge(
		groupId: string,
		record: Immutable<ParsedConfirmationGroupRecord>,
	): Promise<RecordStaleness> {
		const {
			runsDirectory,
			against: { source, instructions, underTest },
			knobs,
		} = this;
		const id = `group:${groupId}`;
		const corpus =
			record.mode === "session"
				? await sessionGroupChanges(
						{ groupId, runsDirectory },
						{
							current: async () => await this.sessionCorpora.get(record.caseId),
							files: record.inputs.files,
						},
						source,
					)
				: await stageGroupChanges(
						{ groupId, runsDirectory },
						record.inputs.files,
						{ instructions, source },
					);
		return judgeConfirmationGroup({ corpus, id, knobs, record, underTest });
	}
}

async function groupStalenessAgainst(
	runsDirectory: string,
	against: CorpusJudgedAgainst,
	knobs: CurrentSessionKnobs,
): Promise<StalenessReport> {
	const reading = new GroupStalenessRecords(runsDirectory, against, knobs);
	const readings = await concurrentMap(
		await confirmationGroupIds(runsDirectory),
		async (groupId) => await reading.read(groupId),
	);
	return {
		records: readings.flatMap(({ records }) => records),
		unreadable: readings.flatMap(({ unreadable }) => unreadable),
	};
}

export { groupStalenessAgainst as default };
