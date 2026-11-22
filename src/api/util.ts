import type { NextFunction, Request, Response } from 'express';
import { getLogger } from '../logger/logger.ts';
import { redisGet, } from '../state/state.ts';
import {
	deleteExecCommon,
	deleteJobCommon,
	deleteTaskCommon,
	getExec,
	getJob,
	getTask,
	setExec,
	setJob,
	setShellJob,
	setTask,
	stateTransactionExists,
} from '../state/util.ts';
import { randomUUID } from 'node:crypto';
import { call_llm_task_validator, getTypeFromFile } from '../llm.ts';
import {
	extractResponseBlock,
	parseJsonSafe,
	summarizeExecTransaction,
} from '../worker/util.ts';
import { runTask } from '../worker/TaskWorker.ts';
import { runExec } from '../worker/ExecutionWorker.ts';
import {
	manageExecutionResults,
} from '../service/TransactionManager.ts';
import type { ValidatorResponse } from '../prompts/types/ValidatorResponse.js';
import {
	type PromptChain,
	type RelatedTransactionsChain,
	Status,
	TaskType,
	type StateTransaction,
	type execOptions,
	ExecCallerType,
} from '../state/types.ts';
import { isValidUUID } from '../util/InputValidation.ts';
import type { TransactionManagerResponse } from '../prompts/types/TransactionManagerResponse.js';

const logger = getLogger('api_util');

export const getHeader = (req: Request, header: string) => {
	const _header = req.headers[header];

	if (!_header || typeof _header !== 'string') throw new Error('no valid id');
	else return _header;
};

/**
 * general state insert, existing entries are chained to new ones
 * @param param0 
 * @returns {string} id inserted object
 */
export const generalInsert = async ({
	// remote caller
	req,
	type,

	// local caller
	_id, 
	_task,
	//
	verbose = false,
	sanityCheck = true
}: {
	// remote caller
	req?: Request;
	type?: TaskType;

	// local caller
	_id?: string;
	_task?: string;
	//
	verbose?: boolean;
	sanityCheck?: boolean
}) => {
	if (verbose) logger.debug(`in task insert`);

	let successful: boolean = false;

	let id: string | undefined;
	let task: string | undefined;

	// local caller
	if (_id && _task) {
		if (verbose) logger.debug(`originated from: local internal call`);
		//
		id = _id;
		task = _task;
	}

	// called from api
	if (req && type) {
		if (verbose) logger.debug(`originated from: http call`);
		//
		id = getHeader(req, 'id') ?? randomUUID();
		task = getHeader(req, 'task');
	}

	assert(id !== undefined && task !== undefined, 'malformed call to generalInsert...');	
	
	// redis save obj
	let _tx: StateTransaction | undefined;

	// if exists create new task with link to existing task
	// transction chain append
	if (await stateTransactionExists(id)) {
		if (verbose) logger.debug(`entry exists`);

		const existingEntry: StateTransaction | undefined = await redisGet<StateTransaction>(id);
		assert(!!existingEntry, 'existing entry cannot be undefined if it exists..')

		const newId = randomUUID();
		const prompt: PromptChain = existingEntry.promptChain ?? {};
		const existingResponse = prompt.llmResponseChain ?? [];
		const userRequest = prompt.userRequestChain ?? [];

		existingResponse?.push(task);

		const newPrompt: PromptChain = {
			userRequestChain: userRequest,
			llmResponseChain: existingResponse,
		};

		let relatedTransactions: RelatedTransactionsChain = structuredClone(existingEntry.related ?? {});
		assert(!!relatedTransactions, 'related transactions object should not be undefined')

		// attach self as related transaction
		switch (existingEntry.type) {
			case TaskType.SHELL_JOB:
				(relatedTransactions.shellJob ??= []).push(id);
				break;
			case TaskType.EXECUTION:
				(relatedTransactions.exec ??= []).push(id);
				break;
			case TaskType.TOOL_JOB:
				(relatedTransactions.toolJob ??= []).push(id);
				break;
			case TaskType.TASK_DIRECT:
			case TaskType.TASK:
				(relatedTransactions.task ??= []).push(id);
				break;
				
			default:
				if (verbose) logger.warn(`no case for type ${existingEntry.type}`)
		}

		_tx = {
			id: newId,
			status: {
				status: Status.QUEUED,
			},
			type,
			promptChain: newPrompt,
			related: relatedTransactions,
		};

		// for return statement to be accurate
		id = newId;
		if (sanityCheck) assert(id === _tx.id, 'sanity check failed id !== _tx.id');
	} else {
		// create new transaction chain
		_tx = {
			id,
			status: {
				status: Status.QUEUED,
			},
			type,
			promptChain: {
				userRequestChain: [task],
				llmResponseChain: [],
			},
		};

		if (verbose) logger.debug(`_tx: ${JSON.stringify(_tx)}`);
	}

	if (verbose) {
		logger.debug(`full saved exists transaction: ${JSON.stringify(_tx)}`);
		logger.debug(`Incoming newTask: ${id}, type: ${type}`);
	}

	successful = await stateTransactionSet(_tx)

	if (verbose) logger.info(`successful: ${successful}`);

	return id;
};

