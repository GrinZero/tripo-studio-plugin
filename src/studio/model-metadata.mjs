const GENERATION_OPERATIONS = ['text_to_model', 'image_to_model', 'image_prompt_to_model', 'multiview_to_model', 'batch_image_to_model'];
const versionString = value => typeof value === 'string' && value.length > 0 && value.length <= 128 && value !== 'default' ? value : null;

// The latest operator may describe texturing, rigging, or another edit. Its
// model_version belongs to that operation; retained generation input is the
// authority for the geometry's original model version.
export function modelGenerationMetadata(asset) {
  const operator = asset.operator;
  let version = null;
  if (asset.type !== 'upload') {
    for (const key of GENERATION_OPERATIONS) {
      version = versionString(operator?.[key]?.model_version);
      if (version) break;
    }
    if (!version && (!operator?.type || GENERATION_OPERATIONS.includes(operator.type))) {
      version = versionString(operator?.model_version);
    }
  }
  const nexus = typeof operator?.is_nexus_mesh === 'boolean' ? operator.is_nexus_mesh :
    typeof asset.is_nexus_mesh === 'boolean' ? asset.is_nexus_mesh : null;
  return {model_version:version,is_nexus_mesh:version?.startsWith('Nexus-') ? true : nexus};
}
