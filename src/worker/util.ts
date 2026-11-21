import {
	call_llm_data_narrower,
	call_llm_shell_branch_analyzer,
	call_llm_shell_branch_simplifier,
	call_llm_task_summarizer,
	PROMPTS,
} from '../llm.ts';
import { getLogger } from '../logger/logger.ts';
import type {
	Parameter,
	Tool,
	ToolCallPayload,
} from '../prompts/types/ApiToolChain.js';
import type { StandardStreams } from '../prompts/types/ShellExecutor.js';
import { redisGet } from '../state/state.ts';
import {
	type PromptChain,
	type RelatedTransactionsChain,
	type _Status,
	TaskType,
	type StateTransaction,
	Status,
} from '../state/types.ts';
import {
	getExec,
	getJob,
	getShellJob,
	getTask,
	setExec,
	setJob,
	setShellJob,
	setTask,
} from '../state/util.ts';
import {
	type _func,
	type RegisteredToolEntry,
	toolRegistry,
} from '../tools/ToolRegistry.ts';
import crypto from 'node:crypto';

const logger = getLogger('worker_util');

export const parseJsonSafe = <T>(text: string): T => {
	logger.debug(`parseJsonSafe text: ${text}`);

	try {
		return JSON.parse(text) as T;
	} catch (e) {
		throw new Error(`invalid json: ${text}, error: ${getError(e)}`);
	}
};


/**
 * 
 * @param text 
 * @returns first valid LLM_RESPONSE found
 */

export const extractResponseBlock = async (text: string) => {
	const pattern = /<LLM_RESPONSE>([\s\S]*?)<\/LLM_RESPONSE>/;

	const match = text.match(pattern);

	logger.info(`extract response block text: ${text}, match: ${match}`);

	if (match) return match[1].trim();

	else {
		let validJson = false;

		// try to parseAsJson
		try {
			parseJsonSafe(text);
			validJson = true;
		} catch (e) {
			logger.error(`extracted text was not valid json, ${e}`);
		}

		// actual error exit
		if (!validJson) {
			logger.debug(`no match found defaulting to text passed in: ${text}`);
			return text;
		} else
			throw new Error(
				`unexpected error in extractResponseBlock: validJson: ${validJson}, text: ${text}`,
			);
	}
};

export const updateRelated = async ({
	_id,
	type,
	related,
}: {
	_id: string;
	type: TaskType;
	related: RelatedTransactionsChain;
}) => {
	let success = false;

	try {
		// get current state
		let currEntry: StateTransaction | undefined;

		switch (type) {
			case TaskType.EXECUTION:
				currEntry = await getExec(_id);
				break;
			case TaskType.JOB:
				currEntry = await getJob(_id);
				break;
			case TaskType.TASK_DIRECT:
			case TaskType.TASK:
				currEntry = await getTask(_id);
				break;
		}

		if (!currEntry) throw new Error(`could not find entry... ${_id}`);

		// update current state
		const newJobs = related?.job;
		if (newJobs)
			for (let i = 0; i < newJobs?.length; i++)
				if (!currEntry.related?.job?.includes(newJobs[i]))
					currEntry.related?.job?.push(newJobs[i]);

		const newExecs = related?.exec;
		if (newExecs)
			for (let i = 0; i < newExecs?.length; i++)
				if (!currEntry.related?.exec?.includes(newExecs[i]))
					currEntry.related?.exec?.push(newExecs[i]);

		const newTask = related?.task;
		if (newTask)
			for (let i = 0; i < newTask?.length; i++)
				if (!currEntry.related?.task?.includes(newTask[i]))
					currEntry.related?.task?.push(newTask[i]);

		switch (type) {
			case TaskType.EXECUTION:
				success = await setExec(currEntry);
				break;
			case TaskType.JOB:
				success = await setJob(currEntry);
				break;
			case TaskType.TASK_DIRECT:
			case TaskType.TASK:
				success = await setTask(currEntry);
				break;
		}
	} catch (e) {
		logger.error(`something went wrong in updateRelated ${e}`);
	}

	return success;
};

