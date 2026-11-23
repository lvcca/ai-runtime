import { getLogger } from '../logger/logger.ts';
import { getTypeFromFile, llmTasks } from '../llm.ts';
import { TaskType } from '../state/types.ts';
import { parseJsonSafe, appendToTransactionLog } from './util.ts';
import type { PlannerWorkerPlan, PlannerWorkerResultType } from '../prompts/types/PlannerWorkerTypes.js';

const logger = getLogger('Planner');

export const genDynamicSteps = (n: number): PlannerWorkerPlan => {
	const steps: string[] = [];

	for (let i = 0; i < n; i++) {
		steps.push(`step ${i + 1}`);
	}

	return { steps };
};

export const getPlan = async ({task, maxSteps=5}:{task: string, maxSteps?: number}) =>
	await llmTasks(`
    You are a planning agent.

    Your job is to decompose tasks into concise executable steps.

    RULES:
    - Return ONLY valid JSON
    - Do not explain reasoning
    - Do not include markdown
    - Use at most 5 steps
    - Steps must be concrete and actionable

    TASK:
    ${task}

	OUTPUT FORMAT:
	use PlannerWorkerPlan from : {
		${await getTypeFromFile({file: 'PlannerWorkerTypes.d.ts'})}
	}
	
	MaxSteps:
	${maxSteps}

	Example:
	${genDynamicSteps(maxSteps)}
`);

export const RevisePlan = async ({
	task_id,
	task,
	plan,
	depth = 5,
	verbose=false
}: {
	task_id: string;
	task: string;
	plan: string;
	depth?: number;
	verbose?: boolean
}): Promise<PlannerWorkerResultType> => {
	// recursion exit
	if (depth == 0) {
		await appendToTransactionLog({
			_id: task_id,
			type: TaskType.TASK,
			newUserRequest: task,
			newLLMResponse: plan,
		});

		return {
			approved: false,
			revise_plan: false,
			steps: [plan],
		} as PlannerWorkerResultType;
	}

	if (verbose) {
		logger.info(`current task: ${task}`);
		logger.info(`current plan: ${plan}`);
	}

	await appendToTransactionLog({
		_id: task_id,
		type: TaskType.TASK,
		newUserRequest: task,
		newLLMResponse: plan,
	});

	const prompt = `You are a planning critic. You only have ${depth} number of attempts left to get this right.

TASK:
${task}  

PLAN:
${JSON.stringify(plan)}

Evaluate the plan.

Return ONLY JSON:

If 'revise_plan' is Truthy:
    Assume the plan is not acceptable and revise the plan before critic. 
    Always remove the revise_plan flag from the output.

If acceptable return the following data-structure:
${JSON.stringify({
	approved: Boolean,
	steps: [], // <-- populated with real steps
	revise_plan: Boolean,
	plan_feedback: [], //<-- populated with problems with previous steps
})}

If not acceptable return the following data-structure:
${JSON.stringify({
	approved: false,
	steps: [], // <-- populated with real steps
	revise_plan: true,
	plan_feedback: [], // <-- populated with problems with previous steps
})}
`;

	if (verbose) logger.info(`prompt: ${prompt}`);

	const raw = await llmTasks(prompt);

	assert(!!raw, 'no response from llm...')

	if (verbose) logger.info(`raw response: ${raw}`);

	const result = parseJsonSafe<PlannerWorkerResultType>(raw);

	if (!result)
		return RevisePlan({
			task_id,
			task,
			plan,
			depth: depth - 1,
		});

	if (result.approved) return result;
	else {
		const new_plan = result['steps'].join() ?? plan;
		const plan_feedback = JSON.stringify(result['plan_feedback']);
		let _new_plan = new_plan;

		// combine
		if (plan_feedback)
			_new_plan = `${new_plan}\n\nThe previous plan did not accomplish the following: ${JSON.stringify(plan_feedback)}\n\n`;

		return RevisePlan({
			task_id,
			task,
			plan: _new_plan,
			depth: depth - 1,
		});
	}
};
