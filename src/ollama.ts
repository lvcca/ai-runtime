import { _env } from './env.ts';
import { CONTEXTS } from './llm.ts';
import { getLogger } from './logger/logger.ts';

const logger = getLogger('ollama');

const LLM_MODEL = {
    LLAMA_3_1: 'llama3.1',
    QWEN3_CODER: 'qwen3-coder:latest',
    GRANITE_4: 'granite4.1:3b',
};
export type LLM_MODEL = (typeof LLM_MODEL)[keyof typeof LLM_MODEL];

export type OllamaCallResponse = { response: string };

const OLLAMA_URL = _env.ollamaBaseURL;

export const ollamaPull = async (model: string) => {
    const response = await fetch(`${OLLAMA_URL}/api/pull`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            name: model,
            stream: false,
        }),
    });
    assert(response.ok, `ollamaPull unsuccessful: ${response.status}.`)
    return response.json();
};

export const ollamaPs = async () => {
    const response = await fetch(`${OLLAMA_URL}/api/ps`, { method: 'GET' });
    assert(response.ok, `ollamaPs unsuccessful: ${response.status}.`)
    return response.json();
};

export const ollamaTags = async () => {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, { method: 'GET' });
    assert(response.ok, `ollamaTags unsuccessful: ${response.status}.`)
    return response.json();
};

type Choice = {
    type: 'choice';
    questions: string;
};

type SystemOneBody = {
    model: string;
    state: string;
    questions: Choice[];
};

export const ollamaSystemOne = async (
    model: string,
    state: string,
    questions: Choice[],
) => {
    const body: SystemOneBody = {
        model,
        state,
        questions,
    };

    const response = await fetch(`${OLLAMA_URL}/v1/systemone`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
    });

    assert(response.ok, `ollamaSystemOne unsuccessful: ${response.status}.`);

    return response.json();
};

export const ollamaShow = async ({
    model,
    verbose = false,
}: {
    model: string;
    verbose: boolean;
}) => {
    const response = await fetch(`${OLLAMA_URL}/api/tags`, {
        method: 'POST',
        body: JSON.stringify({
            name: model,
            verbose: verbose,
        }),
    });
    assert(response.ok, `ollamaShow unsuccessful: ${response.status}.`)
    return response.json();
};

export const ollamaGenerate = async (
    prompt: string,
    model: LLM_MODEL = LLM_MODEL.QWEN3_CODER,
) => {
    try {
        logger.info(`calling llm ${prompt}`);

        const karpathyGuidelines = `${CONTEXTS['karpathyGuidelines']} + '\n'`;

        const response = await fetch(`${OLLAMA_URL}1`, {
            body: JSON.stringify({
                model,
                prompt: `${karpathyGuidelines} ${prompt}`,
                stream: false,
            }),
            headers: {
                'Content-Type': 'application/json',
            },
            method: 'POST',
        });
        assert(response.ok, `ollamaShow unsuccessful: ${response.status}.`)
        const _response = (await response.json()) as OllamaCallResponse;

        return _response.response;
    } catch (e) {
        logger.error(`something went wrong in call_llm: ${JSON.stringify(e)}`);
    }
};