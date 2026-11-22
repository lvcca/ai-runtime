// thanks chat-gpt
const UUID_REGEX =
	/^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export const isValidUUID = (input: string): boolean => input.length === 36 && UUID_REGEX.test(input);
