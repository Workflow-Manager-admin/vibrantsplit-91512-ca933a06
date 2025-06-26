import React, { useState, useEffect } from "react";
import "./App.css";

// Color theme variables
const COLORS = {
  accent: "#F59E42",
  primary: "#7C3AED",
  secondary: "#06B6D4",
  card: "#ffffff",
  lightBg: "#f8f9fa",
  border: "#e9ecef"
};

// Utility functions for local storage
function usePersistentState(key, initialValue) {
  const [state, setState] = useState(() => {
    const stored = window.localStorage.getItem(key);
    return stored != null ? JSON.parse(stored) : initialValue;
  });
  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(state));
  }, [key, state]);
  return [state, setState];
}

// Person and Expense Models
function uuid() {
  return (
    Date.now().toString(36) +
    Math.random().toString(36).substring(2, 8)
  );
}

function calculateBalances(people, expenses) {
  // Returns: { [personId]: { paid: number, shouldPay: number, balance: number } }
  const n = people.length;
  if (!n) return {};

  const balances = {};
  people.forEach((p) => {
    balances[p.id] = { paid: 0, shouldPay: 0, balance: 0 };
  });

  expenses.forEach((ex) => {
    const split = ex.splitType === "equal";
    const involved = ex.involved.length ? ex.involved : people.map((p) => p.id);
    involved.forEach((pid) => {
      balances[pid].shouldPay += split
        ? ex.amount / involved.length
        : (ex.shares && ex.shares[pid]) || 0;
    });
    balances[ex.paidBy].paid += ex.amount;
  });

  Object.entries(balances).forEach(([pid, obj]) => {
    obj.balance = obj.paid - obj.shouldPay;
  });
  return balances;
}

function buildDebtMatrix(people, balances) {
  // Who owes whom, using a greedy settlement algorithm.
  // Returns array of { from, to, amount }
  // Balances >0: is owed, <0: owes
  let personList = people.map((p) => ({
    ...p,
    balance: +(balances[p.id]?.balance || 0)
  }));
  const res = [];
  const EPS = 0.01;
  let debtors = personList.filter((p) => p.balance < -EPS);
  let creditors = personList.filter((p) => p.balance > EPS);

  while (debtors.length && creditors.length) {
    debtors.sort((a, b) => a.balance - b.balance); // Most negative first
    creditors.sort((a, b) => b.balance - a.balance); // Most positive first
    const debtor = debtors[0];
    const creditor = creditors[0];
    const settle = Math.min(-debtor.balance, creditor.balance);
    res.push({
      from: debtor,
      to: creditor,
      amount: Math.round(settle * 100) / 100
    });
    debtor.balance += settle;
    creditor.balance -= settle;
    if (debtor.balance >= -EPS) debtors.shift();
    if (creditor.balance <= EPS) creditors.shift();
  }
  return res;
}

