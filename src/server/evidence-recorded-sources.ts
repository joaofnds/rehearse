import type {
	LocalCheckResult,
	RecordedStageEvidence,
	StageExchange,
} from "#benchmark/contracts";
import type { CitedFile } from "#benchmark/evidence-locator";
import { notFound } from "#server/evidence-source-contract";

const ORDINAL_BASE = 1;

interface RecordedSourcesProps {
	readonly texts: (
		source: RecordedStageEvidence["source"],
	) => readonly CitedFile[];
	readonly diff: string | undefined;
	readonly commitSubjects: readonly string[] | undefined;
	readonly exchanges: readonly StageExchange[];
	readonly harness: {
		readonly checkIntegrity?: LocalCheckResult;
		readonly localChecks?: LocalCheckResult;
		readonly harnessFailure?: string;
	};
}

interface FileCitation {
	readonly source: RecordedStageEvidence["source"];
	readonly file: string;
}

interface ExchangeCitation {
	readonly exchange: number;
	readonly field: "message" | "productOwnerAnswer";
}

interface SubjectCitation {
	readonly index: number;
}

interface HarnessCitation {
	readonly result: "checkIntegrity" | "localChecks" | "harnessFailure";
}

type RecordedHarnessResult =
	| {
			readonly result: "checkIntegrity" | "localChecks";
			readonly value?: LocalCheckResult;
	  }
	| { readonly result: "harnessFailure"; readonly value?: string };

class RecordedSources {
	private readonly texts: RecordedSourcesProps["texts"];
	private readonly diff: RecordedSourcesProps["diff"];
	private readonly commitSubjects: RecordedSourcesProps["commitSubjects"];
	private readonly exchanges: RecordedSourcesProps["exchanges"];
	private readonly harness: RecordedSourcesProps["harness"];

	public constructor(props: RecordedSourcesProps) {
		this.texts = props.texts;
		this.diff = props.diff;
		this.commitSubjects = props.commitSubjects;
		this.exchanges = props.exchanges;
		this.harness = props.harness;
	}

	public file({ source, file }: FileCitation): CitedFile {
		const recorded = this.texts(source).find(({ file: name }) => name === file);
		if (recorded === undefined) {
			throw notFound(`The record holds no ${file} for ${source}`);
		}

		return recorded;
	}

	public exchangeText({ exchange, field }: ExchangeCitation): string {
		const recorded = this.exchanges[exchange];
		const text =
			field === "message"
				? recorded?.agent.message
				: recorded?.productOwnerAnswer;
		if (text === undefined) {
			throw notFound(
				`The record holds no ${field} in exchange ${String(exchange + ORDINAL_BASE)}`,
			);
		}

		return text;
	}

	public subjectsForCitation({ index }: SubjectCitation): readonly string[] {
		const subjects = this.commitSubjects ?? [];
		if (subjects[index] === undefined) {
			throw notFound(
				`The record holds no commit subject ${String(index + ORDINAL_BASE)}`,
			);
		}

		return subjects;
	}

	public diffText(): string {
		return this.diff ?? "";
	}

	public harnessResult({ result }: HarnessCitation): RecordedHarnessResult {
		if (result === "harnessFailure") {
			const value = this.harness.harnessFailure;

			return value === undefined ? { result } : { result, value };
		}

		const value = this.harness[result];

		return value === undefined ? { result } : { result, value };
	}
}

export { RecordedSources as default };
export type { RecordedSourcesProps, RecordedHarnessResult };
