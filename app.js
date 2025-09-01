const { useState } = React;

function App() {
  const [notes, setNotes] = useState({ "Home": "Welcome to LiteNotes!" });
  const [current, setCurrent] = useState("Home");

  function addNote() {
    const title = prompt("Note title:");
    if (title) setNotes({ ...notes, [title]: "" });
  }

  return (
    <div style={{ display: "flex", height: "100vh" }}>
      <aside style={{ width: "200px", borderRight: "1px solid #ccc", padding: "10px" }}>
        <button onClick={addNote}>+ Note</button>
        {Object.keys(notes).map((t) => (
          <div key={t} onClick={() => setCurrent(t)} style={{ cursor: "pointer", padding: "5px", background: t===current?"#eee":"" }}>{t}</div>
        ))}
      </aside>
      <main style={{ flex: 1, padding: "10px" }}>
        <h2>{current}</h2>
        <textarea
          style={{ width: "100%", height: "80%" }}
          value={notes[current]}
          onChange={(e) => setNotes({ ...notes, [current]: e.target.value })}
        />
      </main>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
