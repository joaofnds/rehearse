import { z } from "zod";

const judgeContractSha256Schema = z.string().regex(/^[0-9a-f]{64}$/u);

export { judgeContractSha256Schema as default };
