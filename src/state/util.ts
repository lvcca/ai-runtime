import { redisDelete, redisEntryExists, redisGet, redisSet } from './state.ts';
import { getLogger } from '../logger/logger.ts';
import { TaskType, type StateTransaction } from './types.ts';

const logger = getLogger('state_util');

export const setShellJob = async (tx: StateTransaction, verbose?: boolean) => {
	assert(tx.type === TaskType.SHELL_JOB, `task type mismatch: requested: ${tx.type}, expected ${TaskType.SHELL_JOB}`)

	const successful = await redisSet<StateTransaction>({incomingEntry: tx});
	if (verbose) logger.debug(`setShellJob: successful ${successful}`);
	return successful;
};

export const setTask = async (tx: StateTransaction) => {
	assert(tx.type === TaskType.TASK || tx.type === TaskType.TASK_DIRECT, `task type mismatch: requested: ${tx.type}, expected ${TaskType.TASK} || ${TaskType.TASK_DIRECT}`)

	const successful = await redisSet<StateTransaction>({incomingEntry: tx});
	logger.info(`setTask: successful ${successful}`);
	return successful;
};

export const setExec = async (tx: StateTransaction & { exec?: string }) => {
	assert(tx.type === TaskType.EXECUTION, `task type mismatch: requested: ${tx.type}, expected ${TaskType.EXECUTION}`)

	const successful = await redisSet<StateTransaction>({incomingEntry: tx});
	return successful;
};

export const setJob = async (tx: StateTransaction & { job?: string }) => {
	assert(tx.type === TaskType.TOOL_JOB, `task type mismatch: requested: ${tx.type}, expected ${TaskType.TOOL_JOB}`)
	
	const successful = await redisSet<StateTransaction>({incomingEntry: tx});
	return successful;
};

export const getShellJob = async (id: string) => {
	const entry = await redisGet<StateTransaction>(id);
	
	assert(!!entry, 'no entry returned for shell job...')
	assert(entry.type === TaskType.SHELL_JOB, `task type mismatch: requested ${TaskType.SHELL_JOB} received: ${entry?.type}`)

	return entry;
};

export const getTask = async (id: string) => {
	const entry = await redisGet<StateTransaction>(id);

	assert(!!entry, 'no entry returned for getTask...')
	assert(entry.type === TaskType.TASK || entry.type === TaskType.TASK_DIRECT, `task type mismatch: requested ${TaskType.TASK} || ${TaskType.TASK_DIRECT} received: ${entry?.type}`)

	return entry;
};

export const getExec = async (id: string) => {
	const entry = await redisGet<StateTransaction>(id);

	assert(!!entry, 'no entry returned for getExec...')
	assert(entry.type === TaskType.EXECUTION, `task type mismatch: requested ${TaskType.EXECUTION} received: ${entry?.type}`)

	return entry;
};

export const getJob = async (id: string) => {
	const entry = await redisGet<StateTransaction>(id);

	assert(!!entry, 'no entry returned for getExec...')
	assert(entry.type === TaskType.TOOL_JOB, `task type mismatch: requested ${TaskType.TOOL_JOB} received: ${entry?.type}`)

	return entry;
};

export const deleteTaskCommon = async (id: string) => {
	try {
		const entry = await redisGet<StateTransaction>(id);

		switch (entry?.type) {
			case TaskType.TASK:
			case TaskType.TASK_DIRECT:
				return await redisDelete(id);

			default:
				throw new Error(
					`task type mismatch: requested ${TaskType.TASK} || ${TaskType.TASK_DIRECT} received: ${entry?.type}`,
				);
		}
	} catch (e) {
		throw new Error(`could not find entry in deleteTask: error: ${e}`);
	}
};

export const deleteExecCommon = async (id: string) => {
	try {
		const entry = await redisGet<StateTransaction>(id);

		assert(!!entry,)
		assert(entry.type === TaskType.EXECUTION, `task type mismatch: requested ${TaskType.EXECUTION} received: ${entry?.type}`)

		return await redisDelete(id);
	} catch (e) {
		throw new Error(`could not find entry in deleteExec: error: ${e}`);
	}
};

export const deleteJobCommon = async (id: string) => {
	try {
		const entry = await redisGet<StateTransaction>(id);

		if (!entry || entry?.type !== TaskType.TOOL_JOB)
			throw new Error(
				`task type mismatch: requested ${TaskType.TOOL_JOB} received: ${entry?.type}`,
			);

		return await redisDelete(id);
	} catch (e) {
		throw new Error(`could not find entry in deleteJob: error: ${e}`);
	}
};

export const stateTransactionExists = async (id: string) => await redisEntryExists(id);
