import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import ts from "typescript";
import {
  TemplateFieldDescriptorSchema,
  normalizeTemplateId,
  type TemplateFieldDescriptor,
} from "@mashedgames/shared";
import { engineTemplatesRoot } from "@/lib/template-library-root";

// ---------------------------------------------------------------------------
// Reads a template's `fields: TemplateFieldDescriptor[]` straight out of its
// manifest.ts source via the TypeScript compiler API (AST only — the file is
// never executed/imported). This intentionally avoids importing
// `@mashedgames/templates`, which transitively pulls in Phaser scene code
// that has no place running inside the Next.js server (see "Separation of
// concerns" law in .cursorrules).
// ---------------------------------------------------------------------------

const KNOWN_ENUM_OBJECTS = new Set(["TEMPLATE_FIELD_TYPE"]);

function evaluateExpression(node: ts.Expression): unknown {
  if (ts.isStringLiteralLike(node)) {
    return node.text;
  }
  if (ts.isNumericLiteral(node)) {
    return Number(node.text);
  }
  if (node.kind === ts.SyntaxKind.TrueKeyword) {
    return true;
  }
  if (node.kind === ts.SyntaxKind.FalseKeyword) {
    return false;
  }
  if (
    ts.isPrefixUnaryExpression(node) &&
    node.operator === ts.SyntaxKind.MinusToken
  ) {
    const operand = evaluateExpression(node.operand);
    return typeof operand === "number" ? -operand : undefined;
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.map(evaluateExpression);
  }
  if (ts.isObjectLiteralExpression(node)) {
    const result: Record<string, unknown> = {};
    for (const property of node.properties) {
      if (!ts.isPropertyAssignment(property)) {
        continue;
      }
      const key = ts.isIdentifier(property.name)
        ? property.name.text
        : ts.isStringLiteralLike(property.name)
          ? property.name.text
          : null;
      if (!key) {
        continue;
      }
      result[key] = evaluateExpression(property.initializer);
    }
    return result;
  }
  if (
    ts.isPropertyAccessExpression(node) &&
    ts.isIdentifier(node.expression) &&
    KNOWN_ENUM_OBJECTS.has(node.expression.text)
  ) {
    // Maps TEMPLATE_FIELD_TYPE.STYLED_TEXT -> "styled-text", etc. — mirrors
    // the runtime values declared in template-field-schema.ts.
    return node.name.text.toLowerCase().replace(/_/g, "-");
  }
  return undefined;
}

/** Finds the manifest's own top-level object literal (has a `templateId` property). */
function findManifestObjectLiteral(
  sourceFile: ts.SourceFile,
): ts.ObjectLiteralExpression | null {
  let found: ts.ObjectLiteralExpression | null = null;

  const visit = (node: ts.Node) => {
    if (found) {
      return;
    }
    if (
      ts.isObjectLiteralExpression(node) &&
      node.properties.some(
        (p) =>
          ts.isPropertyAssignment(p) &&
          ts.isIdentifier(p.name) &&
          p.name.text === "templateId",
      )
    ) {
      found = node;
      return;
    }
    ts.forEachChild(node, visit);
  };

  visit(sourceFile);
  return found;
}

function readManifestFieldsFromSource(source: string): TemplateFieldDescriptor[] {
  const sourceFile = ts.createSourceFile(
    "manifest.ts",
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  const manifestLiteral = findManifestObjectLiteral(sourceFile);
  if (!manifestLiteral) {
    return [];
  }

  const fieldsProperty = manifestLiteral.properties.find(
    (p): p is ts.PropertyAssignment =>
      ts.isPropertyAssignment(p) &&
      ts.isIdentifier(p.name) &&
      p.name.text === "fields",
  );
  if (!fieldsProperty) {
    return [];
  }

  const rawFields = evaluateExpression(fieldsProperty.initializer);
  const parsed = TemplateFieldDescriptorSchema.array().safeParse(rawFields);
  if (!parsed.success) {
    if (process.env.NODE_ENV !== "production") {
      console.warn(
        "[template-fields] Failed to parse manifest `fields` array:",
        parsed.error.message,
      );
    }
    return [];
  }
  return parsed.data;
}

/**
 * Reads the active template's dynamic field descriptors from its manifest.ts
 * (`fields: TemplateFieldDescriptor[]`). Returns an empty array for
 * zero-state templates or when manifest.ts is missing/unparsable.
 */
export function readTemplateFields(templateId: string): TemplateFieldDescriptor[] {
  const resolvedTemplateId = normalizeTemplateId(templateId);
  const manifestPath = path.join(
    engineTemplatesRoot,
    resolvedTemplateId,
    "manifest.ts",
  );
  if (!existsSync(manifestPath)) {
    return [];
  }

  try {
    const source = readFileSync(manifestPath, "utf8");
    return readManifestFieldsFromSource(source);
  } catch {
    return [];
  }
}
