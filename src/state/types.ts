import type { ValidatorResponse } from '../prompts/types/TaskValidator.js';

export type PromptChain = {
	userRequestChain?: string[];
	llmResponseChain?: string[];
};

export const Status = {
	FAILED: 'FAILED',
	QUEUED: 'QUEUED',
	RUNNING: 'RUNNING',
	COMPLETED: 'COMPLETED',
	HALTED: 'HALTED',
} as const;

export type _Status = (typeof Status)[keyof typeof Status];

export type Status = {
	status: _Status;
	message?: string;
};

export const TaskType = {
	TASK_DIRECT: 'TASK_DIRECT', // for direct llm query, no fancy tool or runtime stuffs
	TASK: 'TASK',
	EXECUTION: 'EXECUTION',
	JOB: 'JOB',
	SHELL_JOB: 'SHELL_JOB',
} as const;

export type TaskType = (typeof TaskType)[keyof typeof TaskType];

export type RelatedTransactionsChain =
	| {
			job?: string[];
			task?: string[];
			exec?: string[];
			shellJob?: string[];
	  }
	| undefined;

export type StateEntryBase = {
	id: string;
}

export type Transaction = StateEntryBase & {
	type?: TaskType;
	status?: Status;
	prompt?: PromptChain;
	related?: RelatedTransactionsChain;
	result?: string; // final llm response
	validatorResponse?: ValidatorResponse;
};
