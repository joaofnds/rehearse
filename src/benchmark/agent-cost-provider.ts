import type { Ledger } from "./agent-cost";
import type { ModelCost, ProviderAgentCost } from "./agent-cost-contract";
import type { Owner } from "./agent-cost-participants";
import { readingOf, summed, tally } from "./agent-cost-tally";
import { known, spentModels } from "./agent-request-cost";
import type { Allocation } from "./agent-request-cost";
import type { AgentTree } from "./agent-tree";
import type { Immutable } from "./contracts";
import type { SessionHistoryRequestSeries } from "./session-history";

const COVERAGE_UNKNOWN_MODEL =
	"an agent without a kept transcript may have run on the same model";

const PREFIX_UNKNOWN_MODEL =
	"the inherited prefix holds a request on an unknown model";

const UNMODELED_REQUEST =
	"an attempt request names no model and may have run on any of them";

const PROVIDER_BASIS =
	"the provider's session count for models no other agent ran on";

const REPORTED_BASIS =
	"the provider's running count for the session, inherited prefix included";

const EMPTY_COLLECTION_LENGTH = 0;

/** The root's series and every inherited agent's, unless one was not kept. */
function seriesBeforeAttempt(
	tree: Immutable<AgentTree>,
): readonly Immutable<SessionHistoryRequestSeries>[] | undefined {
	const series = [tree.root.series];
	for (const agent of tree.agents) {
		if (agent.context === "inherited") {
			if (agent.evidence !== "available") {
				return undefined;
			}

			series.push(agent.series);
		}
	}

	return series;
}

function readsBeforeAttempt({ region }: { readonly region: string }): boolean {
	return region !== "attempt";
}

/**
 * The models of the root's prefix requests and every inherited agent's. An
 * unreadable line before the attempt may be a request on any model.
 */
function modelsBeforeAttempt(
	tree: Immutable<AgentTree>,
): ReadonlySet<string> | undefined {
	const series = seriesBeforeAttempt(tree);
	if (
		series === undefined ||
		series.some(({ unreadableLines }) =>
			unreadableLines.some((line) => readsBeforeAttempt(line)),
		)
	) {
		return undefined;
	}

	const models = spentModels(
		series.flatMap(({ entries }) =>
			entries.filter((entry) => readsBeforeAttempt(entry)),
		),
	);

	return models.has(undefined) ? undefined : known(models);
}

function providerCoverageReason(ledger: Readonly<Ledger>): string | undefined {
	if (!ledger.coverageComplete) {
		return COVERAGE_UNKNOWN_MODEL;
	}

	const [unreadable] = ledger.unreadable;
	if (unreadable !== undefined) {
		return `${unreadable}, so the model it ran on is unknown`;
	}

	if (ledger.unmodeled) {
		return UNMODELED_REQUEST;
	}

	if (ledger.modelsBeforeAttempt === undefined) {
		return PREFIX_UNKNOWN_MODEL;
	}

	return undefined;
}
interface ProviderCostContext {
	readonly owner: Owner;
	readonly ledger: Readonly<Ledger>;
}
interface ProviderModelRequest extends ProviderCostContext {
	readonly model: string;
}
interface ProviderModelsRequest extends ProviderCostContext {
	readonly models: readonly string[];
}
type ModelProviderCost =
	| { readonly costUsd: number }
	| { readonly reason: string };
function modelProviderCost({
	ledger,
	model,
	owner,
}: ProviderModelRequest): ModelProviderCost {
	if (ledger.modelsBeforeAttempt?.has(model) === true) {
		return { reason: `the inherited prefix also ran on ${model}` };
	}

	const shared = [...ledger.allocations].some(
		([other, { models: used }]) => other !== owner && used.has(model),
	);
	if (shared) {
		return { reason: `another agent ran on ${model}` };
	}

	const usage = ledger.modelUsage.get(model);
	if (usage === undefined) {
		return { reason: `the record carries no provider count for ${model}` };
	}

	return { costUsd: usage.costUSD };
}
function reportedModelsCost({
	ledger,
	models,
	owner,
}: ProviderModelsRequest): ProviderAgentCost {
	let costUsd = 0;

	for (const model of models) {
		const usage = modelProviderCost({ ledger, model, owner });
		if ("reason" in usage) {
			return { reason: usage.reason, state: "not separable" };
		}

		costUsd += usage.costUsd;
	}

	return { basis: PROVIDER_BASIS, costUsd, models, state: "reported" };
}
function providerCost(
	owner: Owner,
	allocation: Readonly<Allocation>,
	ledger: Readonly<Ledger>,
): ProviderAgentCost {
	const reason = providerCoverageReason(ledger);
	if (reason !== undefined) {
		return { reason, state: "not separable" };
	}

	const models = [...known(allocation.models)].toSorted();
	if (models.length === EMPTY_COLLECTION_LENGTH) {
		return {
			reason: "the agent made no attempt request with a recorded model",
			state: "not separable",
		};
	}

	return reportedModelsCost({ ledger, models, owner });
}

function modelCosts(
	ledger: Readonly<Ledger>,
	missing: readonly string[],
): readonly ModelCost[] {
	const models = new Set(ledger.modelUsage.keys());
	for (const allocation of ledger.allocations.values()) {
		for (const model of known(allocation.models)) {
			models.add(model);
		}
	}

	return [...models].toSorted().map((model): ModelCost => {
		const parts = [...ledger.allocations.values()].map((allocation) => {
			const lines = allocation.attemptEntries
				.filter((entry) => entry.model === model)
				.map(({ line }) => line);

			return tally(lines, allocation.costs);
		});
		const usage = ledger.modelUsage.get(model);

		return {
			calculated: readingOf(
				summed(parts, [
					...missing,
					...ledger.unreadable,
					...(ledger.unmodeled ? [UNMODELED_REQUEST] : []),
				]),
			),
			model,
			reported:
				usage === undefined
					? {
							reasons: ["the record carries no provider count for this model"],
							state: "unavailable",
						}
					: { costUsd: usage.costUSD, state: "complete" },
			reportedBasis: REPORTED_BASIS,
		};
	});
}
export { providerCost, modelsBeforeAttempt, modelCosts };
