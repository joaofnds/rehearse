import { Hono } from "hono";
import {
	archiveConfirmation,
	ConfirmationArchiveRefusalError,
	listConfirmationArchives,
	restoreConfirmation,
} from "#benchmark/confirmation-archive";
import type { ConfirmationArchives } from "#benchmark/confirmation-archive";
import { redactAbsolutePaths } from "./redact-path";

export interface ConfirmationArchiveDependencies {
	readonly runsDirectory: string;
}

export const createConfirmationArchiveApp = ((
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
					unreadable: listing.unreadable.map(
						({
							id,
							reason,
							groupId,
						}): ConfirmationArchives["unreadable"][number] => {
							const redacted = redactAbsolutePaths(reason);
							return groupId === undefined
								? { id, reason: redacted }
								: { id, reason: redacted, groupId };
						},
					),
				});
			} catch (error) {
				return context.json(
					{
						error: redactAbsolutePaths(
							error instanceof Error ? error.message : String(error),
						),
					},
					500,
				);
			}
		})
		.post("/api/confirmation-archives/:groupId/archive", async (context) => {
			try {
				const archived = await archiveConfirmation({
					runsDirectory: dependencies.runsDirectory,
					groupId: context.req.param("groupId"),
					archivedAt: new Date().toISOString(),
				});
				return context.json(archived);
			} catch (error) {
				return context.json(
					{
						error: redactAbsolutePaths(
							error instanceof Error ? error.message : String(error),
						),
					},
					error instanceof ConfirmationArchiveRefusalError ? error.status : 500,
				);
			}
		})
		.post("/api/confirmation-archives/:groupId/restore", async (context) => {
			try {
				await restoreConfirmation({
					runsDirectory: dependencies.runsDirectory,
					groupId: context.req.param("groupId"),
				});
				return context.json({ restored: true });
			} catch (error) {
				return context.json(
					{
						error: redactAbsolutePaths(
							error instanceof Error ? error.message : String(error),
						),
					},
					error instanceof ConfirmationArchiveRefusalError ? error.status : 500,
				);
			}
		})) satisfies (dependencies: ConfirmationArchiveDependencies) => Hono;

export type ConfirmationArchiveRoutes = ReturnType<
	typeof createConfirmationArchiveApp
>;
