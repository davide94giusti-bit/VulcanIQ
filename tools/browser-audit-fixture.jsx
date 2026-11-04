// Local/CI browser fixture only; never imported by an application entry point.
import React, { useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import useDialogFocusTrap from '../src/hooks/useDialogFocusTrap.js';
import useLatestQuery from '../src/hooks/useLatestQuery.js';
import { FastRequestModal,BookingCodeModal } from '../src/app/siteShared.jsx';
import ReviewsPage from '../src/features/reviews/ReviewsPage.jsx';
import NotificationsPage from '../src/features/notifications/NotificationsPage.jsx';
import '../src/styles.css';

function Dialog({ close, nested = false }) {
  const ref = useRef(null); const [child, setChild] = useState(false);
  useDialogFocusTrap(true, ref, close);
  return <section ref={ref} role="dialog" aria-label={nested ? 'Child' : 'Parent'} tabIndex={-1}>
    <button onClick={close}>Close {nested ? 'child' : 'parent'}</button>
    {!nested && <button onClick={() => setChild(true)}>Open child</button>}
    <input aria-label={nested ? 'Child field' : 'Parent field'} />
    {child && <Dialog nested close={() => setChild(false)} />}
  </section>;
}
const pending = new Map();
function Fixture() {
  const [open, setOpen] = useState(false); const [filter, setFilter] = useState('A');
  const [fast,setFast]=useState(false),[lang,setLang]=useState('en'),[notifications,setNotifications]=useState(false);
  const [code,setCode]=useState(false),[reviews,setReviews]=useState(false);
  const query = useLatestQuery(() => new Promise((resolve, reject) => pending.set(filter, { resolve, reject })), { filter });
  window.auditFixture = { pending: (key)=>pending.has(key), resolve: (key, value) => pending.get(key)?.resolve(value), reject: (key) => pending.get(key)?.reject(Error('synthetic unavailable')) };
  return <>
    <button onClick={() => setOpen(true)}>Open parent</button><a href="#background">Background link</a>
    {open && <Dialog close={() => setOpen(false)} />}
    <button onClick={() => setFilter('B')}>Query B</button><button onClick={() => setFilter('C')}>Query C</button>
    <output aria-label="query-state">{JSON.stringify({ data: query.data, loading: query.loading, error: Boolean(query.error) })}</output>
    <button onClick={()=>{setLang('en');setFast(true);}}>Open Fast Request EN</button>
    <button onClick={()=>{setLang('it');setFast(true);}}>Open Fast Request IT</button>
    {fast&&<FastRequestModal lang={lang} siteContent={{}} onClose={()=>setFast(false)}/>}
    <button onClick={()=>setNotifications(value=>!value)}>Toggle notification settings</button>
    <button onClick={()=>setLang(value=>value==='en'?'it':'en')}>Toggle fixture language</button>
    {notifications&&<NotificationsPage variant="public" lang={lang}/>}
    <button onClick={()=>setCode(true)}>Open booking code</button>
    {code&&<BookingCodeModal lang="en" siteContent={{}} onClose={()=>setCode(false)}/>}
    <button onClick={()=>setReviews(value=>!value)}>Toggle reviews</button>
    {reviews&&<ReviewsPage lang="en" siteContent={{}}/>}
  </>;
}
createRoot(document.getElementById('root')).render(<Fixture />);