export const appendToTransactionLog = async ({
	_id,
	type,
	newUserRequest,
	newLLMResponse,
}: {
	_id: string;
	type: TaskType;
	//
	newUserRequest?: string;
	newLLMResponse?: string;
}) => {
	let success = false;
	try {
		let currTx: StateTransaction | undefined;

		switch (type) {
			case TaskType.TASK_DIRECT:
			case TaskType.TASK:
				currTx = await getTask(_id);
				break;

			case TaskType.EXECUTION:
				currTx = await getExec(_id);
				break;

			case TaskType.JOB:
				currTx = await getJob(_id);
				break;

			case TaskType.SHELL_JOB:
				currTx = await getShellJob(_id);
				break;

			default:
				throw new Error(`no case for ${type} in appendToTransactionLog!`);
		}

		assert(!!currTx, `no tx found!`)
		
		const newUserReqChain = structuredClone([
			...(currTx?.promptChain?.userRequestChain ?? []),
		]);
		const newLLMResponseChain = structuredClone([
			...(currTx?.promptChain?.llmResponseChain ?? []),
		]);

		if (newUserRequest && !newUserReqChain.includes(newUserRequest))
			newUserReqChain.push(newUserRequest);
		if (newLLMResponse && !newLLMResponseChain.includes(newLLMResponse))
			newLLMResponseChain.push(newLLMResponse);
		
		const newPromptChain: PromptChain = {
			userRequestChain: newUserReqChain,
			llmResponseChain: newLLMResponseChain,
		};

		const _tx: StateTransaction = {
			id: _id,
			status: currTx?.status,
			promptChain: newPromptChain,
			type: currTx?.type,
		};

		// persist 
		switch (type) {
			case TaskType.SHELL_JOB:
				success = await setShellJob(_tx);
				break;
			case TaskType.JOB:
				success = await setJob(_tx);
				break;
			case TaskType.TASK_DIRECT:
			case TaskType.TASK:
				success = await setTask(_tx);
				break;
			case TaskType.EXECUTION:
				success = await setExec(_tx);
				break;
			default:
				logger.warn(`no case for type: ${type}`);
				break;
		}

	} catch (e) {
		logger.error(
			`something went wrong in appendToTransactionLog: ${getError(e)}`,
		);
	}

	return success;
};

export const execWrapper = async (func: _func, args: string[]) => {
	let result: string;

	try {
		result = await func(...args);
		if (result === undefined)
			result = `${func.name} call returned undefined, assume successful execution`;
	} catch (e) {
		const msg = `something went wrong in execWrapper: ${getError(e)}`;
		logger.error(msg);
		result = msg;
	}

	return result;
};
/**
 *
 * @param key : job id
 * @param tool : tool entry object
 * @param Params : tool params
 * @returns
 */

const safeExecute = async (
	key: string,
	tool: RegisteredToolEntry,
	Params: Parameter[],
) => {
	if (!tool.func)
		throw new Error(
			`something went wrong in SafeExecute, tool: ${JSON.stringify(tool)} `,
		);

	let validResult: string = 'FAILED';
	let result: unknown = validResult;

	await setJob({
		id: key,
		status: { status: Status.RUNNING, message: 'In safe Execute' },
	});

	try {
		const func = tool.func;
		const params = Params.map((p) => p.value);

		logger.info(`func: ${func.name}, params: ${JSON.stringify(params)}`);

		// result = await func(...params);
		result = await execWrapper(func, params);

		logger.info(`func results: ${JSON.stringify(result)}`);

		switch (true) {
			case result === undefined:
			case result === null:
				throw new Error(`no result returned from func call in SafeExecute`);

			case typeof result === 'string':
				validResult = result;
				break;

			case typeof result === 'object': {
				const _result: StandardStreams = result as StandardStreams;

				if (!_result.input) break;

				logger.info('is a shell result type');

				// get arrays
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const keys = Object.keys(result as any);
				// eslint-disable-next-line @typescript-eslint/no-explicit-any
				const vals = Object.values(result as any);

				// find keys
				const output = keys.findIndex((k) => k === 'output');
				const error = keys.findIndex((k) => k === 'error');
				const input = keys.findIndex((k) => k === 'input');

				if (output > -1 || error > -1 || input > -1) {
					// map to vals
					const _input = `${vals[input]}` as string;
					const _output = `${vals[output]}` as string;
					const _error = `${vals[error]}` as string;

					validResult =
						_output ||
						_error ||
						_input ||
						'[*] no response from shell, assume exited successfully'; // placeholder failsafe

					logger.warn(`validResult: ${validResult}`);
				}
				break;
			}

			default:
				validResult = `${result}`;
				logger.warn(
					`no case found for result ${JSON.stringify(result)}, result type: ${typeof result}`,
				);
		}

		await setJob({
			id: key,
			status: {
				status: Status.COMPLETED,
				message: 'Execution complete!',
			},
		});

		logger.info(
			`[*] SafeExecute result: ${JSON.stringify(result)}, validResult: ${validResult}`,
		);

		return validResult;
	} catch (e) {
		const msg = `something went wrong in SafeExecute: ${JSON.stringify(getError(e))}, tool: ${JSON.stringify(tool)}, Params: ${JSON.stringify(Params)}`;

		await setJob({
			id: key,
			status: { status: Status.FAILED, message: msg },
		});

		logger.error(msg);
	}

	return validResult;
};

