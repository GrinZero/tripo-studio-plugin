import { UNGROUPED } from './task-groups.mjs';

// Join only recorded outputs, never input projects/images or names. Newest
// output records win; an explicit move to ungrouped must not revive an old label.
export function assetCharacterIndex(records, account) {
  const index = new Map();
  for (const task of records) {
    if (task.account_fingerprint !== account || ['staged','canceled','failed','expired'].includes(task.status)) continue;
    const refs = new Set();
    const walk = value => {
      if (!value || typeof value !== 'object') return;
      for (const [key, item] of Object.entries(value)) {
        if (['project_id','asset_id'].includes(key) && typeof item === 'string') refs.add(`${key}:${item}`);
        else if (key === 'project_ids' && Array.isArray(item)) item.filter(id => typeof id === 'string').forEach(id => refs.add(`project_id:${id}`));
        else if (typeof item === 'object') walk(item);
      }
    };
    walk(task.remote); walk(task.result);
    for (const ref of refs) if (!index.has(ref)) index.set(ref, task.character_group ?? null);
  }
  return index;
}

export function assetCharacterGroups(index) {
  const groups = new Map([[UNGROUPED, {id:UNGROUPED,name:'未分组'}]]);
  for (const group of index.values()) if (group) groups.set(group.id, {id:group.id,name:group.name});
  return [...groups.values()];
}

// Remote pages are traversed until a filtered page plus one lookahead item is
// found. Offsets address matching assets, so sparse groups paginate correctly.
export async function characterAssetPage({ fetchPage, annotate, characterGroupId, offset = 0, limit = 20 }) {
  if (characterGroupId === undefined) {
    const page = await fetchPage(offset);
    return {...page,items:page.items.map(annotate)};
  }
  const matches = [];
  let cursor = 0, skipped = 0;
  for (;;) {
    const page = await fetchPage(cursor);
    for (const raw of page.items) {
      const asset = annotate(raw);
      if ((asset.character_group?.id ?? UNGROUPED) !== characterGroupId) continue;
      if (skipped++ < offset) continue;
      matches.push(asset);
      if (matches.length > limit) return {items:matches.slice(0,limit),next_offset:offset+limit,total:null};
    }
    if (page.next_offset === null || page.next_offset <= cursor || !page.items.length) return {items:matches,next_offset:null,total:null};
    cursor = page.next_offset;
  }
}
