import { z } from 'zod';
import { TripoError } from '../errors.mjs';
import { hashObject } from '../util/misc.mjs';

export const characterName = z.string().trim().min(1).max(80).refine(s => !/[\u0000-\u001f\u007f]/.test(s), 'Character name must be a readable single line.');
export const taskContextShape = {
  character_name: characterName.optional().describe('AI: when creating work for a character, always supply its concise canonical name from user context (e.g. 派蒙). Reuse that name across images, modeling, textures, rigging and exports. Local character metadata for asset-library grouping; never sent to Studio. Omit when no single character is known.'),
  parent_task_id: z.string().uuid().optional().describe('Source plugin task id. Follow-up tasks inherit its character group unless character_name explicitly overrides it.')
};
export const UNGROUPED = 'ungrouped';
export const normalizedCharacter = name => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('en-US');
export function characterGroup(name, account, assignedBy = 'explicit', sourceTaskId) {
  name = characterName.parse(name.normalize('NFKC').replace(/\s+/g, ' '));
  return { id: `char_${hashObject({ name: normalizedCharacter(name), account }).slice(0,24)}`, name, assigned_by: assignedBy, ...(sourceTaskId ? { source_task_id:sourceTaskId } : {}) };
}

// Only explicit labeled names are inferred; descriptions, UUID filenames and
// mixed-character prompts are insufficient evidence for identity.
export function labeledCharacter(input) {
  for (const text of [input.prompt, input.name]) {
    if (typeof text !== 'string') continue;
    const match = text.match(/(?:^|\n)\s*(?:角色|角色名|character(?: name)?)\s*[:：]\s*([^\n,，。;；:：]{1,80})(?=$|[\n,，。;；:：])/i);
    const name = match?.[1]?.trim();
    if (name && !/[、/&+＋]/.test(name) && characterName.safeParse(name).success) return name;
  }
  return null;
}

function references(input) {
  const refs = new Map();
  const add = (kind,value) => { if (typeof value === 'string' && value) refs.set(`${kind}:${value}`,true); };
  const walk = obj => {
    if (!obj || typeof obj !== 'object') return;
    for (const [key,value] of Object.entries(obj)) {
      if (['project_id','asset_id','motion_asset_id','candidate_operator_id'].includes(key)) add(key,value);
      else if (key.endsWith('_path')) add('path',value);
      else if (key === 'image_paths' && Array.isArray(value)) value.forEach(v=>add('path',v));
      else if (typeof value === 'object') walk(value);
    }
  };
  walk(input); return refs;
}
function outputReferences(record) {
  const refs = references({ ...(record.remote ?? {}), ...(record.result ?? {}) });
  for (const ids of [record.remote?.project_ids,record.result?.project_ids]) for (const id of ids ?? []) refs.set(`project_id:${id}`,true);
  for (const file of record.downloads ?? []) {
    refs.set(`path:${file.path}`,true);
    if (file.blender_path) refs.set(`path:${file.blender_path}`,true);
  }
  return refs;
}

export async function resolveCharacterGroup(store, input, account, {name, parentTaskId} = {}) {
  let parent;
  if (parentTaskId) {
    parent = await store.get(parentTaskId);
    if (account !== 'local' && parent.account_fingerprint !== 'local' && parent.account_fingerprint !== account) throw new TripoError('PLAN_MISMATCH','Source task belongs to another Studio account.',{stage:'task_group'});
  }
  const explicit = name === undefined ? null : characterGroup(name,account);
  if (explicit && parent) return {group:parent.character_group && normalizedCharacter(parent.character_group.name) === normalizedCharacter(explicit.name) ? {...parent.character_group,assigned_by:'explicit',source_task_id:parent.task_id} : explicit,parentTaskId};
  if (parent?.character_group) return { group:{...parent.character_group,assigned_by:'inherited',source_task_id:parent.task_id},parentTaskId };
  if (parent) return {group:null,parentTaskId};
  const refs = references(input);
  if (refs.size) {
    const matches = new Map();
    for (const record of await store.list({limit:5000})) {
      if (!record.character_group || (account !== 'local' && !['local',account].includes(record.account_fingerprint))) continue;
      if (explicit && normalizedCharacter(record.character_group.name) !== normalizedCharacter(explicit.name)) continue;
      if (![...outputReferences(record).keys()].some(ref=>refs.has(ref))) continue;
      if (!matches.has(record.character_group.id)) matches.set(record.character_group.id,record);
    }
    if (matches.size === 1) {
      const source = [...matches.values()][0];
      return { group:{...source.character_group,assigned_by:explicit ? 'explicit' : 'inherited',source_task_id:source.task_id},parentTaskId:parentTaskId ?? source.task_id };
    }
    if (matches.size > 1 && !explicit) return {group:null,parentTaskId,warning:'Sources refer to multiple character groups. Supply character_name to choose the intended character.'};
  }
  if (explicit) return {group:explicit,parentTaskId};
  const inferred = labeledCharacter(input);
  return {group:inferred ? characterGroup(inferred,account,'inferred') : null,parentTaskId};
}

export function summarizeGroups(records) {
  const groups = new Map();
  for (const task of records) {
    const group = task.character_group, id = group?.id ?? UNGROUPED;
    if (!groups.has(id)) groups.set(id,{id,name:group?.name ?? '未分组',total:0,active:0,statuses:{},latest_at:task.created_at});
    const summary = groups.get(id); summary.total++;
    summary.statuses[task.status] = (summary.statuses[task.status] ?? 0)+1;
    if (['dispatching','queued','running','waiting_for_auth'].includes(task.status)) summary.active++;
  }
  return [...groups.values()];
}
