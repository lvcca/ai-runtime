import type { NextFunction, Request, Response } from 'express';
import { getLogger } from '../logger/logger.ts';
import { redisEntryExists, redisGet, redisSet } from '../state/state.ts';
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
} from '../state/util.ts';
import { randomUUID } from 'node:crypto';
import { call_llm_task_validator } from '../llm.ts';
import {
	extractResponseBlock,
	parseJsonSafe,
	SummarizeLlmTransaction,
} from '../worker/util.ts';
import { runTask } from '../worker/TaskWorker.ts';
import { runExec } from '../worker/ExecutionWorker.ts';
import {
	ManageExecutionResults,
	type TransactionManagerResponse,
} from '../service/TransactionManager.ts';
import type { ValidatorResponse } from '../prompts/types/TaskValidator.js';
import {
	type PromptChain,
	type RelatedTransactionsChain,
	Status,
	TaskType,
	type StateTransaction,
} from '../state/types.ts';
import { isValidUUID } from '../util/InputValidation.ts';

const logger = getLogger('api_util');

export const getHeader = (req: Request, header: string) => {
	const _header = req.headers[header];

	if (!_header || typeof _header !== 'string') throw new Error('no valid id');
	else return _header;
};

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
	
	const exists = await redisEntryExists(id);

	if (verbose) logger.debug(`exists: ${exists}`);

	// redis save obj
	let _tx: StateTransaction | undefined;

	// if exists create new task with link to existing task
	if (exists) {

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

		let relatedTransactions: RelatedTransactionsChain = structuredClone(existingEntry.related);

		switch (existingEntry.type) {
			case TaskType.SHELL_JOB:
				if (relatedTransactions && !relatedTransactions?.shellJob) relatedTransactions.shellJob = [];
				relatedTransactions?.shellJob?.push(id);
				break;
			case TaskType.EXECUTION:
				if (relatedTransactions && !relatedTransactions?.exec) relatedTransactions.exec = [];
				relatedTransactions?.exec?.push(id);
				break;
			case TaskType.JOB:
				if (relatedTransactions && !relatedTransactions.job) relatedTransactions.job = [];
				relatedTransactions?.job?.push(id);
				break;
			case TaskType.TASK_DIRECT:
			case TaskType.TASK:
				if (relatedTransactions && !relatedTransactions.task) relatedTransactions.task = [];
				relatedTransactions?.task?.push(id);
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
		// create new transaction
		_tx = {
			id,
			status: {
				status: Status.QUEUED,
			},
			type: type,
			promptChain: {
				userRequestChain: [task],
				llmResponseChain: [],
			},
		};
	}

	if (verbose) {
		logger.debug(`full saved exists transaction: ${JSON.stringify(_tx)}`);
		logger.debug(`Incoming newTask: ${id}, type: ${type}`);
	}

	switch (type) {
		case TaskType.SHELL_JOB:
			successful = await setShellJob(_tx);
			break;
		case TaskType.EXECUTION:
			successful = await setExec(_tx);
			break;
		case TaskType.JOB:
			successful = await setJob(_tx);
			break;
		case TaskType.TASK_DIRECT:
		case TaskType.TASK:
			successful = await setTask(_tx);
			break;
	}

	if (verbose) logger.info(`successful: ${successful}`);

	return id;
};

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

	const { task, exec, job } = related;

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

export const ExecValidator = async ({id, verbose=false}:{id?: string, verbose?: boolean}) => {
	if (verbose) logger.debug(`validating transaction: ${id}`);

	assert(id, `validate requires a valid id... id: ${id}`)
	const entry = await redisGet<StateTransaction>(id);
	assert(entry, `could not find valid entry: id: ${id}`)

	if (verbose) logger.debug(`found entry: ${JSON.stringify(entry)}`);

	const { result, promptChain: prompt, related } = entry;

	const task = entry.promptChain?.userRequestChain;

	let _result: string;

	if (verbose) logger.debug(`res: ${result}, prompt: ${JSON.stringify(prompt)}`);

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
${JSON.stringify(prompt)}

RULES:
- Use ONLY valid JSON as output 
- Always explain reasoning
- Do NOT include markdown
- There are at most 5 steps
- Steps are concrete and actionable
- Any text not in Javascript notation MUST be prepended with a comment

Output FORMAT:
<LLM_RESPONSE>
{
		"valid": boolean,
		"reason": string | null,
		"confidence": number,
		"issues": string[],
		"evidence": string[]
}
</LLM_RESPONSE>
	`);

	if (verbose) logger.debug(`Task Validator Result: ${_result}`);

	const responseBlock = await extractResponseBlock(_result);
	if (!responseBlock)
		throw new Error(`invalid response from validator: ${responseBlock}`);

	const validatorResponse = parseJsonSafe<ValidatorResponse>(responseBlock);

	if (verbose) logger.debug(`validator response: ${JSON.stringify(validatorResponse)}`);

	const incomingEntry: StateTransaction = {
		id, 
		validatorResponse
	}

	await redisSet<StateTransaction>({incomingEntry});

	return validatorResponse;
};

export const run = async ({id, type}:{id: string, type: TaskType}) => {
	let result: string = 'FAILED';

	const currentTx = await redisGet<StateTransaction>(id);

	const taskDirect = currentTx?.type === TaskType.TASK_DIRECT;
	const userRequestChain = currentTx?.promptChain?.userRequestChain;

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

			// START HERE
			await newExecCommon({
				_id: exec_id,
				_task: prompt,
			});

			// next actions here
			success = true;
			break;
	}

	return success;
};

export const newExecCommon = async ({
	req,
	res,
	_id,
	_task,
	verbose=false
}: {
	req?: Request;
	res?: Response;
	//
	_id?: string;
	_task?: string;
	verbose?: boolean;
}) => {

	try {

		// persist
		const exec_id = await generalInsert({
			req,
			type: TaskType.EXECUTION,
			//
			_id,
			_task,
		});

		// execute
		const llm_response = await run({
			id: exec_id, 
			type: TaskType.EXECUTION
		});

		// analysis and plan branching
		const validatorResponse = await ExecValidator({id: exec_id});
		const summary = await SummarizeLlmTransaction(exec_id);
		const execManagementResults = await ManageExecutionResults(exec_id);

		if (
			execManagementResults.next_action &&
			execManagementResults?.transaction_status !== 'success'
		) {
			const res = await getExecManagerNextAction(exec_id, execManagementResults);
			// if branching?
			// remove return
			return res; //<-- for lint #TODO fix me with feature implementation exec branching
		}

		const response = {
			llm_response: llm_response,
			validatorResponse: validatorResponse,
			summary: summary,
			ManagerResponse: execManagementResults,
		};
		
		if (verbose) logger.debug(`responding to client: ${JSON.stringify(response, null, 2)}`);
		
		// else
		return res?.status(200).send(response);

	} catch (e) {
		logger.error(`something went wrong in newExec: ${e}`);
		return res?.status(500).send(undefined);
	}
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

// export const _try = <T extends (...args: any[]) => any>(
// 	func: T
// ) => {
// 	return (...args: Parameters<T>): ReturnType<T> | undefined => {
// 		try {
// 			return func(...args);
// 		} catch (e) {
// 			logger.error(`Something went wrong in ${func.name}: ${e}`);
// 			return undefined;
// 		}
// 	};
// };

export const newJob = async (req: Request, res: Response) => {
	const successful = await generalInsert({ req, type: TaskType.JOB });
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