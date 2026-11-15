import {useState} from 'react';
import type {DirectorySender} from '../api/admin';

export default function SavedSenderPicker({directory,approved,selected,onChange}:{directory:DirectorySender[];approved:string[];selected:string[];onChange:(emails:string[])=>void}){
 const [search,setSearch]=useState('');
 const rows=directory.filter(s=>s.sender_email.includes(search.trim().toLowerCase()));
 const available=rows.filter(s=>!approved.includes(s.sender_email));
 function toggle(email:string){onChange(selected.includes(email)?selected.filter(value=>value!==email):[...selected,email]);}
 return <div className="senderPicker">
  <label>Search institution senders<input type="search" onKeyDown={e=>{if(e.key==='Enter')e.preventDefault();}} value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search saved email addresses…" /></label>
  <div className="senderPickerToolbar"><span role="status">{selected.length} selected</span><div><button type="button" className="senderPickerAction" disabled={!available.length} onClick={()=>onChange([...new Set([...selected,...available.map(s=>s.sender_email)])])}>Select all shown</button><button type="button" className="senderPickerAction" disabled={!selected.length} onClick={()=>onChange([])}>Clear selection</button></div></div>
  <div className="savedSenderOptions" role="group" aria-label="Saved senders">
   {rows.map(sender=>{const isApproved=approved.includes(sender.sender_email);const checked=selected.includes(sender.sender_email);return <label key={sender.id} className={`senderChoice ${checked?'selected':''} ${isApproved?'alreadyApproved':''}`}>
    <input type="checkbox" aria-label={sender.sender_email} checked={checked||isApproved} disabled={isApproved} onChange={()=>toggle(sender.sender_email)}/>
    <span className="senderChoiceText"><strong>{sender.sender_email}</strong><small>{isApproved?'Already approved for this list':checked?'Selected for approval':'Select to approve for this list'}</small></span>
   </label>;})}
   {!rows.length&&<p className="muted small">No saved senders match. Add a new address instead.</p>}
  </div>
  <p className="muted small">Choose one or more addresses. Selections stay selected when you search.</p>
 </div>;
}
