// Shared contract-fixture helpers: check a plain JSON fixture against the
// serializable form of a real Convex validator (validator.json), so fixtures
// and validators cannot drift apart unnoticed.
import { readFileSync } from "node:fs";
import { expect } from "vitest";

export function loadJsonFixture(name: string): Record<string, unknown> {
  return JSON.parse(
    readFileSync(new URL(`../fixtures/${name}`, import.meta.url), "utf8"),
  ) as Record<string, unknown>;
}

export type ValidatorJson = {
  type: string;
  value?: unknown;
  fieldType?: ValidatorJson;
  optional?: boolean;
};

export function assertMatchesValidator(
  schema: ValidatorJson,
  value: unknown,
  path: string,
): void {
  const at = (detail: string) => `${path}: ${detail}`;
  switch (schema.type) {
    case "any":
      return;
    case "string":
    case "id":
      expect(typeof value, at(`expected string, got ${typeof value}`)).toBe(
        "string",
      );
      return;
    case "number":
    case "float64":
    case "int64":
      expect(typeof value, at(`expected number, got ${typeof value}`)).toBe(
        "number",
      );
      return;
    case "boolean":
      expect(typeof value, at(`expected boolean, got ${typeof value}`)).toBe(
        "boolean",
      );
      return;
    case "null":
      expect(value, at("expected null")).toBeNull();
      return;
    case "literal":
      expect(value, at(`expected literal ${String(schema.value)}`)).toBe(
        schema.value,
      );
      return;
    case "array": {
      expect(Array.isArray(value), at("expected array")).toBe(true);
      for (const [index, item] of (value as unknown[]).entries()) {
        assertMatchesValidator(
          schema.value as ValidatorJson,
          item,
          `${path}[${String(index)}]`,
        );
      }
      return;
    }
    case "object": {
      expect(
        typeof value === "object" && value !== null && !Array.isArray(value),
        at("expected object"),
      ).toBe(true);
      const fields = schema.value as Record<
        string,
        { fieldType: ValidatorJson; optional: boolean }
      >;
      const record = value as Record<string, unknown>;
      for (const [key, field] of Object.entries(fields)) {
        if (!(key in record)) {
          expect(
            field.optional,
            at(`missing required field "${key}"`),
          ).toBe(true);
          continue;
        }
        assertMatchesValidator(field.fieldType, record[key], `${path}.${key}`);
      }
      for (const key of Object.keys(record)) {
        expect(
          key in fields,
          at(`unexpected field "${key}" not in the validator`),
        ).toBe(true);
      }
      return;
    }
    case "union": {
      const members = schema.value as ValidatorJson[];
      const matched = members.some((member) => {
        try {
          assertMatchesValidator(member, value, path);
          return true;
        } catch {
          return false;
        }
      });
      expect(matched, at("matched no union member")).toBe(true);
      return;
    }
    default:
      throw new Error(`unsupported validator kind "${schema.type}" at ${path}`);
  }
}
