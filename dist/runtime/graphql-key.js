export function sortObjectKeys(obj) {
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  if (obj !== null && typeof obj === "object") {
    return Object.fromEntries(
      Object.keys(obj).sort().map((k) => [k, sortObjectKeys(obj[k])])
    );
  }
  return obj;
}
export function djb2Hash(str) {
  let hash = 5381;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) + hash ^ str.charCodeAt(i);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function buildKey(operationName, variables) {
  if (!variables || Object.keys(variables).length === 0) return operationName;
  return `${operationName}__${djb2Hash(JSON.stringify(sortObjectKeys(variables)))}`;
}
function extractQueryName(query) {
  return query?.match(/\w+\s+(?<queryName>\w+)\(/)?.groups?.queryName ?? null;
}
export function graphqlCassetteKey(body) {
  if (typeof body !== "string") return null;
  let parsed;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  const operationName = typeof parsed.operationName === "string" ? parsed.operationName : null;
  const queryName = operationName || extractQueryName(parsed.query);
  if (!queryName) return null;
  const variables = parsed.variables ?? null;
  return buildKey(queryName, variables);
}
