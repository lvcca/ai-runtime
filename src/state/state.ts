import {
	createClient,
	type RedisClientType,
	type RedisDefaultModules,
} from 'redis';
import { getLogger } from '../logger/logger.ts';
import type { Transaction } from './types.ts';

const logger = getLogger('state');

const client: RedisClientType = createClient({
	url: 'redis://redis:6379',
});

let connection: RedisClientType<RedisDefaultModules, {}, {}, 3, {}> | undefined;

client.on('error', (err: Error) => logger.error('Redis Client Error:', err));
client.on('connect', () => logger.info('Redis Client Connected!'));

export const getConnection = async () => {
	try {
		if (!connection) connection = await client.connect();
		return connection;
	} catch (e) {
		logger.error(`something went wrong in getConnection: ${e}`);
		throw new Error(`redis connection cannot be established: error ${e}`);
	}
};

export const redisSet = async (transaction: Transaction) => {
	let successful = false;

	try {
		const _connection = await getConnection();

		let _new_entry = structuredClone(transaction);

		// get current val if exists
		if (await redisEntryExists(transaction.id)) {
			const _existing_entry = await redisGet<Transaction>(transaction.id);

			// allow _new_entry overwrite _existing_entry
			_new_entry = {
				..._existing_entry,
				..._new_entry,
			};
		}

		// save
		const saved_status = await _connection.set(
			_new_entry.id,
			JSON.stringify(_new_entry),
		);

		//
		logger.debug(
			`redisSet, saved status: ${saved_status}, value: ${JSON.stringify(_new_entry)}`,
		);

		successful = true;
	} catch (e) {
		logger.error(`something went wrong in redisSet: ${e}`);
	}

	return successful;
};

export const redisDelete = async (id: string | string[]) => {
	const _ids = Array.isArray(id) ? id : [id];

	try {
		const _connection = await getConnection();
		return await _connection.del(_ids);
	} catch (e) {
		logger.error(`something went wrong in redisGet: ${e}`);
	}
};

export const redisGetAll = async () => {
	try {
		const _connection = await getConnection();
		const keys = (await _connection.keys('*')) ?? [];

		if (!keys || keys.length < 1) throw new Error(`could not find entries..`);

		return structuredClone(keys);
	} catch (e) {
		logger.error(`something went wrong in redisGet: ${e}`);
	}
};

export const redisGet = async <T> (id: string) => {
	try {
		const _connection = await getConnection();
		const entry = await _connection.get(id);

		if (!entry || typeof entry !== 'string')
			throw new Error(`could not find entry with id: ${id}`);

		const parsed: T = JSON.parse(entry);
		return structuredClone(parsed);
	} catch (e) {
		logger.error(`something went wrong in redisGet: ${e}`);
	}
};

export const redisEntryExists = async (id: string) => {
	let exists = false;

	try {
		const _connection = await getConnection();
		exists = (await _connection.exists(id)) === 1;
	} catch (e) {
		logger.error(`something went wrong in redisExists: ${e}`);
	}

	return exists;
};
