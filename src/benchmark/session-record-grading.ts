import { z } from "zod";

import { sessionJudgeRecordSchema } from "./session-judge-contract";
import { stateResultSchema } from "./session-state-check";

const judgeField = { judge: sessionJudgeRecordSchema.optional() };

const stateGradeFields = {
	stateGradingError: z.string().nonempty().optional(),
	stateResults: z.array(stateResultSchema).optional(),
};

export { judgeField, stateGradeFields };
