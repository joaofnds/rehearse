import { defaultStringifySearch } from "@tanstack/react-router";

import type { JsonValue } from "#benchmark/json-value";

const SEARCH_FIELDS: readonly string[] = [
	"view",
	"layout",
	"step",
	"focus",
	"event",
	"comparison",
	"file",
	"sourceRun",
	"sourceStep",
	"start",
	"end",
	"caseId",
	"corpusVersion",
	"query",
	"status",
	"kind",
	"corpus",
	"sort",
	"invalidatedBy",
];

function stringifyRouteSearch(
	search: Readonly<Record<string, JsonValue | undefined>>,
): string {
	const fields = new Set([...SEARCH_FIELDS, ...Object.keys(search)]);
	const entries: [string, JsonValue | undefined][] = [];
	for (const field of fields) {
		if (Object.hasOwn(search, field)) {
			entries.push([field, search[field]]);
		}
	}

	return defaultStringifySearch(Object.fromEntries(entries));
}

export { stringifyRouteSearch as default };