export const stateTransactionSet = async (_tx: StateTransaction) => {
	let successful = false
	switch (_tx.type) {
		case TaskType.SHELL_JOB:
			successful = await setShellJob(_tx);
			break;
		case TaskType.EXECUTION:
			successful = await setExec(_tx);
			break;
		case TaskType.TOOL_JOB:
			successful = await setJob(_tx);
			break;
		case TaskType.TASK_DIRECT:
		case TaskType.TASK:
			successful = await setTask(_tx);
			break;
	}
	return successful;
}

export const resolveRelated = async (related?: RelatedTransactionsChain) => {
	let tasks: StateTransaction[] = [];
	let execs: StateTransaction[] = [];
	let jobs: StateTransaction[] = [];

	let out = {
		tasks,
		execs,
		jobs,
	};

	if (!related) return out;

	const { task, exec, toolJob: job } = related;

	if (task)
		for (const t of task) {
			const entry = await getTask(t);
			if (entry && !tasks.includes(entry)) tasks.push(entry);
		}

	if (exec)
		for (const e of exec) {
			const entry = await getExec(e);
			if (entry && !execs.includes(entry)) execs.push(entry);
		}

	if (job)
		for (const j of job) {
			const entry = await getJob(j);
			if (entry && !jobs.includes(entry)) jobs.push(entry);
		}

	return out;
};

/**
 * validate execution transaction
 * @returns {ValidatorResponse} response from validator call 
 */

export const executionValidator = async ({id, verbose=false}:{id?: string, verbose?: boolean}) => {
	if (verbose) logger.debug(`validating transaction: ${id}`);
	assert(id, `validate requires a valid id... id: ${id}`)
	const entry = await redisGet<StateTransaction>(id);
	assert(entry, `could not find valid entry: id: ${id}`)
	if (verbose) logger.debug(`found entry: ${JSON.stringify(entry)}`);

	const { result, promptChain, related }: StateTransaction = entry;
	
	const task = promptChain?.userRequestChain;
	let _result: string;

	if (verbose) logger.debug(`validating state transaction result: ${result}, from promptChain: ${JSON.stringify(promptChain)}`);

	_result = await call_llm_task_validator(`
You are an Execution agent manager.

Your job is to take results from a task and determine whether or not the task goal was accomplished.

Initial Task(s):
${JSON.stringify(task)}

Task Result:
${JSON.stringify(result)}

Related Tasks:
${JSON.stringify(await resolveRelated(related))}

LLM Prompt History:
${JSON.stringify(promptChain)}

RULES:
- Use ONLY valid JSON as output 
- Always explain reasoning
- Do NOT include markdown
- There are at most 5 steps
- Steps are concrete and actionable
- Any text not in Javascript notation MUST be prepended with a comment

Output FORMAT:
<LLM_RESPONSE>
${getTypeFromFile({file: 'ValidatorResponse.d.ts'})}
</LLM_RESPONSE>`);

	if (verbose) logger.debug(`Task Validator Result: ${_result}`);

	const responseBlock: unknown = await extractResponseBlock(_result);
	assert(responseBlock !== undefined, 'validator returned undefined');
	assert(!!responseBlock, 'validator returned an empty response');
	assert(typeof responseBlock === 'string', 'validator should return a string');
	
	// get valid object from string
	const validatorResponse = parseJsonSafe<ValidatorResponse>(responseBlock);

	if (verbose) logger.debug(`validator response: ${JSON.stringify(validatorResponse)}`);
	
	// push latest validator response for state update
	(entry.validatorResponseChain ??= []).push(validatorResponse)

	// new state obj
	const updatedTransaction: StateTransaction = {
		id, 
		validatorResponseChain: entry.validatorResponseChain
	}

	// state update 
	await setExec(updatedTransaction);

	return validatorResponse;
};

