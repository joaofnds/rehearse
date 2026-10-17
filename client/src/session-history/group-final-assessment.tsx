import { useQuery } from "@tanstack/react-query";
import { apiClient } from "#client/api-client";
import type { InferResponseType } from "hono/client";
import type { Immutable } from "#benchmark/contracts";

const finalRoute =
	apiClient.api.groups[":groupId"].reps[":repId"].attempt.final;
type FinalAssessment = InferResponseType<typeof finalRoute.$get, 200>;

async function readFinal(
	groupId: string,
	repId: string,
): Promise<FinalAssessment> {
	const response = await finalRoute.$get({
		param: {
			groupId: encodeURIComponent(groupId),
			repId: encodeURIComponent(repId),
		},
	});
	if (!response.ok) {
		throw new Error("Saved final Judge assessment unavailable");
	}
	return response.json();
}
function FinalContent({
	result,
}: {
	readonly result: Immutable<FinalAssessment> | undefined;
}): React.JSX.Element {
	if (result?.state !== "available") {
		return (
			<p className="mt-3 text-attention">
				{result?.reason ??
					"Saved final Judge rationale unavailable. The recorded outcome above remains separate from the step grades."}
			</p>
		);
	}
	return (
		<div className="mt-3 text-14 leading-reading">
			<p>{result.summary ?? "No written final Judge summary was saved."}</p>
			<ul>
				{result.requirements
					.toSorted(
						(left, right) =>
							Number(right.status === "FAIL") - Number(left.status === "FAIL"),
					)
					.map((item) => (
						<li key={item.id} className="mt-4 border-t border-subtle pt-3">
							<h3 className="font-medium">
								{item.status} · {item.id}
							</h3>
							{item.evidence.map((cited, index) => (
								<div
									key={`${cited.path}:${String(index)}`}
									className="mt-2 border-l-2 border-divider pl-3"
								>
									<p>{cited.claim}</p>
									<p className="mt-1 font-mono text-12 text-dim">
										{cited.source} · {cited.path}
										{cited.place === undefined ? "" : ` · ${cited.place}`}
									</p>
									{cited.quote === undefined ? null : (
										<blockquote className="mt-2 whitespace-pre-wrap">
											{cited.quote}
										</blockquote>
									)}
								</div>
							))}
						</li>
					))}
			</ul>
		</div>
	);
}
export function GroupFinalAssessment({
	groupId,
	repId,
}: {
	readonly groupId: string;
	readonly repId: string;
}): React.JSX.Element {
	const query = useQuery({
		queryKey: ["group-final-assessment", groupId, repId],
		queryFn: () => readFinal(groupId, repId),
	});
	return (
		<details className="rounded-lg border border-divider bg-card p-4 text-14">
			<summary>Independent final workflow assessment</summary>
			{query.isLoading ? (
				<p className="mt-3 text-14 leading-reading">
					Reading saved final assessment…
				</p>
			) : (
				<FinalContent result={query.data} />
			)}
		</details>
	);
}
