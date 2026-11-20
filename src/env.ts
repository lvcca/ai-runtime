import process from 'process';
import os from 'os';

export const _env = {
	...process.env,
	webServerPort: parseInt(process.env['PORT'] ?? String(8080)),
	hostname: process.env['HOSTNAME'] ?? os.hostname(),
	ollamaBaseURL: process.env['OLLAMA_BASE_URL'] ?? 'http://localhost:11434/',
	redisURL: process.env['REDIS_URL'] ?? 'redis://redis:6379',
};
