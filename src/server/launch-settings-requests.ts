import { isAbsolute, join } from "node:path";

import { z } from "zod";

import type { Immutable } from "#benchmark/contracts";
import type {
	LaunchJsonRequest,
	SetupCorpusChoice,
} from "#server/launches-contract";

const spendCeilingRequestSchema = z
	.object({ usd: z.number().positive() })
	.strict();

/**
 * Parsed into an absolute directory, since a relative path would resolve
 * against the server's directory. A path from `~/` is the operator's home,
 * as the server runs on the operator's machine.
 */
function absoluteDirectorySchema(home: string): z.ZodType<string, string> {
	return z
		.string()
		.transform((directory) =>
			directory.startsWith("~/")
				? join(home, directory.slice("~/".length))
				: directory,
		)
		.refine(
			isAbsolute,
			"Link a corpus directory by its absolute path, or one starting with ~/ for your home directory, because the server does not share the browser's working directory",
		);
}

function corpusLinkRequestSchema(
	home: string,
): z.ZodType<{ directory: string }> {
	return z.object({ directory: absoluteDirectorySchema(home) }).strict();
}

/** Setup's corpus path, where an empty or blank one means the live install. */
function setupCorpusRequestSchema(home: string): z.ZodType<SetupCorpusChoice> {
	return z
		.object({ directory: z.string() })
		.strict()
		.transform(({ directory }, context): SetupCorpusChoice => {
			if (directory.trim() === "") {
				return { kind: "live" };
			}

			const linked = absoluteDirectorySchema(home).safeParse(directory);
			if (!linked.success) {
				for (const issue of linked.error.issues) {
					context.addIssue({ code: "custom", message: issue.message });
				}

				return z.NEVER;
			}

			return { directory: linked.data, kind: "directory" };
		});
}

type ParsedSpendCeilingRequest =
	| {
			readonly success: true;
			readonly data: Immutable<z.infer<typeof spendCeilingRequestSchema>>;
	  }
	| { readonly success: false; readonly error: string };

async function parseSpendCeilingRequest(
	request: LaunchJsonRequest,
): Promise<ParsedSpendCeilingRequest> {
	const parsed = spendCeilingRequestSchema.safeParse(
		await request.json().catch((): undefined => undefined),
	);
	if (parsed.success) {
		return { data: parsed.data, success: true };
	}

	return { error: z.prettifyError(parsed.error), success: false };
}

type ParsedCorpusLinkRequest =
	| {
			readonly success: true;
			readonly data: Immutable<
				z.infer<ReturnType<typeof corpusLinkRequestSchema>>
			>;
	  }
	| { readonly success: false; readonly error: string };

async function parseCorpusLinkRequest({
	request,
	home,
}: CorpusSettingsRequestInput): Promise<ParsedCorpusLinkRequest> {
	const parsed = corpusLinkRequestSchema(home).safeParse(
		await request.json().catch((): undefined => undefined),
	);
	if (parsed.success) {
		return { data: parsed.data, success: true };
	}

	return {
		error: parsed.error.issues.map((issue) => issue.message).join("; "),
		success: false,
	};
}

type ParsedSetupCorpusRequest =
	| {
			readonly success: true;
			readonly data: Immutable<
				z.infer<ReturnType<typeof setupCorpusRequestSchema>>
			>;
	  }
	| { readonly success: false; readonly error: string };

async function parseSetupCorpusRequest({
	request,
	home,
}: CorpusSettingsRequestInput): Promise<ParsedSetupCorpusRequest> {
	const parsed = setupCorpusRequestSchema(home).safeParse(
		await request.json().catch((): undefined => undefined),
	);
	if (parsed.success) {
		return { data: parsed.data, success: true };
	}

	return {
		error: parsed.error.issues.map((issue) => issue.message).join("; "),
		success: false,
	};
}

interface CorpusSettingsRequestInput {
	readonly request: LaunchJsonRequest;
	readonly home: string;
}

export {
	spendCeilingRequestSchema,
	absoluteDirectorySchema,
	corpusLinkRequestSchema,
	setupCorpusRequestSchema,
	parseSpendCeilingRequest,
	parseCorpusLinkRequest,
	parseSetupCorpusRequest,
};
