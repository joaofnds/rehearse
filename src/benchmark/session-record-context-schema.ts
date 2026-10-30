import { z } from "zod";

const EMPTY_COLLECTION_LENGTH = 0;

const EXECUTION_FAILURE_SESSION_SCHEMA_VERSION = 2;

const LEGACY_SESSION_SCHEMA_VERSION = 1;

const STATE_GRADING_SESSION_SCHEMA_VERSION = 3;

const corpusSnapshotOriginSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("live") }).strict(),
	z
		.object({ kind: z.literal("directory"), source: z.string().nonempty() })
		.strict(),
]);

type CorpusSnapshotOrigin = z.infer<typeof corpusSnapshotOriginSchema>;

const sha256Schema = z
	.string()
	.regex(/^[0-9a-f]{64}$/u, "Invalid SHA-256 digest");

const corpusFileSchema = z
	.object({
		path: z.string().nonempty(),
		resolvedPath: z.string().nonempty(),
		sha256: sha256Schema,
	})
	.strict();

const namesSchema = z.array(z.string().nonempty());

/**
 * The setup a session ran with, as names and digests only, since the browser
 * serves records on loopback without authentication and a setting value can be
 * a credential.
 */
const actualSetupRecordSchema = z
	.object({
		hookEvents: namesSchema,
		kind: z.literal("actual"),
		mcpConfigSha256: sha256Schema,
		mcpServers: namesSchema,
		plugins: namesSchema,
		settingsKeys: namesSchema,
		settingsSha256: sha256Schema,
	})
	.strict();

const sessionSetupRecordSchema = z.discriminatedUnion("kind", [
	z.object({ kind: z.literal("isolated") }).strict(),
	actualSetupRecordSchema,
]);

const contextHalfSchema = z.enum(["corpus", "project"]);

type ContextHalf = z.infer<typeof contextHalfSchema>;

const manifestEntrySchema = z
	.object({
		half: contextHalfSchema,
		path: z.string().nonempty(),
	})
	.strict();

const contextManifestSchema = z
	.object({
		paths: z.array(manifestEntrySchema),
	})
	.strict();

const manifestDivergenceSchema = z
	.object({
		half: contextHalfSchema,
		kind: z.enum(["undeclared-file", "unloaded-file"]),
		path: z.string().nonempty(),
	})
	.strict();

const legacyManifestEntrySchema = z.string().nonempty();

const legacyContextManifestSchema = z
	.object({
		paths: z.array(legacyManifestEntrySchema),
	})
	.strict();

const legacyManifestDivergenceSchema = z
	.object({
		kind: z.enum(["undeclared-file", "unloaded-file"]),
		path: z.string().nonempty(),
	})
	.strict();

export {
	EMPTY_COLLECTION_LENGTH,
	EXECUTION_FAILURE_SESSION_SCHEMA_VERSION,
	LEGACY_SESSION_SCHEMA_VERSION,
	STATE_GRADING_SESSION_SCHEMA_VERSION,
	corpusSnapshotOriginSchema,
	sha256Schema,
	corpusFileSchema,
	actualSetupRecordSchema,
	sessionSetupRecordSchema,
	contextHalfSchema,
	manifestEntrySchema,
	contextManifestSchema,
	manifestDivergenceSchema,
	legacyManifestEntrySchema,
	legacyContextManifestSchema,
	legacyManifestDivergenceSchema,
};
export type { CorpusSnapshotOrigin, ContextHalf };
