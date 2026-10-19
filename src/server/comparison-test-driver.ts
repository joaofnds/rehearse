import type { ApiTestTransport } from "#server/api-test-http-driver";
import { comparisonResponseFrom } from "#server/comparison-response-test-schema";
import type { ComparisonResponse } from "#server/comparison-response-test-schema";
import type { ConfirmationAttemptHistoryIdentity } from "#server/history-read-identity";

type HistoryRequest = Pick<
	ConfirmationAttemptHistoryIdentity,
	"groupId" | "repId"
>;

class ComparisonDriver {
	public constructor(private readonly app: ApiTestTransport) {}
	public async indexRaw(): Promise<Response> {
		return await this.app.request("/api/comparisons");
	}
	public async comparisonRaw(digest: string): Promise<Response> {
		return await this.app.request(
			`/api/comparisons/${encodeURIComponent(digest)}`,
		);
	}
	public async comparison(digest: string): Promise<ComparisonResponse> {
		return await comparisonResponseFrom(await this.comparisonRaw(digest));
	}
	public async armDiffRaw(digest: string): Promise<Response> {
		return await this.app.request(
			`/api/comparisons/${encodeURIComponent(digest)}/arm-diff`,
		);
	}
	public async historyRaw({
		groupId,
		repId,
	}: HistoryRequest): Promise<Response> {
		return await this.app.request(
			`/api/groups/${encodeURIComponent(groupId)}/reps/${encodeURIComponent(repId)}/attempt/history`,
		);
	}
}
export { ComparisonDriver as default };
