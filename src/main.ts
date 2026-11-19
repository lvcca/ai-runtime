import { _env } from './env.ts';
import { app, webServerPort } from './server/server.ts';
import './api/api.ts';
import { getLogger } from './logger/logger.ts';
import './tools/ToolBootstrap.ts';
import { hostname } from 'node:os';
import { toolRegistry } from './tools/ToolRegistry.ts';

const logger = getLogger('main');

app.listen(webServerPort, () => {
	const msg =
		`Found schemas: ${JSON.stringify(toolRegistry.listSchemas())}, ` +
		`registered tools: ${JSON.stringify(toolRegistry.listRegisteredTools())}.\n` +
		`Server started on hostname:port: \'http://${hostname()}:${webServerPort}\', env: ${JSON.stringify(_env, null, 2)}`;

	logger.info(msg);
});