export const getError = (e: unknown) => {
	const error =
		e instanceof Error ? `${e.name}: ${e.message}\n${e.stack}` : String(e);
	return error;
};

const AddJob = async (id: string, job_id: string) => {
	let saved = false;

	const entry = await getExec(id);
	const related = entry?.related;
	const jobs = related?.job ?? [];

	// save job id in parent
	jobs?.push(job_id);

	switch (entry?.type) {
		case TaskType.EXECUTION:
			saved = await setExec({
				...entry,
				related: { ...related, job: jobs },
			});
			break;
		default:
			logger.warn(`no case found for ${entry?.type} in addJobToTask..`);
	}

	return saved;
};

/**
 * @param exec_id transaction id
 * @param {ToolCallPayload} toolPayload llm generated tool payload in json form
 * @throws {Error} on pivot | branching, prevent further execution
 * @returns
 */

const ExecToolCall = async (exec_id: string, toolPayload: ToolCallPayload) => {
	let pivotRequired = false;
	let final_results: string = 'FAILED';
	let jobs = new Map<string, string | undefined>();

	try {

		const toolExecutionSteps = toolPayload.identified_internal_tools_required; // in order of execution llm decided

		for (const step of toolExecutionSteps) {

			// make new transaction for each step
			const _id = crypto.randomUUID();

			try {
				// prevent unnessary executions if pivot identified

				if (pivotRequired) throw new Error('pivotRequired in branching!');

				/**
				 * insert entry for job
				 */

				// local init
				jobs.set(_id, undefined);

				// redis entry
				const jobSuccessful = await setJob({
					id: _id,
					type: TaskType.JOB,
					status: { status: Status.QUEUED },
					related: { exec: [exec_id] }, //<- @TODO audit array assignment, potential overwrite of previous data
					job: JSON.stringify(step),
				});
				assert(jobSuccessful, 'job shouldnt fail')

				// add link to main task
				await AddJob(exec_id, _id);

				// always be type safe with llm generated stuffs
				let safeToolName: unknown = step['Tool'];

				// try parse as tool first
				if (typeof safeToolName !== 'string') {
					let _tool = safeToolName as Tool;

					let SafeToolObject: Tool = {
						name: _tool['name'] ?? '',
						description: _tool['description'] ?? '',
						parameters: _tool['parameters'] ?? [],
						return: _tool['return'],
					};

					safeToolName = SafeToolObject.name;
				}

				const params = step.Params ?? [];

				logger.info(
					`identified tool: ${JSON.stringify(safeToolName)}, params: ${JSON.stringify(params)}`,
				);

				const foundToolEntry: RegisteredToolEntry | undefined =
					toolRegistry.getRegisteredToolEntry(safeToolName as string);

				if (!foundToolEntry)
					throw new Error(
						`could not find tool ${JSON.stringify(safeToolName)}`,
					);

				const result = await safeExecute(_id, foundToolEntry, params);

				if (!result) throw new Error(`no result came back from SafeExecute...`);

				final_results = result;

				await setJob({
					id: _id,
					type: TaskType.JOB,
					status: { status: Status.COMPLETED },
					job: JSON.stringify(step),
					result: final_results,
				});
			} catch (e) {
				logger.error(
					`something went wrong in TaskProcessJob step: ${JSON.stringify(getError(e))}`,
				);

				await setJob({
					id: _id,
					type: TaskType.JOB,
					status: { status: Status.FAILED },
					related: { exec: [exec_id] },
					job: JSON.stringify(step),
					result: final_results,
				});
				continue;
			}
		}
	} catch (e) {
		logger.error(
			`something went wrong in TaskProcessJob: ${JSON.stringify(getError(e))}`,
		);
	}

	logger.info(`final results from process task util: ${final_results}`);

	return final_results;
};

