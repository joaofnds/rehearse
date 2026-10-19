interface SkillDeliveryInput {
	readonly requestId: string;
	readonly model: string;
	readonly toolUseId: string;
	readonly skill: string;
}

function skillCallRequest(call: SkillDeliveryInput): string {
	return JSON.stringify({
		message: {
			content: [
				{
					id: call.toolUseId,
					input: { skill: call.skill },
					name: "Skill",
					type: "tool_use",
				},
			],
			model: call.model,
			role: "assistant",
			stop_reason: "tool_use",
			usage: {
				cache_creation: {
					ephemeral_1h_input_tokens: 200,
					ephemeral_5m_input_tokens: 0,
				},
				cache_creation_input_tokens: 200,
				cache_read_input_tokens: 900,
				input_tokens: 2,
				output_tokens: 30,
			},
		},
		requestId: call.requestId,
		type: "assistant",
	});
}

function skillCallResult(call: SkillDeliveryInput): string {
	return JSON.stringify({
		message: {
			content: [
				{
					content: `Launching skill: ${call.skill}`,
					is_error: false,
					tool_use_id: call.toolUseId,
					type: "tool_result",
				},
			],
			role: "user",
		},
		type: "user",
	});
}

function deliveredSkillBody(call: SkillDeliveryInput): string {
	return JSON.stringify({
		isMeta: true,
		message: {
			content: [
				{
					text: `Base directory for this skill: /skills/${call.skill}`,
					type: "text",
				},
			],
			role: "user",
		},
		sourceToolUseID: call.toolUseId,
		type: "user",
	});
}

function skillDelivery(call: SkillDeliveryInput): readonly string[] {
	return [
		skillCallRequest(call),
		skillCallResult(call),
		deliveredSkillBody(call),
	];
}

function forkedSkillDelivery(): readonly string[] {
	return [
		{
			message: {
				content: [
					{
						id: "toolu_a2f",
						input: { skill: "code-review" },
						name: "Skill",
						type: "tool_use",
					},
				],
				model: "claude-opus-5",
				role: "assistant",
				stop_reason: "tool_use",
			},
			requestId: "req-a2-f",
			type: "assistant",
		},
		{
			message: {
				content: [
					{
						content: "Skill ran in its own context",
						is_error: false,
						tool_use_id: "toolu_a2f",
						type: "tool_result",
					},
				],
				role: "user",
			},
			toolUseResult: {
				agentId: "a7",
				commandName: "code-review",
				status: "forked",
			},
			type: "user",
		},
	].map((row) => JSON.stringify(row));
}
export { skillDelivery, forkedSkillDelivery };
