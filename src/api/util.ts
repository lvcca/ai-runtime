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
import { RunTask } from '../worker/TaskWorker.ts';
import { RunExec } from '../worker/ExecutionWorker.ts';
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
	type Transaction,
} from '../state/types.ts';
import { isValidUUID } from '../util/InputValidation.ts';

const logger = getLogger('api_util');

export const getHeader = (req: Request, header: string) => {
	const _header = req.headers[header];

	if (!_header || typeof _header !== 'string') throw new Error('no valid id');
	else return _header;
};

export const GeneralInsert = async ({
	req,
	type,
	//
	_id,
	_task,
	verbose = false,
}: {
	//
	req?: Request;
	type?: TaskType;
	//
	_id?: string;
	_task?: string;
	verbose?: false;
}) => {
	if (verbose) logger.debug(`in task insert`);

	let successful: boolean = false;

	let id = '';
	let task = '';

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

	assert(id !== '' && task !== '', 'Malformed call to GeneralInsert...');

	const exists = await redisEntryExists(id);

	if (verbose) logger.debug(`exists: ${exists}`);

	// if exists get entry
	let currEntry: Transaction | undefined;
	if (exists) currEntry = await redisGet(id);

	// redis save obj
	let transaction: Transaction | undefined;

	// if exists create new task with link to existing task
	if (exists) {
		const newId = randomUUID();

		const prompt: PromptChain = currEntry?.prompt ?? {};

		const llmResponse = prompt.llmResponseChain ?? [];
		const userRequest = prompt.userRequestChain ?? [];

		llmResponse?.push(task);

		const newPrompt: PromptChain = {
			userRequestChain: userRequest,
			llmResponseChain: llmResponse,
		};

		let related: RelatedTransactionsChain = structuredClone(currEntry?.related);

		switch (currEntry?.type) {
			case TaskType.EXECUTION:
				if (related && !related?.exec) related.exec = [];
				related?.exec?.push(id);
				break;
			case TaskType.JOB:
				if (related && !related.job) related.job = [];
				related?.job?.push(id);
				break;
			case TaskType.TASK_DIRECT:
			case TaskType.TASK:
				if (related && !related.task) related.task = [];
				related?.task?.push(id);
				break;
		}

		transaction = {
			id: newId,
			status: {
				status: Status.QUEUED,
			},
			type,
			prompt: newPrompt,
			related,
		};

		// for return statement to be accurate
		id = newId;

		assert(id === newId, 'sanity check failed id !== newId');
	} else {
		// create new transaction
		transaction = {
			id,
			status: {
				status: Status.QUEUED,
			},
			type: type,
			prompt: {
				userRequestChain: [task],
				llmResponseChain: [],
			},
		};
	}

	if (verbose)
		logger.debug(
			`full saved exists transaction: ${JSON.stringify(transaction)}`,
		);

	if (verbose) logger.debug(`Incoming newTask: ${id}, type: ${type}`);

	switch (type) {
		case TaskType.SHELL_JOB:
			successful = await setShellJob(transaction);
			break;
		case TaskType.EXECUTION:
			successful = await setExec(transaction);
			break;
		case TaskType.JOB:
			successful = await setJob(transaction);
			break;
		case TaskType.TASK_DIRECT:
		case TaskType.TASK:
			successful = await setTask(transaction);
			break;
	}

	if (verbose) logger.info(`successful: ${successful}`);

	return id;
};

export const resolveRelated = async (related?: RelatedTransactionsChain) => {
	let tasks: Transaction[] = [];
	let execs: Transaction[] = [];
	let jobs: Transaction[] = [];

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

export const validate = async (id?: string) => {
	logger.info(`validating transaction: ${id}`);

	if (!id) throw new Error(`validate requires a valid id... id: ${id}`);
	const entry = await redisGet(id);
	if (!entry) throw new Error(`could not find valid entry: id: ${id}`);

	logger.info(`found entry: ${JSON.stringify(entry)}`);

	const { result, prompt, related } = entry;

	const task = entry.prompt?.userRequestChain;

	let _result: string;

	logger.info(`res: ${result}, prompt: ${JSON.stringify(prompt)}`);

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

	logger.debug(`Task Validator Result: ${_result}`);

	const responseBlock = await extractResponseBlock(_result);
	if (!responseBlock)
		throw new Error(`invalid response from validator: ${responseBlock}`);

	const validatorResponse =
		await parseJsonSafe<ValidatorResponse>(responseBlock);

	logger.debug(`validator response: ${JSON.stringify(validatorResponse)}`);

	await redisSet({ id: id, validatorResponse: validatorResponse });

	return validatorResponse;
};

export const runEntry = async (id: string, type: TaskType) => {
	let result: string = 'FAILED';

	const currentTx = await redisGet(id);

	const taskDirect = currentTx?.type === TaskType.TASK_DIRECT;
	const user_req = currentTx?.prompt?.userRequestChain;

	if (!user_req || user_req.length < 1)
		throw new Error(`no user req string found for task ${id}`);

	const latestRequest = user_req[0];

	switch (type) {
		case TaskType.TASK_DIRECT:
		case TaskType.TASK:
			result = await RunTask(id, latestRequest, taskDirect);
			break;
		case TaskType.EXECUTION:
			result = await RunExec(id, latestRequest);
			break;
		default:
			logger.warn(`no case for ${type}`);
	}

	logger.info(
		`start result: type: ${type}, task: ${user_req}, result: ${result}`,
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
			break;
		case 'retry':
			const prompt = managerResponse.next_action.prompt;

			await newExecCommon({
				_id: exec_id,
				_task: prompt,
			});

			// next actions here

			success = true;
	}

	return success;
};

export const newExecCommon = async ({
	req,
	res,
	_id,
	_task,
}: {
	req?: Request;
	res?: Response;
	//
	_id?: string;
	_task?: string;
}) => {
	try {
		//
		const exec_id = await GeneralInsert({
			req,
			type: TaskType.EXECUTION,
			//
			_id,
			_task,
		});

		const llm_response = await runEntry(exec_id, TaskType.EXECUTION);
		const validatorResponse = await validate(exec_id);
		const currObj = await getExec(exec_id);

		//
		const summary = await SummarizeLlmTransaction(exec_id);
		//

		const executionResults = await ManageExecutionResults(exec_id);

		if (
			executionResults.next_action &&
			executionResults?.transaction_status !== 'success'
		) {
			const res = await getExecManagerNextAction(exec_id, executionResults);
			// if branching?
			// remove return
			return res; //<-- for lint #TODO fix me with feature implementation exec branching
		}

		const response = {
			llm_response,
			validatorResponse,
			currObj,
			summary,
			ManagerResponse: executionResults,
		};

		logger.debug(`responding to client: ${JSON.stringify(response, null, 2)}`);

		// else
		return res?.status(200).send(response);
	} catch (e) {
		logger.error(`something went wrong in newExec: ${e}`);
		return res?.status(500).send(undefined);
	}
};

export const newTaskDirect = async (req: Request, res: Response) => {
	const task_id = await GeneralInsert({ req, type: TaskType.TASK_DIRECT });
	const llm_response = await runEntry(task_id, TaskType.TASK_DIRECT);

	return res.status(200).send(llm_response);
};

export const newTask = async (req: Request, res: Response) => {
	const task_id = await GeneralInsert({ req, type: TaskType.TASK });
	const llm_response = await runEntry(task_id, TaskType.TASK);

	return res.status(200).send(llm_response);
};

export const newJob = async (req: Request, res: Response) => {
	const successful = await GeneralInsert({ req, type: TaskType.JOB });
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

	logger.debug(`new incoming web request`);

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
