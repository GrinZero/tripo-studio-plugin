import { t as tr, getLocale, setText } from './i18n.mjs';
import { quoteCard } from './quote-model.mjs';

export function mountQuote(root, quote, onStatus) {
  const section=document.createElement('section');section.className='quote-card';
  const heading=document.createElement('h2'), cost=document.createElement('div'), caption=document.createElement('span'), amount=document.createElement('strong'), unit=document.createElement('span');
  cost.className='quote-cost';setText(unit, () => tr("积分"));cost.append(caption,amount,unit);
  const notice=document.createElement('p');notice.className='quote-notice';notice.setAttribute('role','status');
  const submission=document.createElement('p');submission.className='quote-submission';
  section.append(heading,cost,notice,submission);
  const model=quoteCard(quote);
  setText(heading, () => model.title);setText(amount, () => model.amount);unit.hidden=!model.known;setText(submission, () => model.submission);
  function table(title, rows) {
    if (!rows.length) return;
    const block=document.createElement('section'), h=document.createElement('h3'), list=document.createElement('dl');
    setText(h, () => title);block.append(h,list);
    for (const [label,value] of rows) {
      const row=document.createElement('div'), term=document.createElement('dt'), detail=document.createElement('dd');
      setText(term, () => label);setText(detail, () => value);row.append(term,detail);list.append(row);
    }
    section.append(block);
  }
  table(tr("每次费用明细"),model.breakdown);table(tr("费用计算"),model.rows);table(tr("本次配置"),model.parameters);
  if(model.expiry) {
    const valid=document.createElement('p');valid.className='quote-validity';
    setText(valid, () => tr("报价有效期至 {0}", { "0": new Date(model.expiry).toLocaleString(getLocale(), {timeZoneName:'short'}) }));section.append(valid);
  }
  if(quote.server_billing_quote===false) {
    const billing=document.createElement('p');billing.className='quote-validity';setText(billing, () => tr("费用为预估，最终以服务扣费为准。"));section.append(billing);
  }
  const warnings=model.warnings.filter(message=>message!==tr("费用为预估，最终以服务扣费为准。"));
  if(warnings.length) {
    const details=document.createElement('details'), summary=document.createElement('summary'), list=document.createElement('ul');
    setText(summary, () => tr("报价说明"));details.append(summary,list);
    for(const message of warnings){const item=document.createElement('li');setText(item, () => message);list.append(item);}
    section.append(details);
  }
  root.append(section);
  function update(){const state=quoteCard(quote);setText(caption, () => state.caption);setText(notice, () => state.notice);onStatus(state.status);}
  update();
  const timer=model.known && model.expiry && !model.expired ? setInterval(update,1000) : null;
  return {dispose(){clearInterval(timer);}};
}
