// Rule 3: inputs come from the schema only.
//   enum    -> every value, in listed order
//   integer -> its minimum
//   string  -> "x"
// Interpretations (see README): several enums combine as a cartesian product
// in property order; optional properties are always filled; integer without
// minimum -> 0; nested objects recurse; any other type is omitted.

/** @returns {object[]} the inputs to try for one tool, in schema order */
export function generateInputs(inputSchema) {
  const values = valuesFor(inputSchema ?? { type: "object" });
  return values === OMIT ? [{}] : values;
}

const OMIT = Symbol("omit");

/** @returns {unknown[] | typeof OMIT} candidate values for one schema node */
function valuesFor(schema) {
  if (Array.isArray(schema.enum)) return [...schema.enum];
  switch (schema.type) {
    case "integer":
      return [Number.isInteger(schema.minimum) ? schema.minimum : 0];
    case "string":
      return ["x"];
    case "object":
      return objectValues(schema.properties ?? {});
    default:
      return OMIT;
  }
}

function objectValues(properties) {
  let combos = [{}];
  for (const [key, sub] of Object.entries(properties)) {
    const values = valuesFor(sub);
    if (values === OMIT) continue;
    const next = [];
    for (const combo of combos) {
      for (const v of values) next.push({ ...combo, [key]: v });
    }
    combos = next;
  }
  return combos;
}
