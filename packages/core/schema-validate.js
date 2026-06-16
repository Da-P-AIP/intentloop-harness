"use strict";
// Minimal, dependency-free JSON Schema validator covering exactly the subset of
// Draft-07 used by schema/thought-packet.schema.json: type, required,
// properties, items, enum, minimum, maximum, minLength. Keeping it self-contained
// means the loop runs offline with pure Node (no npm install needed for M1).

function typeOf(v) {
  if (Array.isArray(v)) return "array";
  if (v === null) return "null";
  return typeof v; // object, string, number, boolean
}

function validateNode(data, schema, pathStr, errors) {
  if (schema.type) {
    const t = typeOf(data);
    const ok = schema.type === "number" ? (t === "number") : t === schema.type;
    if (!ok) {
      errors.push(`${pathStr}: expected type ${schema.type}, got ${t}`);
      return; // type wrong -> further checks meaningless
    }
  }
  if (schema.enum && !schema.enum.includes(data)) {
    errors.push(`${pathStr}: value ${JSON.stringify(data)} not in enum`);
  }
  if (typeof data === "number") {
    if (schema.minimum !== undefined && data < schema.minimum)
      errors.push(`${pathStr}: ${data} < minimum ${schema.minimum}`);
    if (schema.maximum !== undefined && data > schema.maximum)
      errors.push(`${pathStr}: ${data} > maximum ${schema.maximum}`);
  }
  if (typeof data === "string" && schema.minLength !== undefined && data.length < schema.minLength) {
    errors.push(`${pathStr}: string shorter than minLength ${schema.minLength}`);
  }
  if (schema.type === "object" && typeOf(data) === "object") {
    for (const req of schema.required || []) {
      if (!(req in data)) errors.push(`${pathStr}: missing required property '${req}'`);
    }
    for (const [key, sub] of Object.entries(schema.properties || {})) {
      if (key in data) validateNode(data[key], sub, `${pathStr}/${key}`, errors);
    }
  }
  if (schema.type === "array" && Array.isArray(data) && schema.items) {
    data.forEach((item, i) => validateNode(item, schema.items, `${pathStr}[${i}]`, errors));
  }
}

function validate(data, schema) {
  const errors = [];
  validateNode(data, schema, "$", errors);
  return { valid: errors.length === 0, errors };
}

module.exports = { validate };
