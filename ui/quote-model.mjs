import { t as tr, localizedMap } from './i18n.mjs';
import { KINDS, parameterRows } from './model.mjs';

const COST_LABELS = localizedMap({
  GenerateBase:'模型生成', GenerateWithTexture:'模型生成（含贴图）', GenerateQuad:'四边形拓扑',
  GenerateGenerateParts:'分件生成', GenerateSmartPoly:'Smart Poly', GenerateTextureQualityDetailed:'4K 贴图',
  GenerateTextureQualityExtreme:'8K 贴图', GenerateGeometryQualityDetailed:'精细几何',
  GenerateBaseNexus:'Smart Mesh', GenerateBaseNexusV2:'Smart Mesh P2', PBR:'PBR 材质',
  Retopology_Quad:'四边形重拓扑', Retopology_Triangle:'三角形重拓扑', Retopology_SmartPoly:'Smart Poly',
  TextureGeneration:'贴图生成', TextureQualityDetailed:'4K 贴图', TextureQualityExtreme:'8K 贴图', TextureStyle:'风格参考',
  Upscaler:'贴图放大', UpscalerExtreme:'贴图放大至 8K', MagicBrush:'贴图编辑预览', ImageUpscale4K:'图片放大至 4K',
  QuickCap:'快速封口', AICompletion:'AI 补全', UvEditRetry:'重新生成 UV', UvEditGenerate:'生成 UV', Segmentation:'模型分件'
});
const WARNINGS = localizedMap({
  "Uses a reviewed frontend version; automatic detection of newer webpage releases is unavailable. Final server billing may differ.":'费用为预估，最终以服务扣费为准。',
  "This operation's billing formula has not been verified.":'此功能的费用暂无法确认。',
  'Team workspace billing is not yet verified.':'团队空间费用暂无法确认。',
  'Part-generation campaign eligibility has not been verified; base credits are available only.':'分件生成优惠资格未确认，仅提供基础费用。',
  'Segmentation campaign eligibility has not been verified; base credits are available only.':'分件优惠资格未确认，仅提供基础费用。'
});
export function quoteCard(quote, now = Date.now()) {
  const known = quote.status !== 'unknown' && Number.isFinite(quote.estimated_credits) && quote.estimated_credits >= 0;
  const expiry = Date.parse(quote.estimate_expires_at);
  const expired = known && Number.isFinite(expiry) && expiry <= now;
  const rows = [];
  if (Number.isFinite(quote.request_count)) rows.push([tr("请求数量"), String(quote.request_count)]);
  if (Number.isFinite(quote.per_request_credits)) rows.push([tr("每次基础费用"), tr("{0} 积分", { "0": quote.per_request_credits })]);
  if (Number.isFinite(quote.base_credits)) rows.push([tr("基础费用合计"), tr("{0} 积分", { "0": quote.base_credits })]);
  if (Number.isFinite(quote.discount_multiplier) && quote.discount_multiplier !== 1) rows.push([tr("折扣系数"), `× ${quote.discount_multiplier}`]);
  if (Number.isFinite(quote.free_requests_applied) && quote.free_requests_applied > 0) rows.push([tr("免费次数"), String(quote.free_requests_applied)]);
  const settings = { ...quote.effective_settings };
  // Quantity belongs to billing, rather than the model configuration.
  delete settings.request_count;
  const parameters = parameterRows({ effective_settings: settings });
  for (const [key, label] of [['generate_parts',tr("分件生成")],['action',tr("UV 操作")],['resolution',tr("图片分辨率")]]) {
    if (settings[key] !== undefined) parameters.push([label, typeof settings[key] === 'boolean' ? settings[key] ? tr("开启") : tr("关闭") : String(settings[key])]);
  }
  return {
    title: tr("{0} · 积分报价", { "0": KINDS[quote.kind] ?? quote.kind ?? tr("操作") }),
    amount: known ? String(quote.estimated_credits) : tr("待确认"), known, expired,
    status: expired ? tr("报价已过期") : known ? quote.status === 'free' ? tr("不消耗积分") : tr("费用预估") : tr("费用待确认"),
    caption: expired ? tr("上次预计费用") : tr("预计费用"),
    notice: expired ? tr("报价已过期，请重新查询费用。") : !known ? tr("当前无法确认费用，请重新报价或查看说明。") : '',
    expiry: Number.isFinite(expiry) ? quote.estimate_expires_at : null,
    breakdown: (quote.breakdown ?? []).map(item => [COST_LABELS[item.key] ?? item.key, Number.isFinite(item.credits) ? tr("{0} 积分", { "0": item.credits }) : tr("待确认")]),
    rows, parameters,
    warnings: [...new Set((quote.warnings ?? []).map(message => WARNINGS[message] ?? message))],
    submission: quote.paid_request_sent === false ? tr("仅查询报价 · 尚未提交任务") : ''
  };
}
