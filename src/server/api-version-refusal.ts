import type { FoundCorpusVersion } from "#benchmark/corpus-version";
import type {
	HTTP_STATUS_CONFLICT,
	HTTP_STATUS_NOT_FOUND,
} from "#server/http-status";

/** Why a version prefix opened nothing: no version, or more than one. */
interface CorpusVersionRefusal {
	readonly body: {
		readonly error: string;
		readonly candidates: readonly string[];
	};
	readonly status: typeof HTTP_STATUS_NOT_FOUND | typeof HTTP_STATUS_CONFLICT;
}

function versionRefusal(
	found: Exclude<FoundCorpusVersion, { readonly kind: "found" }>,
): CorpusVersionRefusal {
	if (found.kind === "missing") {
		return {
			body: { candidates: [], error: "No corpus version matches" },
			status: 404,
		};
	}

	return {
		body: {
			candidates: found.candidates,
			error: "The corpus version prefix is ambiguous",
		},
		status: 409,
	};
}

export { versionRefusal as default };
