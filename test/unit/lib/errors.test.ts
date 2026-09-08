/**
 * Unit tests for error classes
 */

import {
  McpError,
  ClientError,
  ServerError,
  NetworkError,
  AuthError,
  isMcpError,
  toMcpError,
  formatHumanError,
  isMethodNotFoundError,
} from '../../../src/lib/errors';

describe('McpError', () => {
  it('should create an error with message and code', () => {
    const error = new McpError('Test error', 1);
    expect(error.message).toBe('Test error');
    expect(error.code).toBe(1);
    expect(error.name).toBe('McpError');
  });

  it('should include optional details', () => {
    const details = { foo: 'bar' };
    const error = new McpError('Test error', 1, details);
    expect(error.details).toEqual(details);
  });

  it('should have a proper stack trace', () => {
    const error = new McpError('Test error', 1);
    expect(error.stack).toBeDefined();
    expect(error.stack).toContain('McpError');
  });

  it('should convert to JSON', () => {
    const error = new McpError('Test error', 1, { test: true });
    const json = error.toJSON();
    expect(json).toEqual({
      error: 'McpError',
      message: 'Test error',
      code: 1,
      details: { test: true },
    });
  });
});

describe('ClientError', () => {
  it('should have exit code 1', () => {
    const error = new ClientError('Invalid argument');
    expect(error.code).toBe(1);
    expect(error.message).toBe('Invalid argument');
    expect(error.name).toBe('ClientError');
  });
});

describe('ServerError', () => {
  it('should have exit code 2', () => {
    const error = new ServerError('Tool execution failed');
    expect(error.code).toBe(2);
    expect(error.message).toBe('Tool execution failed');
    expect(error.name).toBe('ServerError');
  });
});

describe('NetworkError', () => {
  it('should have exit code 3', () => {
    const error = new NetworkError('Connection timeout');
    expect(error.code).toBe(3);
    expect(error.message).toBe('Connection timeout');
    expect(error.name).toBe('NetworkError');
  });
});

describe('AuthError', () => {
  it('should have exit code 4', () => {
    const error = new AuthError('Invalid credentials');
    expect(error.code).toBe(4);
    expect(error.message).toBe('Invalid credentials');
    expect(error.name).toBe('AuthError');
  });
});

describe('isMcpError', () => {
  it('should return true for McpError instances', () => {
    expect(isMcpError(new McpError('test', 1))).toBe(true);
    expect(isMcpError(new ClientError('test'))).toBe(true);
    expect(isMcpError(new ServerError('test'))).toBe(true);
    expect(isMcpError(new NetworkError('test'))).toBe(true);
    expect(isMcpError(new AuthError('test'))).toBe(true);
  });

  it('should return false for non-McpError values', () => {
    expect(isMcpError(new Error('test'))).toBe(false);
    expect(isMcpError('string')).toBe(false);
    expect(isMcpError(null)).toBe(false);
    expect(isMcpError(undefined)).toBe(false);
    expect(isMcpError({ message: 'test' })).toBe(false);
  });
});

describe('toMcpError', () => {
  it('should return McpError as-is', () => {
    const error = new ClientError('test');
    expect(toMcpError(error)).toBe(error);
  });

  it('should convert Error to ClientError', () => {
    const error = new Error('test error');
    const mcpError = toMcpError(error);
    expect(mcpError).toBeInstanceOf(ClientError);
    expect(mcpError.message).toBe('test error');
    expect(mcpError.code).toBe(1);
  });

  it('should convert string to ClientError', () => {
    const mcpError = toMcpError('test error');
    expect(mcpError).toBeInstanceOf(ClientError);
    expect(mcpError.message).toBe('test error');
    expect(mcpError.code).toBe(1);
  });

  it('should convert other values to ClientError', () => {
    const mcpError = toMcpError(123);
    expect(mcpError).toBeInstanceOf(ClientError);
    expect(mcpError.message).toBe('123');
    expect(mcpError.code).toBe(1);
  });
});

describe('formatError', () => {
  it('should format error message without verbose mode', () => {
    const error = new ClientError('test error');
    const formatted = formatHumanError(error, false);
    expect(formatted).toBe('Error: test error');
  });

  it('should format error with details in verbose mode', () => {
    const error = new ClientError('test error', { foo: 'bar' });
    const formatted = formatHumanError(error, true);
    expect(formatted).toContain('Error: test error');
    expect(formatted).toContain('Details:');
    expect(formatted).toContain('"foo": "bar"');
  });

  it('should format error with stack trace in verbose mode', () => {
    const error = new ClientError('test error');
    const formatted = formatHumanError(error, true);
    expect(formatted).toContain('Error: test error');
    expect(formatted).toContain('Stack trace:');
    expect(formatted).toContain('ClientError');
  });

  it('should format non-McpError values', () => {
    const formatted = formatHumanError('simple string', false);
    expect(formatted).toBe('Error: simple string');
  });
});

describe('isMethodNotFoundError', () => {
  // A server that answers "I do not implement that method" was reached, parsed
  // the request and replied. Liveness probes must read that as alive.
  const protocolError = (message: string, code?: number) =>
    Object.assign(new Error(message), { name: 'ProtocolError', code });

  it('recognises the reserved JSON-RPC code', () => {
    expect(isMethodNotFoundError(protocolError('Method not found: ping', -32601))).toBe(true);
  });

  it('recognises the SDK v1 error name', () => {
    const v1 = Object.assign(new Error('Method not found: ping'), {
      name: 'McpError',
      code: -32601,
    });
    expect(isMethodNotFoundError(v1)).toBe(true);
  });

  it('unwraps one of our errors carrying the original', () => {
    const wrapped = new NetworkError('Ping failed: Method not found: ping', {
      originalError: protocolError('Method not found: ping', -32601),
    });
    expect(isMethodNotFoundError(wrapped)).toBe(true);
  });

  it('recognises it regardless of the wording servers choose', () => {
    // Slack says "Method not found: ping", Day One "Unknown method: ping";
    // both send -32601, so the code alone decides and no message parsing is
    // needed.
    expect(isMethodNotFoundError(protocolError('Unknown method: ping', -32601))).toBe(true);
  });

  it('does not guess from the message when the code is absent', () => {
    // A protocol error without the reserved code is not evidence of an
    // unimplemented method, however it is worded.
    expect(isMethodNotFoundError(protocolError('Unknown method: ping'))).toBe(false);
  });

  it('does not treat other protocol errors as method-not-found', () => {
    expect(isMethodNotFoundError(protocolError('Invalid params', -32602))).toBe(false);
  });

  it('does not treat a transport failure as method-not-found', () => {
    // The whole point: a real connection failure must stay a failure, even
    // though its message could mention a method.
    const transport = Object.assign(new Error('fetch failed: ping'), { name: 'TypeError' });
    expect(isMethodNotFoundError(transport)).toBe(false);
  });

  it('handles absent input', () => {
    expect(isMethodNotFoundError(undefined)).toBe(false);
    expect(isMethodNotFoundError(null)).toBe(false);
  });
});
