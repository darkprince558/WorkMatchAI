import type { JsonSchema } from './schemas';

export interface OpenAiTextFormat {
  type: 'json_schema';
  name: string;
  strict: true;
  schema: JsonSchema;
}

export function toOpenAiTextFormat(name: string, schema: JsonSchema): OpenAiTextFormat {
  return {
    type: 'json_schema',
    name: sanitizeSchemaName(name),
    strict: true,
    schema: toStrictOpenAiSchema(schema),
  };
}

export function toStrictOpenAiSchema(schema: JsonSchema): JsonSchema {
  if (schema.anyOf?.length) {
    return {
      ...withoutUndefined(schema),
      anyOf: schema.anyOf.map((item) => toStrictOpenAiSchema(item)),
    };
  }

  if (schema.type === 'object') {
    const properties = schema.properties ?? {};
    const originallyRequired = new Set(schema.required ?? []);
    const strictProperties = Object.fromEntries(
      Object.entries(properties).map(([key, value]) => {
        const strictValue = toStrictOpenAiSchema(value);
        return [key, originallyRequired.has(key) ? strictValue : nullableSchema(strictValue)];
      })
    );

    return {
      ...withoutUndefined(schema),
      type: 'object',
      additionalProperties: false,
      properties: strictProperties,
      required: Object.keys(properties),
    };
  }

  if (schema.type === 'array') {
    return {
      ...withoutUndefined(schema),
      items: schema.items ? toStrictOpenAiSchema(schema.items) : {},
    };
  }

  return withoutUndefined(schema);
}

function nullableSchema(schema: JsonSchema): JsonSchema {
  if (schema.type === 'null') return schema;
  if (Array.isArray(schema.type) && schema.type.includes('null')) return schema;

  return {
    anyOf: [schema, { type: 'null' }],
  };
}

function sanitizeSchemaName(value: string) {
  const sanitized = value.replace(/[^a-zA-Z0-9_-]+/g, '_').slice(0, 64);
  return sanitized || 'workmatch_schema';
}

function withoutUndefined(schema: JsonSchema): JsonSchema {
  return Object.fromEntries(Object.entries(schema).filter(([, value]) => value !== undefined)) as JsonSchema;
}
