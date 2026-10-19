import { runHistoryResponseSchema } from "#server/api-test-responses";
import SavedEvidenceHttpDriver from "#server/api-test-saved-evidence-driver";

interface ApiTestTransport {
	readonly request: (
		path: string,
		options?: { readonly signal: Readonly<AbortSignal> | null },
	) => Response | Promise<Response>;
}

interface CorpusVersionFileRequest {
	readonly prefix: string;
	readonly path?: string;
}

interface StageEvidenceIdentity {
	readonly run: string;
	readonly stage: string;
	readonly section: string;
	readonly item: string;
	readonly index: string;
}

interface FinalEvidenceIdentity {
	readonly run: string;
	readonly item: string;
	readonly index: string;
}

interface ConfirmationResultIdentity {
	readonly groupId: string;
	readonly repId: string;
}

/** Domain reads through the real HTTP composition; refusal responses stay inspectable. */
class ApiHttpDriver {
	public readonly savedEvidence: SavedEvidenceHttpDriver;

	public constructor(private readonly app: ApiTestTransport) {
		this.savedEvidence = new SavedEvidenceHttpDriver(app);
	}

	public async read(path: string): Promise<Response> {
		return await this.app.request(path);
	}

	public async runs(query = ""): Promise<Response> {
		return await this.app.request(`/api/runs${query}`);
	}

	public async run(run: string): Promise<Response> {
		return await this.app.request(`/api/runs/${encodeURIComponent(run)}`);
	}

	public async claimedRows(): Promise<
		ReturnType<typeof runHistoryResponseSchema.parse>["rows"]
	> {
		const response = await this.runs();
		const body = runHistoryResponseSchema.parse(await response.json());

		return body.rows.filter((row) => "shortId" in row);
	}

	public async selectedRuns(
		groups: readonly (readonly string[])[],
	): Promise<Response> {
		const query = groups
			.map((ids) => `ids=${encodeURIComponent(ids.join(","))}`)
			.join("&");
		return await this.runs(`?${query}`);
	}
	public async corpusVersion(prefix: string): Promise<Response> {
		return await this.read(`/api/corpus/versions/${prefix}`);
	}
	public async corpusVersionFile({
		prefix,
		path,
	}: CorpusVersionFileRequest): Promise<Response> {
		return await this.read(
			`/api/corpus/versions/${prefix}/file${path === undefined ? "" : `?path=${encodeURIComponent(path)}`}`,
		);
	}
	public async stageEvidence(
		identity: StageEvidenceIdentity,
	): Promise<Response> {
		return await this.read(
			`/api/runs/${identity.run}/stages/${identity.stage}/evidence/${identity.section}/${identity.item}/${identity.index}`,
		);
	}
	public async finalEvidence(
		identity: FinalEvidenceIdentity,
	): Promise<Response> {
		return await this.read(
			`/api/runs/${identity.run}/final/evidence/${identity.item}/${identity.index}`,
		);
	}

	public async corpusFile(path?: string): Promise<Response> {
		return await this.app.request(
			`/api/corpus/file${path === undefined ? "" : `?path=${encodeURIComponent(path)}`}`,
		);
	}

	public async groupReads(groupId: string): Promise<Response> {
		return await this.app.request(`/api/groups/${groupId}/reads`);
	}

	public async confirmationResult(
		identity: ConfirmationResultIdentity,
	): Promise<Response> {
		return await this.app.request(
			`/api/groups/${identity.groupId}/reps/${identity.repId}/attempt/result`,
		);
	}

	public async record(id: string): Promise<Response> {
		return await this.app.request(`/api/records/${encodeURIComponent(id)}`);
	}

	public async history(href: string): Promise<Response> {
		return await this.app.request(`/api${href}/history`);
	}

	public async events(
		runId: string,
		signal?: Readonly<AbortSignal>,
	): Promise<Response> {
		return await this.app.request(`/api/runs/${runId}/events`, {
			signal: signal ?? null,
		});
	}
}

export { ApiHttpDriver as default };

export type { ApiTestTransport };