/**
 *
 * @param toolExecId id for tool exec transaction
 * @param task task attempting to be accomplished
 * @param toolExecPayload stringified tool exec payload
 * @returns {Promise<string>}
 */

export const ToolExec = async ({
	toolExecId,
	task,
	toolExecPayload,
}: {
	toolExecId: string;
	task: string;
	toolExecPayload: string;
}) => {
	logger.debug(`ToolExec`);

	await setExec({
		id: toolExecId,
		status: { 
			status: Status.RUNNING, 
			message: 'Tool Exec' 
		},
		type: TaskType.EXECUTION,
	});

	await appendToTransactionLog({
		_id: toolExecId,
		type: TaskType.EXECUTION,
		newUserRequest: task,
		newLLMResponse: toolExecPayload,
	});

	let result: string = 'FAILED';

	try {
		const narrowed = await call_llm_data_narrower(
			`sanitize the following output: \' ${toolExecPayload} \'`,
		);

		const responseBlock = await extractResponseBlock(narrowed);

		if (!responseBlock)
			throw new Error(`no block found from narrowed response, block: ${responseBlock}`);

		const json_response = parseJsonSafe<ToolCallPayload>(responseBlock);
		const steps = json_response.identified_internal_tools_required;

		// ensure valid array
		if (
			!Array.isArray(steps) ||
			!steps ||
			(Array.isArray(steps) && steps.length < 1)
		)
			throw new Error(`no steps found: ${steps}`);

		// exec
		result = await ExecToolCall(toolExecId, json_response);

		await setExec({
			id: toolExecId,
			result,
			status: { status: Status.COMPLETED },
		});

		await appendToTransactionLog({
			_id: toolExecId,
			type: TaskType.EXECUTION,
			newLLMResponse: result,
		});
	} catch (e) {
		logger.error(`something went wrong in ToolExec: ${e}`);

		await setExec({
			id: toolExecId,
			status: { status: Status.FAILED, message: `${JSON.stringify(e)}` },
		});
	}
	return result;
};

export const SimplifyOpinion = async (next_step: string) =>
	await call_llm_shell_branch_simplifier(`
You are a quality assurance expert. 

Input:
${next_step}

Expected Output Format:
<LLM_RESPONSE>
    ShellBranchAnalysisSimplified
</LLM_RESPONSE>
`);

const FormatStringArray = (results: string[]) => {
	let res = ``;
	for (const result of results) {
		res += result + '\n';
	}
	return res;
};

export const GetSecondOpinion = async (
	analysis: string,
	job_results: string[],
	job_ids: string[],
	task_id: string,
) =>
	await call_llm_shell_branch_analyzer(`
You are a quality assurance expert.

Your sole purpose is to evaluate the analysis of a job 

Analysis:
${analysis}

Pivot Decision Rule:
If pivot_required=true ALWAYS include a viable "next_step".                                        
Set pivot_required=true ONLY when the current execution trajectory can no longer realistically converge on successful task completion.
                                                   
A pivot is NOT required when:
- The branch is still progressing toward the task goal
- Failures are recoverable within the current execution strategy
- Additional execution within the same branch could still satisfy the task

A pivot IS recommended (pivot_recommended) when:
- original_task_goal has not been accomplished and next_step would change that.

Interpretation Rules:
- Evaluate trajectory viability from observed execution results and existing state.
- If original_task_goal not accomplished, lean towards pivot_required.

Do NOT:
- Expand beyond branch viability assessment

Each job must conform to the ShellResults structure:
${PROMPTS['shell_results_types']}

Job Results:
${FormatStringArray(job_results)}

Job IDs:
${FormatStringArray(job_ids)}

Task Goal as original_task_goal:
${await getTask(task_id)}

Expected Output Format:
<LLM_RESPONSE>
    ShellBranchAnalysis
</LLM_RESPONSE>
`);

