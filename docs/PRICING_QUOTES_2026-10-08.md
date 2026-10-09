# Operation credit estimates — 0.2.2

`tripo_quote_operation` estimates the credit cost before staging/submission. It does not upload files, audit content, generate anything, or send a paid operation. Staging tools now save and return `task.cost_estimate`; quoting `task_id` uses its actual frozen payload/settings, including batch counts, UV action and texture style. Quotes do not alter the task or its request hash.

Example matching the star-maker multiview configuration:

```json
{
  "kind": "model.generate",
  "input": {
    "tier": "high_detail", "mode": "multiview", "face_limit": 60000,
    "geometry_quality": "standard", "texture": true,
    "texture_quality": "detailed", "delight": true, "pbr": true,
    "quad": false
  }
}
```

The current reviewed formula yields **40 credits**: textured generation 25 + 4K 10 + PBR 5. `face_limit` must be the real intended budget; it validates effective settings rather than setting a universal asset budget. The plugin's omitted H3.1 geometry setting defaults to `detailed`, which adds 15 credits. Explicit `standard` is necessary for the example above.

For frozen parameters use `{ "task_id": "<plugin task UUID>", "refresh": true }` instead of kind/input. Refresh checks the reviewed public source hashes again and reads required account discounts/trials afresh. An estimate expires after five minutes; requery before a delayed paid submission. The tool never submits even when called against a previously staged task; `input.submit:true` is rejected.

## What Network inspection found

Actual browser clicks on the production Studio page showed the price changing with settings. Toggling four Nano Banana images from 4K to 1K changed the crossed-out base price from 80 to 40; the net price remained 0 because this account has remaining free image quota. No dedicated operation quotation call was observed during this toggle. The membership purchase endpoint `/v2/studio/wm-billing/prices/list` describes subscription money prices, not operation credit prices.

The production page initializes `algorithmConfig` from a static config in its public hashed JavaScript bundle. Its official generation helper and UI compute the display price locally. Account-specific adjustments come from read-only calls:

- `GET /v2/studio/user/profile/payment`: membership and wallet.
- `GET /v2/studio/marketing/detail?locale=zh`: image and ultra-texture trials.
- `POST /v2/studio/operation/quota`: Smart Mesh P2 and Smart UV remaining quota. POST here is a quota lookup, not a paid submission.

The reviewed public configuration is [BOQlA7aJ.js](https://tripo-webapp-assets.tripo3d.ai/studio-prod/_nuxt/BOQlA7aJ.js); the helper is [D2TK3lHS.js](https://tripo-webapp-assets.tripo3d.ai/studio-prod/_nuxt/D2TK3lHS.js), and the UI formulas are [d0-kdlow.js](https://tripo-webapp-assets.tripo3d.ai/studio-prod/_nuxt/d0-kdlow.js). The plugin fetches these exact sources, verifies all three SHA-256 hashes against `src/studio/pricing-contract.mjs`, then reads strict numeric literals. It never evaluates remote JavaScript. Fetch results are cached for five minutes within the process; a failed refresh cannot fall back to cached prices.

## Accuracy and coverage

The response explicitly says `pricing_type:reviewed_frontend_estimate` and `server_billing_quote:false`. It includes the review time, seven-day review deadline, fetch time, URLs/hashes, base credits, component breakdown, effective cost settings, per-input count, discount multiplier and free requests applied. It does not claim to reserve a price or free quota. Concurrent work can consume quota after a quote.

The HTML entry returns 403 to normal headless fetches, so automatic detection of a newer frontend release is unavailable. The pinned sources can remain available after a new release; successful hash verification does **not** prove they are the latest pricing. The version/date warning is always returned. After the review deadline the plugin returns unknown until its contract is reviewed and updated. The `refresh` argument does not extend that deadline or discover a new frontend version.

Verified formulas cover H3.1/legacy high-detail generation, P1/P2, independent-image batches, image generation with resolution/discount/free counts, remesh, texture generation/style, texture upscale, PBR, Magic Brush preview, existing-image 4K upscale, AI completion/Quick Cap and UV generate/retry. P2 1/2/4 budget variants cost once per input, not once per variant. Model multiview also counts as one input, distinct from a batch of independent images. Eligible model-generation 8K trials waive one batch input, rather than multiplying by every remaining trial count.

Unverified rigging/animation/motion formulas, image multiview/regeneration/split and texture-edit apply return `estimated_credits:null`. Segmentation and part-generation campaign eligibility is unverified, so their base cost is shown with unknown net cost. Team workspace image billing returns unknown. Missing account/quota responses also return unknown net cost, preserving any verified base cost. `null` never means free. Local operations, owned-model export, import and UV apply use the existing free-operation contract and do not require remote pricing lookups.

A price estimate does not replace operation preflight, subscription access checks, content audit or output validation. No actual paid deduction was performed to validate these formulas.

## Verification

The real bundled MCP returned version 0.2.2 and 54 tools. Live quote results matched the observed page:

| Settings | Base | Estimated net |
| --- | ---: | ---: |
| H3.1, standard geometry, 4K, PBR | 40 | 40 |
| H3.1, standard geometry, 8K, PBR | 50 | 50 |
| P2, 1 variant | 100 | 100 |
| P2, 4 variants | 100 | 100 |
| Nano Banana, 4 images, 4K | 80 | 0 (4 free images applied) |
| Triangle remesh, Smart Poly off | 5 | 5 |
| Owned model export | 0 | 0 |
| Unverified AI motion | unknown | unknown |

An image request was staged only, its cost estimate persisted/read back and requoted from frozen parameters, then canceled. No paid request was sent. The wallet remained **24,420 credits** throughout verification.

`npm test`: 63 passing, 0 failures/skips. Includes the pricing rules, unknown/failure/expiry paths, one bounded retry for transient public-source reads, read-only gateway constraints, bundled MCP tool/schema behavior, existing Blender/export regression and durable task lifecycle. An initial installed-process check hit a transient public-source fetch error and correctly returned unknown; subsequent checks passed, and the bounded read retry was added and tested.

Local raw evidence: `.local/verification/pricing/live-matrix.json`, `network-toggle.json`, `p2-one.png`, and `image-four-4k.png`. These contain no authorization headers or signed model download URLs. Public source URLs/hashes and selected verification conclusions are retained in this document; raw evidence is local only.
