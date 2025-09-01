import React, { useEffect, useMemo, useRef, useState } from "react";

/**
 * LiteNotes — a single‑file personal notes app
 * - Obsidian‑style [[WikiLinks]] between notes
 * - Minimal "database" (collections with columns + rows)
 * - 100% client‑side; data lives in localStorage
 * - Export/Import JSON for backups (works well with GitHub Pages hosting)
 *
 * How to use:
 * 1) Click "New Note" → give it a title → write. Use [[Other Note]] to link/create.
 * 2) Use YAML‑like front matter for properties (optional):
 *    ---\npriority: high\nproject: candida\n---\nYour content...
 *    These properties appear as a key→value table above the note.
 * 3) Database tab → "+ Collection" → add columns/rows. Everything saves automatically.
 * 4) Settings → Export/Import all data as JSON.
 */

// ---------- Utilities ----------
const LS_KEYS = {
  NOTES: "litenotes.notes.v1",
  COLLECTIONS: "litenotes.collections.v1",
};

function loadLS(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function saveLS(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

function parseFrontMatter(text) {
  // Very small parser: ---\nkey: value\n--- at the top
  const fm = { props: {}, body: text || "" };
  if (!text) return fm;
  if (text.startsWith("---\n")) {
    const end = text.indexOf("\n---", 4);
    if (end !== -1) {
      const header = text.slice(4, end).trim();
      const body = text.slice(end + 4).replace(/^\n/, "");
      const props = {};
      header.split(/\n+/).forEach((line) => {
        const m = line.match(/^([^:]+):\s*(.*)$/);
        if (m) props[m[1].trim()] = m[2].trim();
      });
      return { props, body };
    }
  }
  return fm;
}

function renderWikiLinks(text, onOpen) {
  // Replace [[Title]] with clickable spans; keep line breaks
  const parts = [];
  const regex = /\[\[([^\]]+)\]\]/g;
  let last = 0; let m;
  while ((m = regex.exec(text)) !== null) {
    const before = text.slice(last, m.index);
    if (before) parts.push(before);
    const title = m[1].trim();
    parts.push(
      <button
        key={`link-${m.index}`}
        className="underline hover:no-underline rounded px-1"
        onClick={() => onOpen(title)}
        title={`Open note: ${title}`}
      >
        [[{title}]]
      </button>
    );
    last = m.index + m[0].length;
  }
  const after = text.slice(last);
  if (after) parts.push(after);
  // turn \n into <br/>
  return parts.map((p, i) =>
    typeof p === "string" ? (
      <span key={i}>
        {p.split("\n").map((line, j) => (
          <React.Fragment key={j}>
            {line}
            {j < p.split("\n").length - 1 && <br />}
          </React.Fragment>
        ))}
      </span>
    ) : (
      <React.Fragment key={i}>{p}</React.Fragment>
    )
  );
}

// ---------- Main App ----------
export default function App() {
  const [tab, setTab] = useState("notes");
  return (
    <div className="min-h-screen bg-neutral-50 text-neutral-900">
      <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b">
        <div className="max-w-6xl mx-auto flex items-center justify-between p-3">
          <h1 className="text-xl font-bold">LiteNotes</h1>
          <nav className="flex gap-2">
            <TabButton active={tab === "notes"} onClick={() => setTab("notes")}>Notes</TabButton>
            <TabButton active={tab === "db"} onClick={() => setTab("db")}>Database</TabButton>
            <TabButton active={tab === "settings"} onClick={() => setTab("settings")}>Settings</TabButton>
          </nav>
        </div>
      </header>
      {tab === "notes" && <NotesView />}
      {tab === "db" && <DatabaseView />}
      {tab === "settings" && <SettingsView />}
    </div>
  );
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-2xl text-sm border ${
        active ? "bg-black text-white" : "bg-white hover:bg-neutral-100"
      }`}
    >
      {children}
    </button>
  );
}

// ---------- Notes ----------
function NotesView() {
  const [notes, setNotes] = useState(() => loadLS(LS_KEYS.NOTES, {})); // {title: {content, updated}}
  const [query, setQuery] = useState("");
  const titles = useMemo(
    () => Object.keys(notes).sort((a, b) => (notes[b]?.updated || 0) - (notes[a]?.updated || 0)),
    [notes]
  );
  const [current, setCurrent] = useState(titles[0] || "Home");

  useEffect(() => saveLS(LS_KEYS.NOTES, notes), [notes]);
  useEffect(() => { if (!notes[current]) createNote(current); }, []);

  function createNote(title) {
    setNotes((prev) => ({
      ...prev,
      [title]: prev[title] || { content: "", updated: Date.now() },
    }));
  }
  function openNote(title) {
    if (!notes[title]) createNote(title);
    setCurrent(title);
  }
  function renameNote(oldTitle, newTitle) {
    if (!newTitle || oldTitle === newTitle) return;
    if (notes[newTitle]) { alert("A note with this title already exists."); return; }
    setNotes((prev) => {
      const copy = { ...prev };
      copy[newTitle] = { ...copy[oldTitle], updated: Date.now() };
      delete copy[oldTitle];
      return copy;
    });
    setCurrent(newTitle);
  }
  function deleteNote(title) {
    if (!confirm(`Delete note "${title}"?`)) return;
    setNotes((prev) => {
      const copy = { ...prev };
      delete copy[title];
      return copy;
    });
    setCurrent(Object.keys(notes).filter((t) => t !== title)[0] || "Home");
  }

  const cur = notes[current] || { content: "", updated: 0 };
  const { props, body } = useMemo(() => parseFrontMatter(cur.content), [cur.content]);

  const filtered = titles.filter((t) => t.toLowerCase().includes(query.toLowerCase()));

  return (
    <div className="max-w-6xl mx-auto grid md:grid-cols-[260px,1fr] gap-4 p-4">
      <aside className="bg-white rounded-2xl shadow p-3 h-fit md:sticky md:top-16">
        <div className="flex gap-2 mb-2">
          <button className="px-2 py-1 rounded bg-black text-white" onClick={() => {
            const title = prompt("New note title:", "Untitled");
            if (title) { createNote(title); setCurrent(title); }
          }}>+ New Note</button>
          <button className="px-2 py-1 rounded border" onClick={() => openNote("Home")}>
            Home
          </button>
        </div>
        <input
          className="w-full border rounded px-2 py-1 mb-2"
          placeholder="Search notes..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="space-y-1 max-h-[60vh] overflow-auto pr-1">
          {filtered.map((t) => (
            <button
              key={t}
              className={`w-full text-left px-2 py-1 rounded hover:bg-neutral-100 ${
                t === current ? "bg-neutral-900 text-white hover:bg-neutral-900" : ""
              }`}
              onClick={() => openNote(t)}
              title={new Date(notes[t].updated).toLocaleString()}
            >
              <div className="truncate">{t}</div>
            </button>
          ))}
          {filtered.length === 0 && (
            <div className="text-sm text-neutral-500">No matches.</div>
          )}
        </div>
      </aside>

      <main className="space-y-3">
        <div className="flex flex-wrap gap-2 items-center">
          <input
            className="text-xl font-semibold border rounded px-2 py-1"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            onBlur={(e) => renameNote(current, e.target.value.trim())}
          />
          <button className="px-2 py-1 rounded border" onClick={() => {
            const newTitle = prompt("Rename note to:", current);
            if (newTitle) renameNote(current, newTitle.trim());
          }}>Rename</button>
          <button className="px-2 py-1 rounded border" onClick={() => deleteNote(current)}>Delete</button>
        </div>

        {/* Front matter props */}
        {Object.keys(props).length > 0 && (
          <div className="bg-white rounded-2xl shadow p-3">
            <div className="text-sm font-medium mb-2">Properties</div>
            <div className="grid sm:grid-cols-2 gap-2">
              {Object.entries(props).map(([k, v]) => (
                <div key={k} className="flex items-center gap-2">
                  <div className="text-xs px-2 py-1 rounded-full bg-neutral-100">{k}</div>
                  <div className="text-sm">{v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="grid lg:grid-cols-2 gap-3">
          {/* Editor */}
          <textarea
            className="min-h-[50vh] w-full border rounded-2xl p-3 focus:outline-none focus:ring-2 focus:ring-black"
            value={cur.content}
            onChange={(e) => setNotes((prev) => ({
              ...prev,
              [current]: { content: e.target.value, updated: Date.now() },
            }))}
            placeholder={
              "---\npriority: high\nproject: personal\n---\nWrite your note here... Use [[Links]] to other notes."
            }
          />

          {/* Preview with wiki links */}
          <div className="min-h-[50vh] w-full border rounded-2xl p-3 bg-white shadow-sm">
            <div className="prose max-w-none">
              {renderWikiLinks(body || "", (title) => openNote(title))}
            </div>
          </div>
        </div>

        {/* Backlinks */}
        <Backlinks notes={notes} current={current} openNote={openNote} />
      </main>
    </div>
  );
}

function Backlinks({ notes, current, openNote }) {
  const list = Object.entries(notes)
    .filter(([title]) => title !== current)
    .filter(([, n]) => /\[\[[^\]]+\]\]/.test(n.content))
    .filter(([t, n]) => new RegExp(`\\[\\[${escapeRegExp(current)}\\]\\]`).test(n.content));
  if (list.length === 0) return null;
  return (
    <div className="bg-white rounded-2xl shadow p-3">
      <div className="text-sm font-medium mb-2">Backlinks</div>
      <div className="flex flex-wrap gap-2">
        {list.map(([t]) => (
          <button key={t} className="px-2 py-1 rounded border" onClick={() => openNote(t)}>{t}</button>
        ))}
      </div>
    </div>
  );
}

function escapeRegExp(str) { return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

// ---------- Database ----------
function DatabaseView() {
  const [collections, setCollections] = useState(() => loadLS(LS_KEYS.COLLECTIONS, {})); // name -> { columns: [{key,type}], rows: [{id, data:{}}] }
  const [selected, setSelected] = useState(Object.keys(collections)[0] || "");
  useEffect(() => saveLS(LS_KEYS.COLLECTIONS, collections), [collections]);

  function addCollection() {
    const name = prompt("Collection name:", "MyTable");
    if (!name) return;
    if (collections[name]) { alert("Collection already exists."); return; }
    const next = { ...collections, [name]: { columns: [{ key: "name", type: "text" }], rows: [] } };
    setCollections(next);
    setSelected(name);
  }
  function deleteCollection(name) {
    if (!confirm(`Delete collection "${name}"?`)) return;
    const copy = { ...collections };
    delete copy[name];
    setCollections(copy);
    setSelected(Object.keys(copy)[0] || "");
  }

  const col = collections[selected];

  return (
    <div className="max-w-6xl mx-auto p-4 space-y-3">
      <div className="flex flex-wrap gap-2 items-center">
        <button className="px-3 py-1.5 rounded bg-black text-white" onClick={addCollection}>+ Collection</button>
        <select className="border rounded px-2 py-1" value={selected} onChange={(e) => setSelected(e.target.value)}>
          {Object.keys(collections).map((k) => <option key={k}>{k}</option>)}
        </select>
        {selected && (
          <>
            <button className="px-2 py-1 rounded border" onClick={() => {
              const nn = prompt("Rename collection:", selected);
              if (!nn || nn === selected) return;
              if (collections[nn]) { alert("Name exists."); return; }
              const copy = { ...collections };
              copy[nn] = copy[selected];
              delete copy[selected];
              setCollections(copy);
              setSelected(nn);
            }}>Rename</button>
            <button className="px-2 py-1 rounded border" onClick={() => deleteCollection(selected)}>Delete</button>
          </>
        )}
      </div>

      {!selected ? (
        <div className="text-neutral-500">Create a collection to begin.</div>
      ) : (
        <div className="bg-white rounded-2xl shadow p-3 overflow-auto">
          <ColumnsEditor
            columns={col.columns}
            onChange={(cols) => setCollections({ ...collections, [selected]: { ...col, columns: cols } })}
          />
          <RowsTable
            columns={col.columns}
            rows={col.rows}
            onChange={(rows) => setCollections({ ...collections, [selected]: { ...col, rows } })}
          />
        </div>
      )}
    </div>
  );
}

function ColumnsEditor({ columns, onChange }) {
  function addColumn() {
    const key = prompt("Column key (letters/numbers):", "field");
    if (!key) return;
    if (columns.some((c) => c.key === key)) { alert("Key exists."); return; }
    onChange([...columns, { key, type: "text" }]);
  }
  return (
    <div className="flex flex-wrap items-center gap-2 mb-3">
      <div className="text-sm font-medium">Columns</div>
      {columns.map((c, idx) => (
        <div key={c.key} className="flex items-center gap-1 border rounded px-2 py-1">
          <input
            className="w-24 text-sm"
            value={c.key}
            onChange={(e) => {
              const v = e.target.value;
              const next = [...columns];
              next[idx] = { ...c, key: v };
              onChange(next);
            }}
          />
          <select
            className="text-sm"
            value={c.type}
            onChange={(e) => {
              const next = [...columns];
              next[idx] = { ...c, type: e.target.value };
              onChange(next);
            }}
          >
            <option value="text">text</option>
            <option value="number">number</option>
            <option value="checkbox">checkbox</option>
          </select>
          <button className="text-xs px-1 py-0.5 border rounded" onClick={() => {
            const next = columns.filter((_, i) => i !== idx);
            onChange(next);
          }}>x</button>
        </div>
      ))}
      <button className="px-2 py-1 rounded border" onClick={addColumn}>+ Column</button>
    </div>
  );
}

function RowsTable({ columns, rows, onChange }) {
  function addRow() {
    const id = Math.random().toString(36).slice(2, 9);
    onChange([...(rows || []), { id, data: {} }]);
  }
  function updateCell(ridx, key, value) {
    const next = [...rows];
    next[ridx] = { ...next[ridx], data: { ...next[ridx].data, [key]: value } };
    onChange(next);
  }
  function deleteRow(ridx) {
    onChange(rows.filter((_, i) => i !== ridx));
  }

  return (
    <div className="overflow-auto">
      <table className="min-w-full border rounded-2xl overflow-hidden">
        <thead>
          <tr className="bg-neutral-100">
            <th className="text-left text-xs font-medium p-2 border">#</th>
            {columns.map((c) => (
              <th key={c.key} className="text-left text-xs font-medium p-2 border">{c.key}</th>
            ))}
            <th className="p-2 border"></th>
          </tr>
        </thead>
        <tbody>
          {(rows || []).map((r, ridx) => (
            <tr key={r.id} className="odd:bg-white even:bg-neutral-50">
              <td className="p-2 border text-xs text-neutral-500">{ridx + 1}</td>
              {columns.map((c) => (
                <td key={c.key} className="p-2 border">
                  {c.type === "checkbox" ? (
                    <input
                      type="checkbox"
                      checked={!!r.data[c.key]}
                      onChange={(e) => updateCell(ridx, c.key, e.target.checked)}
                    />
                  ) : (
                    <input
                      className="w-full border rounded px-2 py-1"
                      type={c.type === "number" ? "number" : "text"}
                      value={r.data[c.key] ?? ""}
                      onChange={(e) => updateCell(ridx, c.key, c.type === "number" ? Number(e.target.value) : e.target.value)}
                    />
                  )}
                </td>
              ))}
              <td className="p-2 border">
                <button className="px-2 py-1 rounded border" onClick={() => deleteRow(ridx)}>Delete</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2">
        <button className="px-3 py-1.5 rounded bg-black text-white" onClick={addRow}>+ Row</button>
      </div>
    </div>
  );
}

// ---------- Settings ----------
function SettingsView() {
  const [notes, setNotes] = useState(() => loadLS(LS_KEYS.NOTES, {}));
  const [collections, setCollections] = useState(() => loadLS(LS_KEYS.COLLECTIONS, {}));
  useEffect(() => saveLS(LS_KEYS.NOTES, notes), [notes]);
  useEffect(() => saveLS(LS_KEYS.COLLECTIONS, collections), [collections]);

  function exportAll() {
    const payload = { notes, collections, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `litenotes-backup-${Date.now()}.json`; a.click();
    URL.revokeObjectURL(url);
  }

  function importAll(file) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const obj = JSON.parse(String(reader.result));
        if (!obj || typeof obj !== "object") throw new Error("Invalid file");
        if (obj.notes) setNotes(obj.notes);
        if (obj.collections) setCollections(obj.collections);
        alert("Imported successfully.");
      } catch (e) {
        alert("Import failed: " + e.message);
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="max-w-3xl mx-auto p-4 space-y-4">
      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <div className="text-lg font-semibold">Backup</div>
        <div className="flex gap-2">
          <button className="px-3 py-1.5 rounded bg-black text-white" onClick={exportAll}>Export JSON</button>
          <label className="px-3 py-1.5 rounded border cursor-pointer">
            Import JSON
            <input type="file" accept="application/json" className="hidden" onChange={(e) => e.target.files?.[0] && importAll(e.target.files[0])} />
          </label>
        </div>
        <p className="text-sm text-neutral-600">Data is stored only in your browser (localStorage). Export before clearing browser data or switching devices.</p>
      </div>

      <div className="bg-white rounded-2xl shadow p-4 space-y-2">
        <div className="text-lg font-semibold">Keyboard & Tips</div>
        <ul className="list-disc pl-6 text-sm space-y-1">
          <li>Use <code>[[Note Title]]</code> to link or create a note.</li>
          <li>Add optional front matter between <code>---</code> lines to store properties.</li>
          <li>Everything saves automatically. Use Export for backups.</li>
        </ul>
      </div>
    </div>
  );
}
