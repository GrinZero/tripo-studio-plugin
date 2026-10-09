import { TripoError } from "../errors.mjs";
import { isRetargetRigType, isRigType } from "./animation-presets.mjs";

function asRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value : undefined;
}

function optionalBoolean(...values) {
  for (const value of values) if (typeof value === "boolean") return value;
  return null;
}

function optionalRigType(...values) {
  for (const value of values) if (isRigType(value)) return value;
  return null;
}

// Capability flags are read from project detail + operator metadata; every
// flag may be absent (null) — "unknown" is distinct from false.
export function projectCapabilities(projectId, detail) {
  const root = detail;
  const operator = asRecord(root.operator);
  const metadata = asRecord(operator?.metadata);
  const riggingOperator = asRecord(operator?.rigging);
  return {
    is_hd_textured: optionalBoolean(operator?.is_hd_textured, root.is_hd_textured, metadata?.is_hd_textured),
    is_multiple_mesh: optionalBoolean(operator?.is_multiple_mesh, root.is_multiple_mesh, metadata?.is_multiple_mesh),
    is_nexus_mesh: optionalBoolean(operator?.is_nexus_mesh, root.is_nexus_mesh, metadata?.is_nexus_mesh),
    is_owner: optionalBoolean(root.is_owner, operator?.is_owner),
    is_pbr: optionalBoolean(operator?.is_pbr, root.is_pbr, metadata?.is_pbr),
    is_quad: optionalBoolean(operator?.is_quad, root.is_quad, metadata?.is_quad),
    is_rigged: optionalBoolean(operator?.is_rigged, root.is_rigged, metadata?.is_rigged),
    is_segmented: optionalBoolean(operator?.is_segmented, root.is_segmented, metadata?.is_segmented),
    is_textured: optionalBoolean(operator?.is_textured, root.is_textured, metadata?.is_textured),
    is_ultra_textured: optionalBoolean(operator?.is_ultra_textured, root.is_ultra_textured, metadata?.is_ultra_textured),
    project_id: detail.id ?? projectId,
    remote_status: detail.status ?? null,
    rig_type: optionalRigType(riggingOperator?.type, operator?.rig_type, root.rig_type, metadata?.rig_type)
  };
}

export function assertProjectSupports(kind, capabilities, options = {}) {
  const remoteStatus = capabilities.remote_status?.trim().toLowerCase().replace(/[\s-]+/g, "_") ?? null;
  if (remoteStatus !== null && ["prepare", "preparing", "queued", "pending", "running", "processing", "generating", "in_progress", "uploading"].includes(remoteStatus)) {
    throw new TripoError("REMOTE_API_ERROR", "The Studio project already has remote work in progress. Wait for it to finish before staging another write.", {
      details: { remote_status: remoteStatus },
      safeToRetryPaidOperation: true,
      stage: "operation_stage"
    });
  }
  if (capabilities.is_owner === false) {
    throw new TripoError("REMOTE_API_ERROR", "The Studio project is not owned by the current account and cannot be modified.", {
      safeToRetryPaidOperation: true,
      stage: "operation_stage"
    });
  }
  if (kind === "segmentation" && capabilities.is_quad === true) {
    throw new TripoError("REMOTE_API_ERROR", "Studio does not support segmentation for Quad projects.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if ((kind === "segmentation" || kind === "remesh") && capabilities.is_rigged === true) {
    throw new TripoError("REMOTE_API_ERROR", `Studio does not support ${kind} for rigged projects.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if ((kind === "mesh_fill" || kind === "ai_completion") && capabilities.is_multiple_mesh === false) {
    throw new TripoError("REMOTE_API_ERROR", "Part completion requires a segmented/multi-mesh project.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if (kind === "remesh" && options.smartPoly === true && capabilities.is_nexus_mesh === true) {
    throw new TripoError("REMOTE_API_ERROR", "Smart Poly remesh is not supported for Nexus/Smart Mesh projects.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if (kind === "retexture_preview" || kind === "apply_retexture") {
    if (capabilities.is_textured === false) {
      throw new TripoError("REMOTE_API_ERROR", "Texture editing requires an already textured project.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
    }
    if (capabilities.is_ultra_textured === true) {
      throw new TripoError("REMOTE_API_ERROR", "Studio Magic Brush does not support an 8K/ultra-textured revision.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
    }
    if (capabilities.is_segmented === true) {
      throw new TripoError("REMOTE_API_ERROR", "Studio Magic Brush does not support a segmented revision.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
    }
  }
  if ((kind === "texture_upscale" || kind === "pbr") && capabilities.is_textured === false) {
    throw new TripoError("REMOTE_API_ERROR", `${kind} requires an already textured project.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if ((kind === "rigging" || kind === "animation_retarget") && capabilities.is_textured === false) {
    throw new TripoError("REMOTE_API_ERROR", `${kind} requires an already textured project.`, { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if (kind === "animation_retarget" && capabilities.is_rigged === false) {
    throw new TripoError("REMOTE_API_ERROR", "Animation retargeting requires an already rigged project.", { safeToRetryPaidOperation: true, stage: "operation_stage" });
  }
  if (kind === "animation_retarget" && options.rigType !== undefined && isRetargetRigType(capabilities.rig_type) && capabilities.rig_type !== options.rigType) {
    throw new TripoError("REMOTE_API_ERROR", "The requested rig type does not match the project's current rig.", {
      details: { project_rig_type: capabilities.rig_type, requested_rig_type: options.rigType },
      safeToRetryPaidOperation: true,
      stage: "operation_stage"
    });
  }
}
