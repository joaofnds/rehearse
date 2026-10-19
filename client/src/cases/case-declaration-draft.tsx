import type { Check } from "#benchmark/session-check";
import type { DeclareCaseRequest } from "#server/case-declaration";
import type { PipelineCaseRequest } from "#server/task-bundle-contract";

const ORDINAL_BASE = 1;

const EMPTY_COLLECTION_LENGTH = 0;

type CheckKind = Check["kind"];

type CheckField =
	| "min"
	| "max"
	| "strings"
	| "name"
	| "regex"
	| "flags"
	| "names"
	| "paths";

/** The fields each check kind is built from, as their labels name them. */
const CHECK_FIELDS = {
	"files-read": ["paths"],
	"forbidden-pattern": ["name", "regex", "flags"],
	"forbidden-text": ["strings"],
	"tool-calls": ["min", "max", "names"],
	"word-band": ["min", "max"],
} as const satisfies Record<CheckKind, readonly CheckField[]>;

const CHECK_KINDS: readonly CheckKind[] = [
	"word-band",
	"forbidden-text",
	"forbidden-pattern",
	"tool-calls",
	"files-read",
];

const MULTILINE_FIELDS: ReadonlySet<CheckField> = new Set(["strings", "paths"]);

interface CheckDraft {
	readonly kind: CheckKind;
	readonly fields: Readonly<Partial<Record<CheckField, string>>>;
}

const NEW_CHECK: CheckDraft = { fields: {}, kind: "word-band" };

type CaseKind = "session" | "pipeline";

interface Draft {
	readonly kind: CaseKind;
	readonly id: string;
	readonly title: string;
	readonly targetPath: string;
	readonly task: string;
	readonly productBrief: string;
	/** The pipeline case whose steps and judges a new pipeline case starts from. */
	readonly from: string;
	readonly prompt: string;
	readonly tools: string;
	readonly corpusFiles: string;
	readonly checks: readonly CheckDraft[];
	readonly model: string;
	readonly sessionBudgetUsd: string;
}

const EMPTY_DRAFT: Draft = {
	checks: [NEW_CHECK],
	corpusFiles: "",
	from: "",
	id: "",
	kind: "session",
	model: "sonnet",
	productBrief: "",
	prompt: "",
	sessionBudgetUsd: "",
	targetPath: "",
	task: "",
	title: "",
	tools: "",
};

function commaList(text: string): string[] {
	return text
		.split(",")
		.map((item) => item.trim())
		.filter((item) => item !== "");
}

function lineList(text: string): string[] {
	return text
		.split("\n")
		.map((item) => item.trim())
		.filter((item) => item !== "");
}

/**
 * A blank field is left out, and any other is sent as a number even when it
 * is not one, so the server's parser names the field rather than the form
 * dropping it.
 */
function optionalNumber(text: string | undefined): number | undefined {
	return text === undefined || text.trim() === "" ? undefined : Number(text);
}

function builtCheck({ kind, fields }: CheckDraft): Check {
	switch (kind) {
		case "word-band": {
			return {
				kind,
				max: optionalNumber(fields.max),
				min: optionalNumber(fields.min),
			};
		}
		case "forbidden-text": {
			return { kind, strings: lineList(fields.strings ?? "") };
		}
		case "forbidden-pattern": {
			const flags = fields.flags ?? "";
			return {
				kind,
				patterns: [
					{
						flags: flags === "" ? undefined : flags,
						name: fields.name ?? "",
						regex: fields.regex ?? "",
					},
				],
			};
		}
		case "tool-calls": {
			const names = commaList(fields.names ?? "");
			return {
				kind,
				max: optionalNumber(fields.max),
				min: optionalNumber(fields.min),
				names: names.length === EMPTY_COLLECTION_LENGTH ? undefined : names,
			};
		}
		case "files-read": {
			return { kind, paths: lineList(fields.paths ?? "") };
		}
		default: {
			return kind satisfies never;
		}
	}
}

/** A field left `undefined` is absent from the posted JSON. */
function declarationRequest(draft: Draft): DeclareCaseRequest {
	return {
		checks: draft.checks.map(builtCheck),
		corpusFiles: lineList(draft.corpusFiles),
		id: draft.id.trim(),
		kind: "session",
		model: draft.model.trim(),
		prompt: draft.prompt,
		sessionBudgetUsd: optionalNumber(draft.sessionBudgetUsd),
		title: draft.title,
		tools: commaList(draft.tools),
	};
}

/** A new pipeline case as the server's pipeline route reads one. */

function pipelineRequest(draft: Draft, from: string): PipelineCaseRequest {
	return {
		from,
		id: draft.id.trim(),
		productBrief: draft.productBrief,
		targetPath: draft.targetPath.trim(),
		task: draft.task,
		title: draft.title,
	};
}

type DraftEdit = (change: Partial<Draft>) => void;

export {
	CHECK_FIELDS,
	CHECK_KINDS,
	declarationRequest,
	EMPTY_COLLECTION_LENGTH,
	EMPTY_DRAFT,
	MULTILINE_FIELDS,
	NEW_CHECK,
	ORDINAL_BASE,
	pipelineRequest,
};
export type { CaseKind, CheckDraft, CheckField, Draft, DraftEdit };
