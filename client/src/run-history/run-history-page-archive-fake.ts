import PipelineRunRowBuilder from "#client/run-history/run-history-page-pipeline-row-builder";
import type { Reply } from "#client/test-support/fetch-stub";
import { FakeServer } from "#client/test-support/fetch-stub";
import LiveReply from "#client/test-support/live-reply";
import {
	SHELL_BASELINE,
	settingsReading,
} from "#client/test-support/render-app";

import ArchiveScenarioBuilder from "./run-history-page-archive-scenario-builder";
import type { ArchiveScenario } from "./run-history-page-archive-scenario-builder";
import ConfirmationGroupRowBuilder from "./run-history-page-group-row-builder";
import type { RunListingResponse } from "./run-history-query";

const groupId = "unfinished-confirmation";
const archivedAt = "2026-10-18T12:00:00.000Z";
const archivedNeighbor = "archived-neighbor";
const spendCeilingUsd = 5;
const issue = {
	id: `group:${groupId}`,
	incompleteConfirmation: { groupId },
	kind: "group",
	reason: "incomplete: no group.json recorded",
} as const;

/** Shared saved records as observed by listing, archive reads and archive writes. */
class ArchiveHistoryFake {
	private readonly archived: Set<string>;
	private invalidMetadata: boolean;
	private summarySaved = false;
	public archiveRefusal: Reply | undefined;

	public constructor(private readonly scenario: ArchiveScenario) {
		this.archived = new Set(scenario.archived);
		this.invalidMetadata = scenario.invalidMetadata;
		this.archiveRefusal = scenario.archiveRefusal;
	}

	public get isArchived(): boolean {
		return this.archived.has(groupId);
	}

	public archiveFromAnotherClient(): void {
		this.archived.add(groupId);
	}

	public restoreFromAnotherClient(): void {
		this.archived.delete(groupId);
	}

	public saveSummary(): void {
		this.summarySaved = true;
		this.archived.delete(groupId);
	}

	private listing(): Reply {
		return {
			body: {
				launches: [],
				rows: this.rows(),
				unreadable: this.unreadableRuns(),
			},
			status: 200,
		};
	}

	private rows(): RunListingResponse["rows"] {
		return [
			...(this.scenario.keepRun
				? [new PipelineRunRowBuilder({}).withExecutionProgress().build()]
				: []),
			...(this.summarySaved && this.scenario.summary === "valid"
				? [
						new ConfirmationGroupRowBuilder({
							groupId,
							recordId: issue.id,
						}).build(),
					]
				: []),
		];
	}

	private unreadableRuns(): RunListingResponse["unreadable"] {
		if (this.scenario.summary !== undefined) {
			return this.summarySaved && this.scenario.summary === "malformed"
				? [{ id: issue.id, kind: "group", reason: "Saved summary is invalid" }]
				: [];
		}
		if (this.invalidMetadata) {
			return [
				{ id: issue.id, kind: "group", reason: "Invalid archive metadata" },
			];
		}

		return [
			...(this.isArchived ? [] : [issue]),
			...(this.scenario.pendingAction !== undefined &&
			!this.archived.has(archivedNeighbor)
				? [
						{
							...issue,
							id: `group:${archivedNeighbor}`,
							incompleteConfirmation: { groupId: archivedNeighbor },
						},
					]
				: []),
		];
	}

	private archives(): Reply {
		return {
			body: {
				archived: [...this.archived].map((id) => ({ archivedAt, groupId: id })),
				unreadable: this.invalidMetadata
					? [{ groupId, id: groupId, reason: "Invalid archive metadata" }]
					: [],
			},
			status: 200,
		};
	}

	private archive(): Reply {
		if (this.archiveRefusal !== undefined) {
			return this.archiveRefusal;
		}
		this.archived.add(groupId);

		return {
			body:
				this.scenario.pendingAction === undefined
					? { archivedAt, groupId }
					: {},
			status: 200,
		};
	}

	private restore(id: string): Reply {
		if (this.scenario.restoreRefusal !== undefined) {
			return this.scenario.restoreRefusal;
		}
		this.archived.delete(id);
		this.invalidMetadata = false;

		return {
			body: this.scenario.pendingAction === undefined ? { restored: true } : {},
			status: 200,
		};
	}

	public install(): void {
		const routes = new Map<string, Reply | LiveReply>([
			...(this.scenario.legacy
				? [...SHELL_BASELINE].map(([path, body]): [string, Reply] => [
						`GET ${path}`,
						{ body, status: 200 },
					])
				: []),
			[
				"GET /api/settings",
				{
					body: settingsReading(this.scenario.legacy ? null : spendCeilingUsd),
					status: 200,
				},
			],
			["GET /api/run-listing", new LiveReply(() => this.listing())],
			["GET /api/run-staleness", { body: { records: {} }, status: 200 }],
			["GET /api/confirmation-archives", new LiveReply(() => this.archives())],
			[
				`POST /api/confirmation-archives/${groupId}/archive`,
				new LiveReply(() => this.archive()),
			],
			[
				`POST /api/confirmation-archives/${groupId}/restore`,
				new LiveReply(() => this.restore(groupId)),
			],
			[
				`POST /api/confirmation-archives/${archivedNeighbor}/restore`,
				new LiveReply(() => this.restore(archivedNeighbor)),
			],
		]);
		new FakeServer(routes).install();
	}
}

function serveArchiveHistory(
	props: Partial<ArchiveScenario> = {},
): ArchiveHistoryFake {
	const history = new ArchiveHistoryFake(
		new ArchiveScenarioBuilder(props).build(),
	);
	history.install();

	return history;
}

export { ArchiveHistoryFake, archivedNeighbor, groupId, serveArchiveHistory };
