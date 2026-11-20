import '@lvcca/ts-assert';

import { _env } from './env.ts';
import { app, webServerPort } from './server/server.ts';
import './api/api.ts';
import { getLogger } from './logger/logger.ts';
import './tools/ToolBootstrap.ts';
import { hostname } from 'node:os';
import { toolRegistry } from './tools/ToolRegistry.ts';

const logger = getLogger('main');


app.listen(webServerPort, () => {
	logger.info(
		`Found schemas: ${JSON.stringify(Array.from(toolRegistry.listSchemas()))}.`,
	);
	logger.info(
		`Registered tools: ${JSON.stringify(toolRegistry.listRegisteredTools())}.`,
	);
	logger.info(
		`Server started on hostname:port: \'http://${hostname()}:${webServerPort}\', env: ${JSON.stringify(_env)}`,
	);
});
