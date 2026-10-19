import { Hono } from "hono";

import {
	ConfirmationArchiveRefusalError,
	archiveConfirmation,
	listConfirmationArchives,
	restoreConfirmation,
} from "#benchmark/confirmation-archive";
import type { ConfirmationArchives } from "#benchmark/confirmation-archive";

import { redactAbsolutePaths } from "./redact-path";

const INTERNAL_SERVER_ERROR = 500;

interface ConfirmationArchiveDependencies {
	readonly runsDirectory: string;
}

function redactedArchiveIssue({
	id,
	reason,
	groupId,
}: ConfirmationArchives["unreadable"][number]): ConfirmationArchives["unreadable"][number] {
	const redacted = redactAbsolutePaths(reason);

	return groupId === undefined
		? { id, reason: redacted }
		: { groupId, id, reason: redacted };
}

interface ArchiveErrorResponse {
	readonly error: string;
}

function archiveError(message: string): ArchiveErrorResponse {
	return { error: redactAbsolutePaths(message) };
}

const confirmationArchiveWrites = ((
	dependencies: ConfirmationArchiveDependencies,
) =>
	new Hono()
		.post("/api/confirmation-archives/:groupId/archive", async (context) => {
			try {
				const archived = await archiveConfirmation({
					archivedAt: new Date().toISOString(),
					groupId: context.req.param("groupId"),
					runsDirectory: dependencies.runsDirectory,
				});
				return context.json(archived);
			} catch (error) {
				return context.json(
					archiveError(error instanceof Error ? error.message : String(error)),
					error instanceof ConfirmationArchiveRefusalError
						? error.status
						: INTERNAL_SERVER_ERROR,
				);
			}
		})
		.post("/api/confirmation-archives/:groupId/restore", async (context) => {
			try {
				await restoreConfirmation({
					groupId: context.req.param("groupId"),
					runsDirectory: dependencies.runsDirectory,
				});
				return context.json({ restored: true });
			} catch (error) {
				return context.json(
					archiveError(error instanceof Error ? error.message : String(error)),
					error instanceof ConfirmationArchiveRefusalError
						? error.status
						: INTERNAL_SERVER_ERROR,
				);
			}
		})) satisfies (dependencies: ConfirmationArchiveDependencies) => Hono;

const createConfirmationArchiveApp = ((
	dependencies: ConfirmationArchiveDependencies,
) =>
	new Hono()
		.get("/api/confirmation-archives", async (context) => {
			try {
				const listing = await listConfirmationArchives(
					dependencies.runsDirectory,
				);
				return context.json({
					...listing,
					unreadable: listing.unreadable.map(redactedArchiveIssue),
				});
			} catch (error) {
				return context.json(
					archiveError(error instanceof Error ? error.message : String(error)),
					INTERNAL_SERVER_ERROR,
				);
			}
		})
		.route("/", confirmationArchiveWrites(dependencies))) satisfies (
	dependencies: ConfirmationArchiveDependencies,
) => Hono;

type ConfirmationArchiveRoutes = ReturnType<
	typeof createConfirmationArchiveApp
>;

export { createConfirmationArchiveApp as default };
export type { ConfirmationArchiveDependencies, ConfirmationArchiveRoutes };