// PUBLIC_INTERFACE
export default function App() {
  // NAV: 'dashboard' | 'people' | 'expenses' | 'add-expense'
  const [nav, setNav] = useState("dashboard");
  const [people, setPeople] = usePersistentState("fairsplit-people", []);
  const [expenses, setExpenses] = usePersistentState("fairsplit-expenses", []);
  const [showPersonModal, setShowPersonModal] = useState(false);
  const [showExpenseModal, setShowExpenseModal] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState(null);

  // Modal/animation management
  const [modalType, setModalType] = useState(null); // 'person' | 'expense'
  const [modalOpen, setModalOpen] = useState(false);

  // Calculations
  const balances = calculateBalances(people, expenses);
  const settlements = buildDebtMatrix(people, balances);

  // Anim: open/close modal
  useEffect(() => {
    setModalOpen(!!modalType);
  }, [modalType]);

  // App-wide micro transition
  useEffect(() => {
    document.body.style.background = COLORS.lightBg;
    document.body.style.transition = "background 0.5s";
  }, []);

  // UI HANDLERS

  // --- People ---
  function addPerson(name) {
    if (
      people.some(
        (p) => p.name.trim().toLowerCase() === name.trim().toLowerCase()
      )
    )
      return false;
    const newPerson = { id: uuid(), name: name.trim() };
    setPeople([...people, newPerson]);
    return true;
  }
  function removePerson(id) {
    // Remove also from all expenses
    setPeople(people.filter((p) => p.id !== id));
    setExpenses(
      expenses.map((exp) => ({
        ...exp,
        involved: exp.involved.filter((pid) => pid !== id),
        shares:
          exp.shares &&
          Object.fromEntries(
            Object.entries(exp.shares).filter(([pid]) => pid !== id)
          )
      }))
    );
  }

  // --- Expense ---
  function saveExpense(fields) {
    // fields: { desc, amount, paidBy, involved, category, date, splitType, shares }
    const exp = selectedExpense
      ? { ...selectedExpense, ...fields }
      : { ...fields, id: uuid() };
    let newList;
    if (selectedExpense) {
      newList = expenses.map((e) => (e.id === exp.id ? exp : e));
    } else {
      newList = [...expenses, exp];
    }
    setExpenses(newList);
    setModalType(null);
    setSelectedExpense(null);
  }
  function deleteExpense(id) {
    setExpenses(expenses.filter((e) => e.id !== id));
  }

  // UI—PAGES ----------------------------------------------------------------

  // PUBLIC_INTERFACE
  function Dashboard() {
    return (
      <div className="fade-in">
        <h1 className="brand-title" style={{ color: COLORS.primary }}>
          FairSplit
        </h1>
        <div className="subtitle" style={{ color: COLORS.accent }}>
          Real-time Expense Sharing Made Beautiful
        </div>
        <div style={{ margin: "24px 0" }}>
          <BalanceChart balances={balances} people={people} />
        </div>
        <SettlementSummary settlements={settlements} accent={COLORS.accent} />
        <div style={{ marginTop: 24 }}>
          <button
            className="btn-accent"
            style={{ marginRight: 12 }}
            onClick={() => setNav("add-expense")}
          >
            + Add Expense
          </button>
          <button className="btn-secondary" onClick={() => setNav("people")}>
            Manage People
          </button>
        </div>
        <div style={{ marginTop: 36 }}>
          <ExpensePreview
            expenses={expenses}
            people={people}
            onOpenExpense={(exp) => {
              setSelectedExpense(exp);
              setModalType("expense");
            }}
          />
        </div>
      </div>
    );
  }

  // PUBLIC_INTERFACE
  function PeoplePage() {
    const [input, setInput] = useState("");
    const [err, setErr] = useState(null);
    function submit(e) {
      e.preventDefault();
      if (!input.trim()) return;
      if (!addPerson(input)) setErr("Person already exists!");
      else {
        setInput("");
        setErr(null);
      }
    }
    return (
      <div className="fade-in page-people">
        <BackNav onClick={() => setNav("dashboard")} />
        <h2>
          <span role="img" aria-label="group">
            👥
          </span>{" "}
          People in Group
        </h2>
        <form className="people-add-form" onSubmit={submit}>
          <input
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Add name"
          />
          <button className="btn-accent" type="submit">
            Add
          </button>
        </form>
        {err && <div className="err-msg">{err}</div>}
        <div className="people-list">
          {people.length === 0 && (
            <div className="soft-fg">No people added yet.</div>
          )}
          {people.map((p) => (
            <div className="person-card anim-bounce" key={p.id}>
              <span>{p.name}</span>
              <button
                className="btn-link"
                onClick={() => removePerson(p.id)}
                title="Remove"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // PUBLIC_INTERFACE
  function ExpensesPage() {
    return (
      <div className="fade-in page-expenses">
        <BackNav onClick={() => setNav("dashboard")} />
        <h2>
          <span role="img" aria-label="expenses">
            💸
          </span>{" "}
          All Expenses
        </h2>
        <div>
          <button
            className="btn-accent"
            onClick={() => setModalType("expense")}
            style={{ marginBottom: 18 }}
          >
            + Add Expense
          </button>
        </div>
        <ExpensePreview
          expenses={expenses}
          people={people}
          onOpenExpense={(exp) => {
            setSelectedExpense(exp);
            setModalType("expense");
          }}
          showDelete={true}
          onDelete={deleteExpense}
        />
      </div>
    );
  }

  // ----------- Components ---------------------------------------------------

  function BottomNav() {
    return (
      <nav className="bottom-nav">
        <NavItem
          icon="🏠"
          active={nav === "dashboard"}
          label="Dashboard"
          onClick={() => setNav("dashboard")}
        />
        <NavItem
          icon="👥"
          active={nav === "people"}
          label="People"
          onClick={() => setNav("people")}
        />
        <NavItem
          icon="💸"
          active={nav === "expenses"}
          label="Expenses"
          onClick={() => setNav("expenses")}
        />
      </nav>
    );
  }

  function NavItem({ icon, active, label, onClick }) {
    return (
      <button
        className={`bottom-nav-item${active ? " nav-active" : ""}`}
        style={active ? { color: COLORS.primary } : null}
        onClick={onClick}
        aria-label={label}
      >
        <div className="nav-icon">{icon}</div>
        <div className="nav-label">{label}</div>
      </button>
    );
  }

  function BackNav({ onClick }) {
    return (
      <button className="btn-link back-nav" onClick={onClick}>
        ← Back
      </button>
    );
  }

  function ExpensePreview({
    expenses,
    people,
    onOpenExpense,
    showDelete,
    onDelete
  }) {
    if (!expenses.length) {
      return (
        <div className="no-expenses">
          <span className="soft-fg">No expenses yet.</span>
        </div>
      );
    }
    function personName(id) {
      return people.find((p) => p.id === id)?.name || "Unknown";
    }
    return (
      <div className="expense-list">
        {expenses
          .slice()
          .sort((a, b) => new Date(b.date) - new Date(a.date))
          .map((ex) => (
            <div
              className="expense-card anim-slide-in"
              key={ex.id}
              tabIndex={0}
              onClick={() => onOpenExpense && onOpenExpense(ex)}
              role="button"
            >
              <div style={{ flex: 1 }}>
                <div className="expense-desc">{ex.desc}</div>
                <div className="expense-meta">
                  <span>
                    <b>{personName(ex.paidBy)}</b> paid
                  </span>{" "}
                  {ex.amount && (
                    <span style={{ color: COLORS.accent, fontWeight: 700 }}>
                      ${+ex.amount}
                    </span>
                  )}
                  <span>
                    {" "}
                    for {ex.involved.length}{" "}
                    {ex.involved.length === 1 ? "person" : "people"}
                  </span>
                </div>
                <div className="expense-footer">
                  <span className="category-label" style={{ color: COLORS.secondary }}>
                    {ex.category ?? "General"}
                  </span>
                  {ex.date && (
                    <span className="expense-date">
                      {new Date(ex.date).toLocaleDateString()}
                    </span>
                  )}
                </div>
              </div>
              {showDelete ? (
                <button
                  className="btn-link delete-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    onDelete(ex.id);
                  }}
                  title="Delete"
                >
                  🗑️
                </button>
              ) : null}
            </div>
          ))}
      </div>
    );
  }

  function BalanceChart({ balances, people }) {
    // Pie chart of shares: positive = owed, negative = owes
    if (!people.length) return null;
    const values = people.map((p) => ({
      ...p,
      bal: +(balances[p.id]?.balance || 0)
    }));
    const totalOwed = values.filter((v) => v.bal > 0).reduce((s, v) => s + v.bal, 0);
    const totalOwes = values.filter((v) => v.bal < 0).reduce((s, v) => s + v.bal, 0);

    // Color palette
    const PALETTE = [
      COLORS.primary,
      COLORS.secondary,
      COLORS.accent,
      "#4ade80",
      "#f472b6",
      "#facc15"
    ];

    function getPieAngles() {
      // Pie for "is owed"
      let sum = Math.abs(totalOwed);
      if (!sum) return [];
      let start = 0;
      return values
        .map((v, idx) =>
          v.bal > 0
            ? {
                idx,
                value: v.bal,
                from: start,
                to: start + (v.bal / sum) * 360,
                color: PALETTE[idx % PALETTE.length],
                name: v.name
              }
            : null
        )
        .filter(Boolean)
        .map((item) => {
          start = item.to;
          return item;
        });
    }

    const pieAngles = getPieAngles();

    return (
      <div className="card chart-card anim-fade-in">
        <div className="chart-rows">
          <div className="piechart-block">
            <svg viewBox="0 0 48 48" width={72} height={72}>
              {pieAngles.length === 0 ? (
                <circle
                  cx="24"
                  cy="24"
                  r="18"
                  fill="#f1f5f9"
                  stroke="#d1d5db"
                  strokeWidth="2"
                />
              ) : (
                pieAngles.map((seg, i) => (
                  <PieSlice
                    key={i}
                    cx={24}
                    cy={24}
                    r={18}
                    startAngle={seg.from}
                    endAngle={seg.to}
                    fill={seg.color}
                  />
                ))
              )}
            </svg>
          </div>
          <div className="chart-details" style={{ flex: 1 }}>
            <div className="chart-title">Group Net Balances</div>
            <div className="chart-legend-row">
              {values.map((v, i) => (
                <span key={v.id} className="legend-person">
                  <span
                    className="legend-swatch"
                    style={{
                      background: PALETTE[i % PALETTE.length],
                      opacity: v.bal > 0 ? 1 : 0.3
                    }}
                  ></span>
                  {v.name}:{" "}
                  <b
                    style={{
                      color: v.bal > 0 ? COLORS.primary : COLORS.accent
                    }}
                  >
                    {v.bal > 0 ? "+" : ""}
                    {v.bal.toFixed(2)}
                  </b>
                </span>
              ))}
            </div>
            <div className="chart-subnote">
              {totalOwed > 0
                ? "Some members are owed money."
                : "All balances are settled."}
            </div>
          </div>
        </div>
      </div>
    );
  }

  function PieSlice({ cx, cy, r, startAngle, endAngle, fill }) {
    // SVG arc path for pie segment
    const rad = (x) => (x * Math.PI) / 180;
    const start = {
      x: cx + r * Math.cos(rad(startAngle - 90)),
      y: cy + r * Math.sin(rad(startAngle - 90))
    };
    const end = {
      x: cx + r * Math.cos(rad(endAngle - 90)),
      y: cy + r * Math.sin(rad(endAngle - 90))
    };
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    const path = [
      `M${cx},${cy}`,
      `L${start.x},${start.y}`,
      `A${r},${r} 0 ${largeArc} 1 ${end.x},${end.y}`,
      "Z"
    ].join(" ");
    return <path d={path} fill={fill} />;
  }

  function SettlementSummary({ settlements, accent }) {
    if (!settlements.length)
      return (
        <div className="card settle-summary anim-fade-in">
          <div>
            <b>All debts are settled! 🎉</b>
          </div>
        </div>
      );

    return (
      <div className="card settle-summary anim-fade-in">
        <div>
          <b style={{ color: accent }}>Debts and Credits</b>
        </div>
        <ul>
          {settlements.map((s, i) => (
            <li key={i} className="summary-row">
              <span style={{ color: COLORS.accent }}>{s.from.name}</span>
              &nbsp;owes&nbsp;
              <b style={{ color: COLORS.primary }}>{s.to.name}</b>
              &nbsp;<span className="money">${s.amount.toFixed(2)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  // ------------ Modal Overlays ------------------------------------------

  function ExpenseModal({ expense, onSave, onClose, people }) {
    // For new or edit
    const editing = !!expense;
    const [desc, setDesc] = useState(expense?.desc || "");
    const [amount, setAmount] = useState(expense?.amount || "");
    const [paidBy, setPaidBy] = useState(expense?.paidBy || (people[0] && people[0].id));
    const [involved, setInvolved] = useState(
      expense?.involved?.length ? expense.involved : people.map((p) => p.id)
    );
    const [category, setCategory] = useState(expense?.category || "General");
    const [date, setDate] = useState(
      expense?.date || new Date().toISOString().substring(0, 10)
    );
    const [splitType, setSplitType] = useState(expense?.splitType || "equal");
    const [shares, setShares] = useState(
      expense?.shares ??
        people.reduce((acc, p) => ({ ...acc, [p.id]: "" }), {})
    );
    const [err, setErr] = useState(null);

    function handleInvolved(pid) {
      setInvolved(
        involved.includes(pid)
          ? involved.filter((id) => id !== pid)
          : [...involved, pid]
      );
    }

    function handleShareChange(pid, val) {
      setShares((old) => ({ ...old, [pid]: val }));
    }

    function handleSubmit(e) {
      e.preventDefault();
      if (!desc.trim() || !amount || !paidBy || !involved.length) {
        setErr("Fill all the required fields.");
        return;
      }
      let parsedAmount = parseFloat(amount);
      if (isNaN(parsedAmount) || parsedAmount <= 0) {
        setErr("Please enter a valid amount.");
        return;
      }
      if (splitType === "custom") {
        let sum = 0;
        for (let pid of involved) {
          const v = parseFloat(shares[pid]);
          if (isNaN(v) || v < 0) {
            setErr("Custom shares must be positive numbers.");
            return;
          }
          sum += v;
        }
        if (Math.abs(sum - parsedAmount) > 0.012) {
          setErr(`Custom shares must sum to ${parsedAmount.toFixed(2)}.`);
          return;
        }
      }
      onSave({
        desc: desc.trim(),
        amount: +parseFloat(amount).toFixed(2),
        paidBy,
        involved,
        category,
        date,
        splitType,
        shares: splitType === "equal"
          ? undefined
          : Object.fromEntries(
              involved.map((pid) => [pid, parseFloat(shares[pid]) || 0])
            )
      });
    }

    return (
      <div className="modal-overlay fade-in-fast" onClick={onClose}>
        <div
          className="modal expense-modal anim-rise"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="modal-header">
            <b style={{ color: COLORS.primary, fontSize: 20 }}>
              {editing ? "Edit Expense" : "New Expense"}
            </b>
            <button className="btn-link modal-close" onClick={onClose}>
              ×
            </button>
          </div>
          <form className="expense-form" onSubmit={handleSubmit}>
            <label>
              Description
              <input
                autoFocus
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                placeholder="What was this for?"
                required
                maxLength={32}
              />
            </label>
            <label>
              Amount
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                required
                onChange={(e) => setAmount(e.target.value)}
              />
            </label>
            <label>
              Category
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
              >
                <option>General</option>
                <option>Food & Drink</option>
                <option>Travel</option>
                <option>Groceries</option>
                <option>Rent</option>
                <option>Utilities</option>
                <option>Entertainment</option>
                <option>Other</option>
              </select>
            </label>
            <label>
              Date
              <input
                type="date"
                value={date}
                required
                onChange={(e) => setDate(e.target.value)}
              />
            </label>
            <label>
              Paid By
              <select
                value={paidBy}
                required
                onChange={(e) => setPaidBy(e.target.value)}
              >
                {people.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
                <span>Who is involved?</span>
                <span style={{ fontSize: 12, color: COLORS.secondary }}>
                  (Tap to select)
                </span>
              </div>
              <div className="involved-list">
                {people.map((p) => (
                  <button
                    type="button"
                    key={p.id}
                    className={
                      involved.includes(p.id)
                        ? "person-chip chip-selected"
                        : "person-chip"
                    }
                    onClick={() => handleInvolved(p.id)}
                  >
                    {p.name}
                  </button>
                ))}
              </div>
            </label>
            <label>
              Split Type:
              <div className="split-type-row">
                <label>
                  <input
                    type="radio"
                    name="splitType"
                    value="equal"
                    checked={splitType === "equal"}
                    onChange={() => setSplitType("equal")}
                  />{" "}
                  Equal
                </label>
                <label>
                  <input
                    type="radio"
                    name="splitType"
                    value="custom"
                    checked={splitType === "custom"}
                    onChange={() => setSplitType("custom")}
                  />{" "}
                  Custom
                </label>
              </div>
              {splitType === "custom" && (
                <div>
                  {involved.map((pid) => (
                    <div key={pid} className="custom-share-row">
                      <span className="custom-share-label">
                        {people.find((p) => p.id === pid)?.name}
                      </span>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={shares[pid] || ""}
                        onChange={(e) =>
                          handleShareChange(pid, e.target.value)
                        }
                        style={{ width: 70 }}
                        required
                      />
                    </div>
                  ))}
                </div>
              )}
            </label>
            {err && <div className="err-msg">{err}</div>}
            <div style={{ textAlign: "right", marginTop: 18 }}>
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                style={{ marginRight: 6 }}
              >
                Cancel
              </button>
              <button className="btn-accent" type="submit">
                {editing ? "Save" : "Add"}
              </button>
            </div>
          </form>
        </div>
      </div>
    );
  }

  // --------------- Main App Render --------------------------------------------

  return (
    <>
      {/* Vibrant blurred bg shapes for visual appeal */}
      <div className="fairsplit-bg-shapes" aria-hidden="true">
        <div className="fairsplit-bg-shape fairsplit-bg-accent1"></div>
        <div className="fairsplit-bg-shape fairsplit-bg-accent2"></div>
        <div className="fairsplit-bg-shape fairsplit-bg-accent3"></div>
      </div>
      <div className="fairsplit-app">
        <div className="main-content" style={{ paddingBottom: 68 }}>
          {modalOpen && modalType === "expense" && (
            <ExpenseModal
              expense={selectedExpense}
              people={people}
              onSave={saveExpense}
              onClose={() => {
                setModalType(null);
                setSelectedExpense(null);
              }}
            />
          )}
          {nav === "dashboard" && <Dashboard />}
          {nav === "people" && <PeoplePage />}
          {nav === "expenses" && <ExpensesPage />}
          {nav === "add-expense" && (
            <ExpenseModal
              people={people}
              onSave={saveExpense}
              onClose={() => setNav("dashboard")}
            />
          )}
          {/* Modal fade over main page for smoothness */}
          {modalOpen && <div className="modal-bg-fade"></div>}
        </div>
        <BottomNav />
        <div className="watermark-fs">FairSplit</div>
      </div>
    </>
  );
}
