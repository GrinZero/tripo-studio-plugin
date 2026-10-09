import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { JsonDocument } from './jsondoc.mjs';
import { FileLock } from './lock.mjs';
import { characterGroup, normalizedCharacter } from '../ops/task-groups.mjs';
import { TripoError } from '../errors.mjs';

export const assetKey = asset => asset.project_id ? `project_id:${asset.project_id}` : `asset_id:${asset.asset_id}`;

// Manual asset membership is independent of task inputs and is shared by all
// workbench/server processes. A null assignment explicitly leaves an asset loose.
export class AssetGroupStore {
  constructor(dataDir) {
    this.doc = new JsonDocument(path.join(dataDir,'asset-groups.json'));
    this.lock = new FileLock(path.join(dataDir,'locks'));
  }
  async read(account) {
    const state = await this.doc.read({accounts:{}});
    return state.accounts[account] ?? {groups:{},assignments:{}};
  }
  async assign(account, assets, {name, group, knownGroups=[]} = {}) {
    return this.lock.withLock('asset-groups', async () => {
      const state = await this.doc.read({accounts:{}});
      const current = state.accounts[account] ?? {groups:{},assignments:{}};
      const known = new Map(knownGroups.map(g=>[g.id,g]));
      for (const saved of Object.values(current.groups)) known.set(saved.id,saved);
      let target = group ? known.get(group.id) ?? group : null;
      if (name !== undefined) {
        const named = characterGroup(name,account,'manual');
        target = [...known.values()].find(g=>normalizedCharacter(g.name)===normalizedCharacter(named.name))
          ?? {...named,id:`group_${randomUUID()}`};
      }
      if (target?.id === 'ungrouped') throw new TripoError('INVALID_INPUT','Choose a named group.');
      if (target) current.groups[target.id] = {...target,assigned_by:'manual'};
      for (const asset of assets) current.assignments[assetKey(asset)] = target?.id ?? null;
      state.accounts[account] = current;
      await this.doc.write(state);
      return target;
    });
  }
  async rename(account, group, name, knownGroups=[]) {
    const normalizedName = characterGroup(name,account,'manual').name;
    return this.lock.withLock('asset-groups', async () => {
      const state = await this.doc.read({accounts:{}});
      const current = state.accounts[account] ?? {groups:{},assignments:{}};
      const known = new Map(knownGroups.map(g=>[g.id,g]));
      for (const saved of Object.values(current.groups)) known.set(saved.id,saved);
      if ([...known.values()].some(g=>g.id!==group.id && normalizedCharacter(g.name)===normalizedCharacter(normalizedName))) {
        throw new TripoError('GROUP_NAME_CONFLICT','Another asset group already uses this name. Choose a different name, or move assets into that existing group.');
      }
      const renamed = {...(current.groups[group.id] ?? group),name:normalizedName,assigned_by:'manual'};
      current.groups[group.id] = renamed;
      state.accounts[account] = current;
      await this.doc.write(state);
      return renamed;
    });
  }
}

export function applyAssetAssignments(index, saved) {
  // A saved name also overrides automatic membership, including future task
  // outputs with the same identity. Task metadata itself stays unchanged.
  const result = new Map([...index].map(([key,group])=>[key,group ? saved.groups[group.id] ?? group : null]));
  for (const [key,id] of Object.entries(saved.assignments)) result.set(key,id === null ? null : saved.groups[id] ?? null);
  return result;
}