export const AnalyzeShellResults = async (
	job_results: string[],
	job_ids: string[],
	task_id: string,
) => {
	const finalResults = await call_llm_shell_branch_analyzer(`
You are a System Execution Branch Analysis agent.

Your sole responsibility is to evaluate whether the current execution branch remains viable for accomplishing the task goal.

IF pivot_required == falsey:
    You are NOT:
    - a planner
    - a shell command generator
    - a task executor
    - a strategy synthesizer

Do NOT propose commands, execution steps, remediation actions, or next-step plans.

Your only responsibility is branch viability analysis.

Pivot Decision Rule:
If pivot_required=true ALWAYS include a viable "next_step".                                        
Set pivot_required=true ONLY when the current execution trajectory can no longer realistically converge on successful task completion.
                                                   
A pivot is NOT required when:
- The branch is still progressing toward the task goal
- Failures are recoverable within the current execution strategy
- Additional execution within the same branch could still satisfy the task

A pivot IS required when:
- The branch has irreversibly diverged from the task goal
- Continuing execution within the current branch cannot satisfy the task
- The current execution strategy is no longer viable or helpful for resolving the current task.
- No viable continuation exists within the current branch.

Interpretation Rule:
Evaluate trajectory viability only from observed execution results.

Do NOT:
- infer or suggest future commands
- prescribe system actions
- construct next-step shell instructions
- expand beyond branch viability assessment

Each job must conform to the ShellResults structure:
${PROMPTS['shell_results_types']}

Job Results:
${FormatStringArray(job_results)}

Job IDs:
${FormatStringArray(job_ids)}

Task Goal as original_task_goal:
${await getTask(task_id)}

Analysis Instructions:
1. Assess whether observed outputs remain aligned with the task goal
2. Determine whether successful completion is still reachable within this branch
3. Set pivot_required=true only if no viable continuation exists
4. Explain the reasoning strictly in terms of branch viability

Expected Output Format:
<LLM_RESPONSE>
    ShellBranchAnalysis
</LLM_RESPONSE>`);

	return finalResults;
};

export type SummaryType = {
	status: 'success' | 'failure' | 'partial_success' | 'unknown';
	summary: string;
	result: string;
	error: string;
	steps: string[];
	artifacts: string[];
};

/**
 * summarize task
 * @param id
 * @returns
 */
export const summarizeExecTransaction = async (id: string) => {
	const currObj = await redisGet<StateTransaction>(id);
	const _obj = JSON.stringify(currObj);

	const summarizedTask = await call_llm_task_summarizer(`
You are an ai task result summarizer.

Your job is to parse results and determine a definitive next step is required.

Initial Tasks:
${currObj?.promptChain?.userRequestChain}

Task Results:
${currObj?.result}

Full Task Stringified Object:
${JSON.stringify(JSON.parse(_obj) as StateTransaction, null, 2)}

RULES:
- Return ONLY valid JSON
- Do not explain reasoning
- Do not include markdown
- Use at most 5 steps
- Steps must be concrete and actionable

OUTPUT FORMAT:
<LLM_RESPONSE>
{
	"status": "success" | "failure" | "partial_success" | "unknown",
	"summary": string,
	"result": string,
	"error": string,
	"steps": string [],
	"artifacts": string []
}
</LLM_RESPONSE>
`);
	const summary = parseJsonSafe<SummaryType>(
		await extractResponseBlock(summarizedTask),
	);
	return summary;
};
