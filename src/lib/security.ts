export function isPlainObject(obj: any): boolean {
  if (Object.prototype.toString.call(obj) !== '[object Object]') return false;
  if (Object.getPrototypeOf(obj) !== Object.prototype) return false;
  return true;
}

export function isSafeJson(value: any, depth = 5): boolean {
  if (depth < 0) return false;

  if (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return true;
  }

  if (Array.isArray(value)) {
    for (const v of value) if (!isSafeJson(v, depth - 1)) return false;
    return true;
  }

  if (typeof value === 'object') {
    if (!isPlainObject(value)) return false;
    for (const k of Object.keys(value)) {
      if (k === '__proto__' || k === 'constructor') return false;
      if (!isSafeJson((value as any)[k], depth - 1)) return false;
    }
    return true;
  }

  return false; // reject functions, symbols, etc.
}

export function validateAdminAction(action: any, allowed: string[]) {
  if (typeof action !== 'string') return false;
  return allowed.includes(action);
}
