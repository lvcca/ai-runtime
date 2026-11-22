import { call_llm_toolcall, PROMPTS } from '../llm.ts';
import { getLogger } from '../logger/logger.ts';
import {
	type _Status,
	TaskType,
	Status,
	type StateTransaction,
} from '../state/types.ts';
import { getExec, setExec } from '../state/util.ts';
import { toolRegistry } from '../tools/ToolRegistry.ts';
import { ToolExec, appendToTransactionLog } from './util.ts';
import { randomUUID } from 'node:crypto';

const logger = getLogger('ExecutionWorker');

export const GetToolExecPayload = async (
	task: string,
	currObj: StateTransaction
) =>
	await call_llm_toolcall(`
You are an System Execution agent.

Your job is to take decomposed tasks written into concise executable steps and execute them using internal APIs identified in the ToolSchemas.

ToolSchemas:
${toolRegistry.listSchemas()}
${PROMPTS['file_system_schema']}

Tool Request Format:
${PROMPTS['tool_types']}

TASK:
${task}

Current Transaction status:
${JSON.stringify(currObj.status)}

Current Transaction related Tasks:
${JSON.stringify(currObj.related)}

Current Transaction full promptChain:
${JSON.stringify(currObj.promptChain)}

RULES:
- Use ONLY valid JSON as output 
- Always explain reasoning
- Do NOT include markdown
- There are at most 5 steps
- Steps are concrete and actionable
- Any text not in Javascript notation MUST be prepended with a comment

ONLY ACCEPTABLE OUTPUT FORMAT:
ToolCallPayload`);

export const runExec = async (exec_id: string, userRequest: string, ) => {
	logger.debug(`RunExec, id: ${exec_id}, task: ${userRequest}`);
	
	// set status
	await setExec({
		id: exec_id,
		status: { status: Status.RUNNING },
	});

	const currEntry: StateTransaction = await getExec(exec_id);
	
	let finalOutput: string | undefined;

	try {

		let toolExecChain = await GetToolExecPayload(userRequest, currEntry);

		await appendToTransactionLog({
			_id: exec_id,
			type: TaskType.EXECUTION,
			newUserRequest: userRequest,
		});

		// task execution env
		const toolExecId = randomUUID();
		const toolOutput = await ToolExec({
			toolExecId,
			task: userRequest,
			toolExecPayload: toolExecChain,
		});

		// execution result
		if (typeof toolOutput === 'string') {
			finalOutput = toolOutput;

			await setExec({
				id: exec_id,
				status: { status: Status.COMPLETED },
				result: finalOutput,
			});

			await appendToTransactionLog({
				_id: exec_id,
				type: TaskType.EXECUTION,
				newLLMResponse: finalOutput,
			});
		}

		// we shouldn't hit this, just safety
		else
			throw new Error(
				`toolOutput did not match expected string output type: ${typeof toolOutput}, ${JSON.stringify(toolOutput)}`,
			);

	} catch (e) {
		logger.error(`something went wrong in RunExec: ${e}`);

		await setExec({
			id: exec_id,
			status: { status: Status.FAILED },
			result: `${JSON.stringify(e)}`,
		});
	}

	return finalOutput;
};
