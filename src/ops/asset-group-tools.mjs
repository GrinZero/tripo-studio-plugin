import { z } from 'zod';
import { characterName } from './task-groups.mjs';
import { ok } from '../mcp/result.mjs';

const identifier=z.string().regex(/^[^\s\u0000-\u001f\u007f]{1,256}$/);
const groupId=z.string().min(1).max(80).describe('Exact group id returned by tripo_list_asset_groups or a create/rename result. Do not substitute the display name or a task/workflow id.');
const assets=z.array(z.union([
  z.object({project_id:identifier.describe('Owned model project_id returned by a model catalog or group member query; not a task_id.')}).strict(),
  z.object({asset_id:identifier.describe('Owned image asset_id returned by an image catalog or group member query; not an output index or local file path.')}).strict()
])).max(500).describe('Up to 500 selected assets. Each entry has exactly one key: {project_id} for a model or {asset_id} for an image. Both types may be mixed; duplicates count once. All entries are validated before this batch is saved.');
const groupName=characterName.describe('Readable group display name, 1–80 characters. Matching ignores NFKC variants, repeated whitespace and letter case. Use the user’s intended name; a manual group need not be a character.');
const paging={
  offset:z.number().int().min(0).max(1e6).default(0).describe('Start at 0; pass the previous result’s next_offset to continue until it is null.'),
  limit:z.number().int().min(1).max(200).default(100).describe('Maximum entries returned on this page, 1–200. Counts describe the complete matching collection, not only this page.')
};
const search={
  search:z.string().max(1000).default('').describe('Case-insensitive substring filter. Empty string includes all entries in the selected scope.'),
  refresh:z.boolean().default(false).describe('Fetch current Studio catalogs instead of reusing the up-to-30-second catalog cache. Saved local membership and names are read on every query.')
};

// Use the same data-tool registration and AssetLibrary instance as the workbench.
// These tools preserve the active viewer and never submit Studio operations.
export function registerAssetGroupTools(tool,library) {
  tool('tripo_list_asset_groups',{
    annotations:{readOnlyHint:true},
    description:'Discover the groups shown in the Assets workbench when the user asks to organize assets, find a character’s models/images, or choose a destination group. Returns groups with id, name, model_count, image_count and total, plus pagination next_offset. Includes manual and automatic character groups, including empty groups by default. Use the returned id with tripo_list_group_assets, tripo_set_asset_group or tripo_rename_asset_group. Ungrouped assets are queried separately with tripo_list_group_assets(group_id:"ungrouped"). Scoped to the active Studio account; read-only and no credits.',
    inputSchema:{...paging,...search,include_empty:z.boolean().default(true).describe('Include groups with zero current catalog members. Set false when only populated workbench cards are wanted.')}
  },async input=>ok(await library.listGroups(input)));
  tool('tripo_list_group_assets',{
    annotations:{readOnlyHint:true},
    description:'Inspect or collect the members of one asset group before viewing, moving or removing them. Returns paged assets with model project_id or image asset_id, group metadata, matching total and next_offset; follow next_offset to collect every matching member. Defaults to models and images together. Use a discovered group id, or the literal "ungrouped" for assets with no membership. Empty groups return no assets. This reads asset membership, not task history; use tripo_get_task for recorded task provenance. Read-only and no credits.',
    inputSchema:{group_id:groupId.describe('Exact discovered group id, or the literal "ungrouped" to list loose assets.'),type:z.enum(['all','models','images']).default('all').describe('all includes both model and image members; models/images selects only that asset type.'),...paging,...search,sort:z.enum(['recent','name']).default('recent').describe('recent sorts newest first; name sorts model names or image prompts alphabetically.')}
  },async input=>{const result=await library.list(input);const {entries,...rest}=result;return ok({...rest,assets:entries});});
  tool('tripo_create_asset_group',{
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true},
    description:'Create an asset group when the user asks to group selected models/images or prepare a named collection. Pass name and optional assets; omit assets to create an empty group. If a group already has the same normalized name, reuse it and add the supplied members. Selected assets move out of their previous groups; they are not duplicated. Returns group.id, group.name and the unique assigned count. Populated groups appear as one preview card per asset type with a member count; empty groups remain queryable but have no root card. Saves local membership for the active account, shared with the workbench. No generation, Studio writes or credits.',
    inputSchema:{name:groupName,assets:assets.default([])}
  },async input=>ok(await library.createGroup(input)));
  tool('tripo_set_asset_group',{
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true},
    description:'Change the membership of selected existing assets when the user asks to add to a group, move between groups, or remove from a group. Pass an existing group_id to add/move; pass JSON null to remove membership, including an automatic character assignment. Removal keeps the assets and explicitly prevents automatic regrouping from their recorded task lineage. Each asset has one group. Supply 1–500 model/image references; every reference is validated before this batch is saved, and any invalid reference rejects the whole batch. Returns the destination group (null for removal) and unique assigned count. Create a missing destination with tripo_create_asset_group first. Changes local asset membership only; no task edits, deletion, Studio writes or credits.',
    inputSchema:{group_id:groupId.nullable().describe('Existing destination group id to add/move members, or JSON null to leave them ungrouped. The string "ungrouped" is read-only and is not a write destination.'),assets:assets.min(1)}
  },async input=>ok(await library.assign(input)));
  tool('tripo_rename_asset_group',{
    annotations:{readOnlyHint:false,destructiveHint:false,idempotentHint:true},
    description:'Rename the display name of an existing manual or automatic asset group when the user asks to change its name. Pass the discovered group_id and new name. Preserves the group id and all model/image memberships, updates both asset pages, and applies the name to later outputs linked to the same automatic group identity. Returns the updated group. A name used by another group returns GROUP_NAME_CONFLICT; renaming never merges groups. To merge, collect the source members with tripo_list_group_assets and move them with tripo_set_asset_group. Does not rename Studio assets or change task character_name/lineage. Local only; no credits.',
    inputSchema:{group_id:groupId,name:groupName}
  },async input=>ok(await library.renameGroup(input)));
}
