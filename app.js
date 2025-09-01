
const {useState,useEffect,useMemo,useRef,Fragment} = React;

const LS_KEY = "litenotes.pro.v1";

function loadData(){
  try{
    const raw = localStorage.getItem(LS_KEY);
    if(!raw) return {notes:{}, trash:[]};
    return JSON.parse(raw);
  }catch{ return {notes:{}, trash:[]} }
}
function saveData(data){
  try{ localStorage.setItem(LS_KEY, JSON.stringify(data)); }catch{}
}

// --- Mini markdown render (very small)
// Supports headings, bold **, italic *, underline __, wiki [[Title]]
function renderMarkdown(src, onOpen){
  const esc = (s)=>s.replace(/[&<>]/g, c=>({ "&":"&amp;","<":"&lt;",">":"&gt;" }[c]));
  const lines = src.split(/\r?\n/);
  const html = lines.map(line=>{
    if(/^###\s+/.test(line)) return `<h3>${esc(line.replace(/^###\s+/,""))}</h3>`;
    if(/^##\s+/.test(line)) return `<h2>${esc(line.replace(/^##\s+/,""))}</h2>`;
    if(/^#\s+/.test(line)) return `<h1>${esc(line.replace(/^#\s+/,""))}</h1>`;
    let t = esc(line);
    // bold, italic, underline
    t = t.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
    t = t.replace(/\*([^*]+)\*/g, "<em>$1</em>");
    t = t.replace(/__([^_]+)__/g, "<u>$1</u>");
    // wikilinks
    t = t.replace(/\[\[([^\]]+)\]\]/g, (m,p1)=>`<a href="#" class="wikilink" data-title="${p1}">[[${p1}]]</a>`);
    return `<p>${t||"&nbsp;"}</p>`;
  }).join("\n");
  return {__html: html};
}

function App(){
  const [data,setData] = useState(loadData);
  const [current,setCurrent] = useState("Home");
  const [query,setQuery] = useState("");
  const [edFont,setEdFont] = useState(16);

  useEffect(()=>saveData(data),[data]);
  useEffect(()=>{
    if(!data.notes[current]){
      setData(d=>({...d, notes:{...d.notes, [current]:{content:"",updated:Date.now()}}}));
    }
  },[]);

  const titles = useMemo(()=>Object.keys(data.notes).sort((a,b)=>(data.notes[b]?.updated||0)-(data.notes[a]?.updated||0)),[data]);

  const currentNote = data.notes[current] || {content:"",updated:0};

  function createNote(){
    const title = prompt("New note title:","Untitled");
    if(!title) return;
    if(data.notes[title]){ alert("A note with that title exists."); return; }
    setData(d=>({...d, notes:{...d.notes, [title]:{content:"",updated:Date.now()}}}));
    setCurrent(title);
  }
  function renameNote(){
    const nt = prompt("Rename note:", current);
    if(!nt || nt===current) return;
    if(data.notes[nt]){ alert("Title exists."); return; }
    setData(d=>{
      const copy = {...d.notes};
      copy[nt] = copy[current];
      delete copy[current];
      return {...d, notes:copy};
    });
    setCurrent(nt);
  }
  function softDeleteNote(title){
    if(!confirm(`Move "${title}" to Trash?`)) return;
    setData(d=>{
      const copy = {...d.notes};
      const entry = {title, content: copy[title]?.content||"", deletedAt: Date.now()};
      delete copy[title];
      return {...d, notes:copy, trash:[entry, ...d.trash]};
    });
    if(title===current){
      const next = Object.keys(data.notes).filter(t=>t!==title)[0] || "Home";
      setCurrent(next);
    }
  }
  function restoreTrash(idx){
    const item = data.trash[idx];
    const t = (data.notes[item.title] ? item.title+" (restored)" : item.title);
    setData(d=>{
      const notes = {...d.notes, [t]: {content:item.content,updated:Date.now()}};
      const trash = d.trash.filter((_,i)=>i!==idx);
      return {...d, notes, trash};
    });
    setCurrent(t);
  }
  function deleteForever(idx){
    if(!confirm("Delete permanently? This cannot be undone.")) return;
    setData(d=>({...d, trash: d.trash.filter((_,i)=>i!==idx)}));
  }
  function emptyTrash(){
    if(!confirm("Empty trash permanently?")) return;
    setData(d=>({...d, trash:[]}));
  }

  function setContent(v){
    setData(d=>({...d, notes:{...d.notes, [current]:{content:v, updated:Date.now()}}}));
  }

  const filtered = titles.filter(t=>t.toLowerCase().includes(query.toLowerCase()));

  // simple properties via front matter
  function parseFrontMatter(text){
    const fm = {props:{}, body:text||""};
    if(text && text.startsWith("---\n")){
      const end = text.indexOf("\n---",4);
      if(end!==-1){
        const header = text.slice(4,end).trim();
        const body = text.slice(end+4).replace(/^\n/,"");
        const props = {};
        header.split(/\n+/).forEach(line=>{
          const m = line.match(/^([^:]+):\s*(.*)$/);
          if(m) props[m[1].trim()] = m[2].trim();
        });
        return {props, body};
      }
    }
    return fm;
  }
  const {props, body} = useMemo(()=>parseFrontMatter(currentNote.content),[currentNote.content]);

  const previewRef = useRef(null);
  useEffect(()=>{
    const el = previewRef.current;
    if(!el) return;
    const handler = (e)=>{
      const a = e.target.closest("a.wikilink");
      if(a){
        e.preventDefault();
        const title = a.dataset.title;
        if(!data.notes[title]){
          setData(d=>({...d, notes:{...d.notes, [title]:{content:"",updated:Date.now()}}}));
        }
        setCurrent(title);
      }
    };
    el.addEventListener("click", handler);
    return ()=>el.removeEventListener("click", handler);
  },[data, previewRef.current]);

  // toolbar actions (insert markdown around selection)
  const taRef = useRef(null);
  function wrapSelection(before, after){
    const ta = taRef.current;
    if(!ta) return;
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const val = currentNote.content;
    const selected = val.slice(start,end) || "text";
    const next = val.slice(0,start) + before + selected + after + val.slice(end);
    setContent(next);
    requestAnimationFrame(()=>{
      ta.focus();
      ta.setSelectionRange(start+before.length, start+before.length+selected.length);
    });
  }
  function heading(level){
    const ta = taRef.current;
    if(!ta) return;
    const start = ta.selectionStart;
    const val = currentNote.content;
    const lineStart = val.lastIndexOf("\n", start-1)+1;
    const prefix = "#".repeat(level) + " ";
    const next = val.slice(0,lineStart) + prefix + val.slice(lineStart);
    setContent(next);
    requestAnimationFrame(()=>{
      ta.focus();
      ta.setSelectionRange(start+prefix.length, start+prefix.length);
    });
  }

  // backlinks
  const backlinks = Object.entries(data.notes)
    .filter(([t])=>t!==current)
    .filter(([,n])=>/\[\[[^\]]+\]\]/.test(n.content))
    .filter(([t,n])=> new RegExp(`\\[\\[${current.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}\\]\\]`).test(n.content));

  return (
    <div className="container">
      <aside className="sidebar">
        <div className="section">
          <button className="badge" onClick={createNote}>+ New Note</button>
          <div style={{height:8}}></div>
          <input className="search" placeholder="Search..." value={query} onChange={e=>setQuery(e.target.value)} />
          {filtered.map(t=>(
            <div key={t} className={"note-item "+(t===current?"active":"")} onClick={()=>setCurrent(t)}>
              {t}
            </div>
          ))}
          {filtered.length===0 && <div className="small">No matches.</div>}
          <hr/>
          <div className="small"><strong>Trash</strong></div>
          {data.trash.map((it,idx)=>(
            <div key={idx} className="note-item" style={{display:"flex",gap:6,alignItems:"center"}}>
              <span style={{flex:1,overflow:"hidden",textOverflow:"ellipsis"}}>{it.title}</span>
              <button className="badge" onClick={()=>restoreTrash(idx)}>Restore</button>
              <button className="badge" onClick={()=>deleteForever(idx)}>Delete</button>
            </div>
          ))}
          {data.trash.length>0 && <button className="badge" onClick={emptyTrash}>Empty Trash</button>}
        </div>
      </aside>

      <div className="main">
        <div className="header">
          <input className="title" value={current} onChange={e=>setCurrent(e.target.value)} onBlur={renameNote} />
          <button className="badge" onClick={()=>softDeleteNote(current)}>Move to Trash</button>
          <span className="small">Font:</span>
          <button className="badge" onClick={()=>{setEdFont(s=>Math.max(12,s-2)); document.documentElement.style.setProperty("--ed-font", (edFont-2)+"px");}}>-</button>
          <button className="badge" onClick={()=>{setEdFont(s=>Math.min(28,s+2)); document.documentElement.style.setProperty("--ed-font", (edFont+2)+"px");}}>+</button>
        </div>

        <div className="section">
          {Object.keys(props).length>0 && (
            <div className="proplist">
              {Object.entries(props).map(([k,v])=>(
                <div className="prop" key={k}><span className="k">{k}</span><span className="v">{v}</span></div>
              ))}
            </div>
          )}
        </div>

        <div className="section toolbar">
          <button onClick={()=>wrapSelection("**","**")} title="Bold">B</button>
          <button onClick={()=>wrapSelection("*","*")} title="Italic"><em>I</em></button>
          <button onClick={()=>wrapSelection("__","__")} title="Underline"><u>U</u></button>
          <button onClick={()=>heading(1)} title="H1">H1</button>
          <button onClick={()=>heading(2)} title="H2">H2</button>
          <button onClick={()=>heading(3)} title="H3">H3</button>
          <span className="small">Use [[Note Title]] to link.</span>
        </div>

        <div className="editor-wrap">
          <textarea ref={taRef} value={currentNote.content} onChange={e=>setContent(e.target.value)}
            placeholder={"---\npriority: high\nproject: personal\n---\n# Title\nWrite your note... **bold**, *italic*, __underline__.\nLink: [[Another Note]]"} />
          <div className="preview" ref={previewRef} dangerouslySetInnerHTML={renderMarkdown(body||"", (t)=>setCurrent(t))}/>
        </div>

        {backlinks.length>0 && (
          <div className="section">
            <div className="small"><strong>Backlinks</strong></div>
            <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
              {backlinks.map(([t])=>(<button className="badge" key={t} onClick={()=>setCurrent(t)}>{t}</button>))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App/>);
