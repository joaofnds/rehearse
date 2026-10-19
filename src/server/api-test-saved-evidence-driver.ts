import type { ApiTestTransport } from "#server/api-test-http-driver";

interface SessionIdentity {
	readonly caseId: string;
	readonly uuid: string;
}

interface ConfirmationIdentity {
	readonly groupId: string;
	readonly repId: string;
}

interface StageIdentity {
	readonly run: string;
	readonly stage: string;
}

interface AgentExcerptIdentity {
	readonly agentId: string;
	readonly eventId: string;
}

interface ReplayIdentity {
	readonly lineage: string;
	readonly timestamp: string;
}

class SavedEvidenceHttpDriver {
	public constructor(private readonly transport: ApiTestTransport) {}

	public async sessionHistory(identity: SessionIdentity): Promise<Response> {
		return await this.transport.request(sessionHistoryRoute(identity));
	}

	public async sessionDetail(
		identity: SessionIdentity,
		eventId: string,
	): Promise<Response> {
		return await this.transport.request(
			`${sessionHistoryRoute(identity)}/${encodeURIComponent(eventId)}`,
		);
	}

	public async sessionRequests(identity: SessionIdentity): Promise<Response> {
		return await this.transport.request(
			`${sessionHistoryRoute(identity)}/requests`,
		);
	}

	public async sessionAgents(identity: SessionIdentity): Promise<Response> {
		return await this.transport.request(
			`${sessionHistoryRoute(identity)}/agents`,
		);
	}

	public async sessionAgentExcerpt(
		identity: SessionIdentity,
		excerpt: AgentExcerptIdentity,
	): Promise<Response> {
		return await this.transport.request(
			`${sessionHistoryRoute(identity)}/agents/${encodeURIComponent(excerpt.agentId)}/${encodeURIComponent(excerpt.eventId)}`,
		);
	}

	public async confirmationRequests(
		identity: ConfirmationIdentity,
	): Promise<Response> {
		return await this.transport.request(
			`${confirmationHistoryRoute(identity)}/requests`,
		);
	}

	public async confirmationAgents(
		identity: ConfirmationIdentity,
	): Promise<Response> {
		return await this.transport.request(
			`${confirmationHistoryRoute(identity)}/agents`,
		);
	}

	public async confirmationAgentExcerpt(
		identity: ConfirmationIdentity,
		excerpt: AgentExcerptIdentity,
	): Promise<Response> {
		return await this.transport.request(
			`${confirmationHistoryRoute(identity)}/agents/${encodeURIComponent(excerpt.agentId)}/${encodeURIComponent(excerpt.eventId)}`,
		);
	}

	public async stageHistory(identity: StageIdentity): Promise<Response> {
		return await this.transport.request(`${stageRoute(identity)}/history`);
	}

	public async stageDetail(
		identity: StageIdentity,
		eventId: string,
	): Promise<Response> {
		return await this.transport.request(
			`${stageRoute(identity)}/history/${encodeURIComponent(eventId)}`,
		);
	}

	public async stageCorpus(identity: StageIdentity): Promise<Response> {
		return await this.transport.request(
			`${stageRoute(identity)}/history/corpus`,
		);
	}

	public async replayHistory(identity: ReplayIdentity): Promise<Response> {
		return await this.transport.request(
			`/api/replays/${encodeURIComponent(identity.lineage)}/${encodeURIComponent(identity.timestamp)}/history`,
		);
	}

	public async attemptEvidence(id: string): Promise<Response> {
		return await this.transport.request(
			`/api/attempt-evidence/${encodeURIComponent(id)}`,
		);
	}

	public async stageAttempts(identity: StageIdentity): Promise<Response> {
		return await this.transport.request(`${stageRoute(identity)}/attempts`);
	}

	public async stageSession(identity: StageIdentity): Promise<Response> {
		return await this.transport.request(`${stageRoute(identity)}/session`);
	}

	public async stageJudge(identity: StageIdentity): Promise<Response> {
		return await this.transport.request(`${stageRoute(identity)}/judge`);
	}

	public async stageTimes(run: string): Promise<Response> {
		return await this.transport.request(
			`/api/runs/${encodeURIComponent(run)}/stage-times`,
		);
	}
}

function sessionHistoryRoute(identity: SessionIdentity): string {
	return `/api/attempts/session/${encodeURIComponent(identity.caseId)}/${encodeURIComponent(identity.uuid)}/history`;
}

function confirmationHistoryRoute(identity: ConfirmationIdentity): string {
	return `/api/groups/${encodeURIComponent(identity.groupId)}/reps/${encodeURIComponent(identity.repId)}/attempt/history`;
}

function stageRoute(identity: StageIdentity): string {
	return `/api/runs/${encodeURIComponent(identity.run)}/stages/${encodeURIComponent(identity.stage)}`;
}

export { SavedEvidenceHttpDriver as default };
