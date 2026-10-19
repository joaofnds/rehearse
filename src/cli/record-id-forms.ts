import { UsageError } from "#cli/command-usage";

/**
 * Both attempt kinds name two segments, so the kind is spelled in the prefix
 * rather than sniffed from the first segment's shape: a session attempt is a
 * case and a uuid, a stage attempt a lineage and a timestamp, and only the
 * prefix tells a reader or this parser which one it has.
 */
const ID_FORMS: readonly string[] = [
	"case:<id>",
	"run:<name>",
	"checkpoint:<run>/<stage>",
	"attempt:session:<case>/<uuid>",
	"attempt:stage:<lineage>/<timestamp>",
	"group:<group-id>",
	"rep:stage:<group-id>/<rep-id>/<stage>",
	"rep:session:<group-id>/<rep-id>",
	"comparison:<manifest-digest>",
];

const SHORT_ID_FORMS: readonly string[] = [
	"<case>/r<n>",
	"<case>/g<n>",
	"<case>/r<n>/s<k>",
];

function recordIdForms(): readonly string[] {
	return [...ID_FORMS, ...SHORT_ID_FORMS];
}

function unknownRecordKind(text: string): UsageError {
	return new UsageError(
		`Record id ${text} names no record kind: use ${ID_FORMS.join(", ")}`,
	);
}

export { recordIdForms, SHORT_ID_FORMS, unknownRecordKind };
