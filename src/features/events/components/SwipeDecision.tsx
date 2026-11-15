import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { swipeDirection } from '../api/swipe';

export default function SwipeDecision({enabled,canApprove,busy,onApprove,onSkip,children}:{enabled:boolean;canApprove:boolean;busy:boolean;onApprove:()=>void;onSkip:()=>void;children:ReactNode}) {
 const start=useRef<{x:number;y:number;id:number}|null>(null);
 const [offset,setOffset]=useState(0);
 return <div className={enabled?'swipeSurface':''}
  onPointerDown={e=>{
   if(!enabled||busy||(e.pointerType==='mouse'&&e.button!==0)||(e.target as HTMLElement).closest('button,input,textarea,select,a,label,summary'))return;
   start.current={x:e.clientX,y:e.clientY,id:e.pointerId};e.currentTarget.setPointerCapture(e.pointerId);
  }}
  onPointerMove={e=>{if(start.current?.id===e.pointerId)setOffset(Math.max(-140,Math.min(140,e.clientX-start.current.x)));}}
  onPointerCancel={()=>{start.current=null;setOffset(0);}}
  onLostPointerCapture={()=>{start.current=null;setOffset(0);}}
  onPointerUp={e=>{
   const origin=start.current;start.current=null;setOffset(0);
   if(!origin||origin.id!==e.pointerId||busy)return;
   const decision=swipeDirection(e.clientX-origin.x,e.clientY-origin.y);
   if(decision==='approve'&&canApprove)onApprove();
   if(decision==='skip')onSkip();
  }}>
  {enabled&&<><div className="swipeGuide"><span>← Deny / skip</span><span>Approve →</span></div><p className="muted small">Swipe the card left to skip. Verify the details, then swipe right to approve. You can also use the buttons below.</p></>}
  <div className="swipeContent" style={enabled?{transform:`translateX(${offset*.25}px) rotate(${offset/70}deg)`}:undefined}>{children}</div>
  {enabled&&<p className={`swipeFeedback ${offset>0?'approve':'skip'}`} role="status">{offset>30?(canApprove?'Release after a full swipe to approve':'Check the verification box to approve'):offset< -30?'Release after a full swipe to skip; event stays visible':' '}</p>}
 </div>;
}
