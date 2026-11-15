export type HighlightPart = { text: string; highlighted: boolean };

// Only saved extraction quotations count as evidence; normalized values are not citations.
export function evidenceSnippets(evidence: unknown): string[] {
 const snippets=new Set<string>();
 function visit(value: unknown){
  if(!value||typeof value!=='object')return;
  if(Array.isArray(value)){value.forEach(visit);return;}
  const record=value as Record<string,unknown>;
  if(record.extraction&&typeof record.extraction==='object'){
   const extraction=record.extraction as Record<string,unknown>;
   for(const key of ['text','timeText'])if(typeof extraction[key]==='string'&&extraction[key].trim())snippets.add(extraction[key].trim());
  }
  Object.values(record).forEach(visit);
 }
 if(typeof evidence==='string'&&evidence.trim())snippets.add(evidence.trim());else visit(evidence);
 return [...snippets];
}

export function highlightEvidence(text: string, snippets: string[]): HighlightPart[] {
 const ranges:{start:number;end:number}[]=[];
 for(const snippet of snippets){
  const pattern=snippet.trim().split(/\s+/).map(word=>word.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('\\s+');
  if(!pattern)continue;
  for(const match of text.matchAll(new RegExp(pattern,'giu')))ranges.push({start:match.index!,end:match.index!+match[0].length});
 }
 ranges.sort((a,b)=>a.start-b.start||b.end-a.end);
 const merged:typeof ranges=[];
 for(const range of ranges){const last=merged[merged.length-1];if(last&&range.start<=last.end)last.end=Math.max(last.end,range.end);else merged.push({...range});}
 const parts:HighlightPart[]=[];let offset=0;
 for(const range of merged){if(offset<range.start)parts.push({text:text.slice(offset,range.start),highlighted:false});parts.push({text:text.slice(range.start,range.end),highlighted:true});offset=range.end;}
 if(offset<text.length)parts.push({text:text.slice(offset),highlighted:false});
 return parts;
}

function record(value:unknown):Record<string,unknown>{
 if(typeof value==='string'){try{return record(JSON.parse(value));}catch{return {text:value};}}
 return value&&typeof value==='object'&&!Array.isArray(value)?value as Record<string,unknown>:{};
}
function firstText(...values:unknown[]){return values.find((v):v is string=>typeof v==='string'&&!!v.trim())??'';}
function address(value:unknown):string{
 if(typeof value==='string')return value;
 if(Array.isArray(value))return value.map(address).filter(Boolean).join(', ');
 const item=record(value);const email=firstText(item.email,item.address);
 return item.name&&email?`${item.name} <${email}>`:email;
}
export function originalEmail(value:unknown){
 const post=record(value);const raw=record(post.raw_email);const email=raw.data?record(raw.data):raw;
 const text=firstText(email.text,email.body_text,email.text_body,raw.text);
 const html=firstText(email.html,email.body_html,email.html_body,raw.html);
 let body=text;
 if(!body&&html){
  const document=new DOMParser().parseFromString(html,'text/html');
  document.querySelectorAll('script,style,head,template,noscript').forEach(node=>node.remove());
  document.querySelectorAll('br,p,div,li,tr,h1,h2,h3').forEach(node=>node.append('\n'));
  body=document.body.textContent??'';
 }
 return {subject:firstText(email.subject,post.subject,post.title)||'Original email',sender:address(email.from)||address(post.sender)||'Unknown sender',body,fromHtml:!text&&!!html};
}
