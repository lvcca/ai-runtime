import { llmTaskTransactionManager, getTypeFromFile } from '../llm.ts';
import { getLogger } from '../logger/logger.ts';
import type { SummaryType } from '../prompts/types/SummaryType.js';
import type { TransactionManagerResponse } from '../prompts/types/TransactionManagerResponse.js';
import { redisGet } from '../state/state.ts';
import type { StateTransaction } from '../state/types.ts';
import { isValidUUID } from '../util/InputValidation.ts';
import { parseJsonSafe, summarizeExecTransaction } from '../worker/util.ts';

const logger = getLogger('TransactionManager');

export const manageExecutionResults = async (id: string) => {
	
	assert(isValidUUID(id), 'cannot process this uuid, it has been flagged as invalid...')

	const entry = await redisGet<StateTransaction>(id);

	if (!entry) throw new Error(`no entry found with id ${id}`);

	logger.debug(`execution_id: ${id}`);

	const summary: SummaryType = await summarizeExecTransaction(id);

	let finalResults: TransactionManagerResponse = {};

	const txMgrResponse = await llmTaskTransactionManager(`
You are an Execution Task Transaction Manager.

Your job is to take analyze executed task results and determine next steps. If the current transaction_status is not "success" a next_action is required. The "next_action" object should attempt to use all information involved to determine how to accomplish the initial task.

Summary Results:
${JSON.stringify(summary)}

Task Results:
${JSON.stringify(entry)}
    
RULES:
- Use ONLY valid JSON as output 
- Always explain reasoning
- Do NOT include markdown
- There are at most 5 steps
- Steps are concrete and actionable
- Any text not in Javascript notation MUST be prepended with a comment

ONLY ACCEPTABLE OUTPUT FORMAT:
{
	${await getTypeFromFile({file: 'TransactionManagerResponse.d.ts'})}
}
`);

	finalResults = parseJsonSafe<TransactionManagerResponse>(txMgrResponse);

	logger.debug(
		`ManageTransaction final_results: ${JSON.stringify(finalResults)}`,
	);

	return finalResults;
};
