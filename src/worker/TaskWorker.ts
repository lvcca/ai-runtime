import { llmChat, llmTasks } from '../llm.ts';
import { getLogger } from '../logger/logger.ts';
import { type _Status, Status, TaskType } from '../state/types.ts';
import { setTask } from '../state/util.ts';
import {
	GetPlan,
	type PlannerWorkerResultType,
	RevisePlan,
} from './Planner.ts';
import { appendToTransactionLog } from './util.ts';

const logger = getLogger('TaskWorker');

export const runTask = async (
	task_id: string,
	task: string,
	LLM_DIRECT: boolean,
	verbose?: boolean
) => {

	if (verbose) logger.info(
		`RunTask: task_id: ${task_id}, task: ${task}, LLM_DIRECT: ${LLM_DIRECT}`,
	);

	await setTask({
		id: task_id,
		status: { status: Status.RUNNING },
	});

	let final_output: string | undefined;
	let plan: string | undefined;
	let revised_plan: string | undefined;
	let status: _Status = Status.FAILED; // assume failed

	try {
		if (LLM_DIRECT) final_output = await llmChat(`${task}`);
		
		else {
			plan = await GetPlan(task);

			const RevisePlanResult: PlannerWorkerResultType = await RevisePlan({
				task_id,
				task,
				plan,
			});

			revised_plan = RevisePlanResult.steps.join();

			final_output = await llmTasks(`
	You are a task execution agent.
	
	Your job is to complete the requested task using the provided plan.
	
	ORIGINAL TASK:
	${task}
	
	PLAN:
	${revised_plan}
	
	RULES:
	- Follow the steps carefully
	- Be concise
	- Do not explain your reasoning unless necessary
	- Return only the completed result
	
	`);
		}

		await appendToTransactionLog({
			_id: task_id,
			type: LLM_DIRECT ? TaskType.TASK_DIRECT : TaskType.TASK,
			newUserRequest: task,
			newLLMResponse: plan,
		});

		status = Status.COMPLETED;
		
	} catch (e) {
		logger.error(`something went wrong in TaskWorker:RunTask: ${e}`);

		await appendToTransactionLog({
			_id: task_id,
			type: LLM_DIRECT ? TaskType.TASK_DIRECT : TaskType.TASK,
			newUserRequest: task,
			newLLMResponse: plan,
		});
	}

	await setTask({
		id: task_id,
		status: { status },
		result: final_output,
	});

	return final_output;
};