export const run = async ({id, type}:{id: string, type: TaskType}) => {
	let result: string | undefined;

	const _tx = await redisGet<StateTransaction>(id);

	const taskDirect = _tx?.type === TaskType.TASK_DIRECT;
	const userRequestChain = _tx?.promptChain?.userRequestChain;
	assert(!!userRequestChain, 'user request chain undefined!')
	assert(userRequestChain.length > 0, 'user request chain is empty!')
	const latestRequest = userRequestChain[0];

	switch (type) {
		case TaskType.TASK_DIRECT:
		case TaskType.TASK:
			result = await runTask(id, latestRequest, taskDirect);
			break;
		case TaskType.EXECUTION:
			result = await runExec(id, latestRequest);
			break;

		default:
			logger.warn(`no case for ${type}`);
	}

	logger.info(
		`start result: type: ${type}, task: ${userRequestChain}, result: ${result}`,
	);

	return result;
};

const getExecManagerNextAction = async (
	exec_id: string,
	managerResponse: TransactionManagerResponse,
) => {
	let success = false;

	switch (managerResponse.next_action?.type) {
		case 'terminate':
		case 'noop':
			// what do we do if manager recommends noop or terminate
			// what other potential states are we missing?
			break;

		case 'retry':
			const prompt = managerResponse.next_action.prompt;

			await newExec({
				_id: exec_id,
				_task: prompt,
				callerType: ExecCallerType.UTILITY
			});

			/**
			 *	// START HERE 
			 */

			// next actions here
			success = true;
			break;
	}

	return success;
};


export const manageExecResults = async (
	{exec_id}: {exec_id: string}
	) => {
		// analysis and plan branching
		// this should be seperate function to help keep newExec similar to newTask
		const validatorResponse = await executionValidator({id: exec_id});
		const summary = await summarizeExecTransaction(exec_id);
		const execManagementResults = await manageExecutionResults(exec_id);

		// pivot determination
		const shouldPivotToNewAction = execManagementResults.next_action && execManagementResults?.transaction_status !== 'success'
		if (shouldPivotToNewAction) {
			const res = await getExecManagerNextAction(exec_id, execManagementResults);
			// if branching?
			// remove return
			
			return res; //<-- for lint #TODO fix me with feature implementation exec branching
		}

		// no pivot required
		else {
			return summary
		}
}

/**
 * Common execution function.
 *
 * Supports two invocation scenarios:
 *
 * 1. Express route invocation:
 *    - `req` and `res` are provided when called from an Express GET endpoint.
 *    - Handles execution within an HTTP request/response cycle.
 *
 * 2. Utility invocation:
 *    - `_id` and `_task` are provided when called internally by a utility function.
 *    - Used to determine the execution context and branch to the appropriate logic.
 *
 * @param {Object|undefined} [req]   Express request object. Provided when invoked from an Express endpoint.
 * @param {Object|undefined} [res]   Express response object. Provided when invoked from an Express endpoint.
 * @param {string|undefined} [_id]   Identifier used for internal utility execution and branching logic.
 * @param {string|undefined} [_task] Task identifier or type used to determine the appropriate execution path.
 *
 * @returns {Promise<string | Response>} Result of the execution, depending on the invocation context and task.
 */

