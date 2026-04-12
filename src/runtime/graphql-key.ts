// src/runtime/graphql-key.ts
// Pure utilities — no Nuxt imports, safe to use in Node.js, browser, and test files.

export function sortObjectKeys(obj: unknown): unknown {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === 'object') {
    return Object.fromEntries(
      Object.keys(obj as object)
        .sort()
        .map((k) => [k, sortObjectKeys((obj as Record<string, unknown>)[k])]),
    );
  }
  return obj;
}

export function djb2Hash(str: string): string {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = ((hash << 5) + hash) ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function buildKey(operationName: string, variables: Record<string, unknown> | null): string {
  if (!variables || Object.keys(variables).length === 0) return operationName;
  return `${operationName}__${djb2Hash(JSON.stringify(sortObjectKeys(variables)))}`;
}

function extractQueryName(query: string): string | null {
  return query?.match(/\w+\s+(?<queryName>\w+)\(/)?.groups?.queryName ?? null;
}

export function graphqlCassetteKey(body?: BodyInit | null): string | null {
  if (typeof body !== 'string') return null;
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const operationName = typeof parsed.operationName === 'string' ? parsed.operationName : null;
  const queryName = operationName || extractQueryName(parsed.query as string);
  if (!queryName) return null;
  const variables = (parsed.variables as Record<string, unknown>) ?? null;
  return buildKey(queryName, variables);
}
