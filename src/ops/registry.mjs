import { imageOperations } from "./imagegen.mjs";
import { modelOperations } from "./modelgen.mjs";
import { postprocessOperations } from "./postops.mjs";
import { studioExtraOperations } from "./studio-extras.mjs";
import { localEditingOperations } from "./local-editing.mjs";
import { TripoError } from "../errors.mjs";

// The single source of truth for every paid/free Studio operation. Standalone
// MCP tools, workflows and the workbench all dispatch through this registry —
// one schema, one validation path, one durable lifecycle.
export const OPERATIONS = {
  ...imageOperations,
  ...modelOperations,
  ...postprocessOperations,
  ...studioExtraOperations,
  ...localEditingOperations
};

export function getOperation(kind) {
  const operation = OPERATIONS[kind];
  if (!operation) {
    throw new TripoError("UNSUPPORTED_CAPABILITY", `Unknown operation kind: ${kind}`, { stage: "operation_registry" });
  }
  return operation;
}

export function operationCatalog() {
  return Object.entries(OPERATIONS).map(([kind, operation]) => ({
    category: operation.category,
    consumes_credits: operation.consumesCredits,
    description: operation.description,
    kind,
    title: operation.title
  }));
}