export const newExec = async (options: execOptions): Promise<string | Response> => {
	let response: string | undefined;

	// scenario assertions
	switch(options.callerType) {
		case ExecCallerType.ENDPOINT:
			assert(options.req !== undefined, 'endpoint call requires req')
			assert(options.res !== undefined, 'endpoint call requires res')
			break;

		case ExecCallerType.UTILITY:
			assert(options._id !== undefined, 'utility call requires _id')
			assert(options._task !== undefined, 'utility call requires _task')
			break;
	}	

	if (options.verbose) logger.debug(`newExec passed scenario assertions!`);

	try {
		// persist
		const exec_id = await generalInsert({
			req: options.req,
			type: TaskType.EXECUTION,
			//
			_id: options._id,
			_task: options._task,
		});

		// execute
		response = await run({
			id: exec_id, 
			type: TaskType.EXECUTION
		});

		assert(typeof response === 'string', 'response should be a string!')
		assert(response.length > 0, 'response should not be empty!')
		// @TODO post execution stuffs
		
	} catch (e) {
		logger.error(`something went wrong in newExec: ${e}`);

		switch(options.callerType) {
			case ExecCallerType.ENDPOINT:
				return options.res.status(500).json({error: 'something went wrong...'});
			
			case ExecCallerType.UTILITY:
				throw e;
		}
	}

	if (options.verbose) logger.debug(`responding to client: ${JSON.stringify(response, null, 2)}`);
		
	switch(options.callerType) {
		case ExecCallerType.ENDPOINT:
			return options.res.status(200).send(response);

		case ExecCallerType.UTILITY:
			return response;
	};

};

export const newTaskDirect = async (req: Request, res: Response) => {
	const task_id = await generalInsert({ req, type: TaskType.TASK_DIRECT });
	const llm_response = await run({
		id: task_id, 
		type: TaskType.TASK_DIRECT
	});

	return res.status(200).send(llm_response);
};

export const newTask = async (req: Request, res: Response) => {
	const task_id = await generalInsert({ req, type: TaskType.TASK });
	const llm_response = await run({
		id: task_id, 
		type: TaskType.TASK
	});
	
	return res.status(200).send(llm_response);
};

export const newJob = async (req: Request, res: Response) => {
	const successful = await generalInsert({ req, type: TaskType.TOOL_JOB });
	return res.status(200).send(successful);
};

export const deleteTask = async (req: Request, res: Response) => {
	const id = getHeader(req, 'id');
	if (!id) res.status(400).send('invalid request');
	const del = await deleteTaskCommon(id);
	return res.status(200).send(`del response: ${del}`);
};

export const deleteExec = async (req: Request, res: Response) => {
	const id = getHeader(req, 'id');
	if (!id) res.status(400).send('invalid request');
	const del = await deleteExecCommon(id);
	return res.status(200).send(`del response: ${del}`);
};

export const deleteJob = async (req: Request, res: Response) => {
	const id = getHeader(req, 'id');
	if (!id) res.status(400).send('invalid request');
	const del = await deleteJobCommon(id);
	return res.status(200).send(`del response: ${del}`);
};

export const allExec = async (_: Request, res: Response) => {
	const execs = await getExec('*');
	return res.status(200).send(execs);
};

export const allJobs = async (_: Request, res: Response) => {
	const execs = await getJob('*');
	return res.status(200).send(execs);
};

export const allTasks = async (_: Request, res: Response) => {
	const tasks = await getTask('*');
	return res.status(200).send(tasks);
};

export const validateIncomingTraffic = (
	req: Request,
	res: Response,
	next: NextFunction,
) => {
	let id: string = randomUUID();

	logger.debug(`new incoming web request from ${req.hostname}:(${req.ip})`);

	try {
		const _id = getHeader(req, 'id');
		if (isValidUUID(_id)) id = _id;
	} catch (e) {
		logger.warn(`something went wrong getting id header, error: ${e}`);
	}

	logger.debug(`request: ${id}, target url: ${req.url}`);

	const valid = true; // just until auth is figured out

	if (valid) next();
	else res.status(400).send();
};