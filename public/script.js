let S = { people: [], expenses: [], phones: {} },
  R = [],
  ME = null,
  TOK = localStorage.getItem("tok") || "",
  AM = "login",
  T = "exp",
  F = { title: "", amount: "", payer: "", parts: null },
  armed = false;
const val = (id) => ((document.getElementById(id) || {}).value || "").trim();
async function api(m, u, b) {
  const r = await fetch("/api" + u, {
    method: m,
    headers: {
      "Content-Type": "application/json",
      ...(TOK ? { Authorization: "Bearer " + TOK } : {}),
    },
    body: b ? JSON.stringify(b) : undefined,
  });
  let d = {};
  try {
    d = await r.json();
  } catch (e) {}
  if (r.status === 401 && TOK && u !== "/login") {
    TOK = "";
    localStorage.removeItem("tok");
    ME = null;
    render();
  }
  if (!r.ok) throw new Error(d.error || "Something went wrong");
  return d;
}
async function load() {
  if (!TOK) return render();
  try {
    const d = await api("GET", "/state");
    ME = d.me;
    R = d.people;
    S.people = R.map((p) => p.name);
    S.phones = Object.fromEntries(R.map((p) => [p.name, p.phone || ""]));
    S.expenses = d.expenses.map((e) => ({ ...e, id: e._id }));
  } catch (e) {
    toast("Cannot reach server");
  }
  render();
}
const esc = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const fmt = (p) =>
  "Rs. " +
  (p / 100).toLocaleString("en-PK", {
    minimumFractionDigits: p % 100 ? 2 : 0,
    maximumFractionDigits: 2,
  });
const dt = (t) =>
  new Date(t).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
const waNum = (n) => {
  let d = (S.phones[n] || "").replace(/\D/g, "");
  if (!d) return "";
  if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "92" + d.slice(1);
  else if (d.length === 10 && d[0] === "3") d = "92" + d;
  return d;
};
const hue = (n) => {
  let h = 0;
  for (const c of n) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
};
const av = (n) =>
  `<span class="av" style="background:hsl(${hue(n)} 60% 48%)">${esc(n[0].toUpperCase())}</span>`;
function toast(m) {
  const t = document.getElementById("toast");
  t.textContent = m;
  t.classList.add("show");
  clearTimeout(toast.i);
  toast.i = setTimeout(() => t.classList.remove("show"), 2200);
}
function shares(e) {
  const n = e.parts.length,
    b = Math.floor(e.amount / n),
    r = e.amount - b * n;
  return e.parts.map((p, i) => [p, b + (i < r ? 1 : 0)]);
}
function balances() {
  const b = {};
  S.people.forEach((p) => (b[p] = 0));
  S.expenses.forEach((e) => {
    b[e.payer] += e.amount;
    shares(e).forEach(([p, v]) => (b[p] -= v));
  });
  return b;
}
function settle() {
  const b = balances(),
    d = [],
    c = [];
  for (const p in b) {
    if (b[p] < 0) d.push([p, -b[p]]);
    else if (b[p] > 0) c.push([p, b[p]]);
  }
  d.sort((x, y) => y[1] - x[1]);
  c.sort((x, y) => y[1] - x[1]);
  const o = [];
  let i = 0,
    j = 0;
  while (i < d.length && j < c.length) {
    const m = Math.min(d[i][1], c[j][1]);
    o.push([d[i][0], c[j][0], m]);
    d[i][1] -= m;
    c[j][1] -= m;
    if (!d[i][1]) i++;
    if (!c[j][1]) j++;
  }
  return o;
}
function viewExp() {
  const P = S.people;
  if (P.length < 2)
    return (
      `<div class="card empty">${ME.role === "admin" ? 'Add at least two people first 👥<button class="btn" data-a="tab" data-v="ppl">Add people</button>' : "Waiting for the admin to add people 👥"}</div>` +
      list()
    );
  if (!P.includes(F.payer)) F.payer = P[0];
  if (!F.parts) F.parts = [...P];
  F.parts = F.parts.filter((p) => P.includes(p));
  return (
    `<div class="card"><h2>Add expense</h2>
 <label>What was it for?</label><input id="f-title" placeholder="Dinner, petrol, chai…" value="${esc(F.title)}">
 <div class="two"><div><label>Amount (Rs.)</label><input id="f-amt" type="number" inputmode="decimal" min="0" placeholder="2400" value="${esc(F.amount)}"></div>
 <div><label>Paid by</label><select id="f-payer">${P.map((p) => `<option ${p === F.payer ? "selected" : ""}>${esc(p)}</option>`).join("")}</select></div></div>
 <label>Who participated?</label><div class="chips">${P.map((p) => `<button class="chip ${F.parts.includes(p) ? "on" : ""}" data-a="part" data-v="${esc(p)}">${esc(p)}</button>`).join("")}</div>
 <button class="btn" data-a="addexp">Split it</button></div>` + list()
  );
}
function list() {
  if (!S.expenses.length)
    return `<div class="empty">No expenses yet. Add your first one ☝️</div>`;
  return (
    `<h2>Expenses</h2>` +
    [...S.expenses]
      .reverse()
      .map((e) => {
        const sh = shares(e),
          m = Object.fromEntries(sh);
        const rows = [e.payer, ...e.parts.filter((p) => p !== e.payer)]
          .map((p) =>
            p === e.payer
              ? `<div class="ln"><span class="who">${av(p)}${esc(p)} paid</span><span class="pay">${fmt(e.amount)}${m[p] != null ? ` <span class="mut">· share ${fmt(m[p])}</span>` : ""}</span></div>`
              : `<div class="ln"><span class="who">${av(p)}${esc(p)} owes</span><span class="owe">${fmt(m[p])}</span></div>`,
          )
          .join("");
        return `<div class="card"><div class="ex-h"><div><b>${esc(e.title)}</b><div class="mut">${fmt(e.amount)} · Paid by ${esc(e.payer)} · ${e.parts.length} people</div><div class="mut">📅 ${dt(e.date || e.id)}</div></div>${ME.role === "admin" || e.addedBy === ME.id ? `<button class="x" data-a="delexp" data-v="${e.id}" aria-label="Delete">×</button>` : ""}</div><div class="lines">${rows}</div></div>`;
      })
      .join("")
  );
}
function viewPpl() {
  const b = balances(),
    ad = ME.role === "admin";
  return (
    (ad
      ? `<div class="card"><h2>Add people</h2><div class="add"><input id="p-in" placeholder="Imran, Ali, Ahmed"><button class="btn sm" data-a="addp">Add</button></div></div>`
      : `<p class="sub">Only the admin can add or remove people.</p>`) +
    (S.people.length
      ? S.people
          .map((p) => {
            const v = b[p];
            return `<div class="card"><div class="set"><span class="who">${av(p)}${esc(p)}</span><span>${v ? `<span class="${v > 0 ? "pay" : "owe"}">${v > 0 ? "gets back" : "owes"} ${fmt(Math.abs(v))}</span>` : '<span class="mut">settled</span>'} ${ad ? `<button class="x" data-a="delp" data-v="${esc(p)}" aria-label="Remove">×</button>` : ""}</span></div>${ad ? `<label>WhatsApp number</label><input class="ph" data-p="${esc(p)}" type="tel" inputmode="tel" placeholder="0300 1234567" value="${esc(S.phones[p] || "")}">` : ""}</div>`;
          })
          .join("")
      : `<div class="empty">No one here yet 🙌</div>`)
  );
}
function viewSet() {
  const s = settle(),
    b = balances();
  const row = ([a, c, m]) => {
    const n = waNum(a),
      msg = `Assalam o Alaikum ${a}! Reminder from our expense splitter: you owe ${c} ${fmt(m)}. Please pay when you can. Thanks! 🙏`;
    const btn = n
      ? `<a class="wa" target="_blank" rel="noopener" href="https://wa.me/${n}?text=${encodeURIComponent(msg)}">💬 Remind ${esc(a)} on WhatsApp</a>`
      : ME.role === "admin"
        ? `<button class="wa off" data-a="tab" data-v="ppl">Add ${esc(a)}'s WhatsApp number</button>`
        : "";
    return `<div class="srow"><div class="set ln"><span class="who">${av(a)}<span>${esc(a)} <span class="arrow">→</span> ${esc(c)}</span></span><span class="amt">${fmt(m)}</span></div>${btn}</div>`;
  };
  return `<div class="card"><h2>Final settlement</h2>${s.length ? s.map(row).join("") : `<div class="empty">${S.expenses.length ? "All settled 🎉" : "Nothing to settle yet"}</div>`}</div>
 <div class="card"><h2>Balances</h2>${S.people.map((p) => `<div class="ln"><span class="who">${av(p)}${esc(p)}</span><span class="${b[p] > 0 ? "pay" : b[p] < 0 ? "owe" : "mut"}">${b[p] > 0 ? "+" : b[p] < 0 ? "−" : ""}${fmt(Math.abs(b[p]))}</span></div>`).join("") || '<div class="empty">No people</div>'}</div>`;
}
function viewAuth() {
  const reg = AM === "register";
  return `<h1>Split it 💸</h1><p class="sub">${reg ? "Create your account once — you stay logged in." : "Log in to continue."}</p><div class="card">${reg ? '<label>Your name</label><input id="a-name" placeholder="Imran">' : ""}<label>Username</label><input id="a-user" autocapitalize="none" autocomplete="username" placeholder="imran"><label>Password</label><input id="a-pass" type="password" autocomplete="${reg ? "new-password" : "current-password"}" placeholder="min 6 characters"><button class="btn" data-a="auth">${reg ? "Create account" : "Log in"}</button><button class="btn ghost" data-a="swap">${reg ? "I already have an account" : "New here? Create account"}</button></div>`;
}
function render() {
  if (!ME) {
    document.getElementById("nav").innerHTML = "";
    document.getElementById("app").innerHTML = viewAuth();
    return;
  }
  const tot = S.expenses.reduce((a, e) => a + e.amount, 0);
  document.getElementById("app").innerHTML =
    `<div class="top"><div><h1>Split it 💸</h1><p class="sub">${esc(ME.name)} · ${ME.role}</p></div><button class="x" data-a="logout" title="Log out" aria-label="Log out">⎋</button></div>
 <div class="hero"><small>Total spent</small><b>${fmt(tot)}</b><div class="row"><span class="pill">${S.expenses.length} expenses</span><span class="pill">${S.people.length} people</span></div></div>` +
    (T === "exp" ? viewExp() : T === "ppl" ? viewPpl() : viewSet());
  document.getElementById("nav").innerHTML = [
    ["exp", "🧾", "Expenses"],
    ["ppl", "👥", "People"],
    ["set", "🤝", "Settle"],
  ]
    .map(
      ([k, i, l]) =>
        `<button class="${T === k ? "on" : ""}" data-a="tab" data-v="${k}"><span>${i}</span>${l}</button>`,
    )
    .join("");
}
async function addPeople() {
  const names = val("p-in")
    .split(/[,،\n]/)
    .map((x) => x.trim())
    .filter(Boolean);
  if (!names.length) return toast("Type a name first");
  try {
    const d = await api("POST", "/people", { names });
    F.parts = null;
    await load();
    toast(d.added + " added");
  } catch (e) {
    toast(e.message);
  }
}
document.addEventListener("click", async (ev) => {
  const t = ev.target.closest("[data-a]");
  if (!t) return;
  const a = t.dataset.a,
    v = t.dataset.v;
  try {
    if (a === "tab") {
      T = v;
      render();
    } else if (a === "swap") {
      AM = AM === "login" ? "register" : "login";
      render();
    } else if (a === "auth") {
      const b = {
        username: val("a-user"),
        password: document.getElementById("a-pass").value,
      };
      if (AM === "register") b.name = val("a-name");
      const d = await api("POST", "/" + AM, b);
      TOK = d.token;
      localStorage.setItem("tok", TOK);
      await load();
    } else if (a === "logout") {
      TOK = "";
      localStorage.removeItem("tok");
      ME = null;
      S = { people: [], expenses: [], phones: {} };
      render();
    } else if (a === "addp") await addPeople();
    else if (a === "delp") {
      await api("DELETE", "/people/" + R.find((p) => p.name === v)._id);
      F.parts = null;
      await load();
    } else if (a === "part") {
      F.parts = F.parts.includes(v)
        ? F.parts.filter((p) => p !== v)
        : [...F.parts, v];
      render();
    } else if (a === "addexp") {
      const amt = Math.round(parseFloat(F.amount) * 100);
      if (!F.title.trim()) return toast("Add a title");
      if (!(amt > 0)) return toast("Enter a valid amount");
      if (!F.parts.length) return toast("Select participants");
      await api("POST", "/expenses", {
        title: F.title.trim(),
        amount: amt,
        payer: F.payer,
        parts: S.people.filter((p) => F.parts.includes(p)),
      });
      F.title = "";
      F.amount = "";
      await load();
      toast("Expense added");
    } else if (a === "delexp") {
      await api("DELETE", "/expenses/" + v);
      await load();
    }
  } catch (e) {
    toast(e.message);
  }
});
document.addEventListener("input", (e) => {
  const i = e.target.id;
  if (i === "f-title") F.title = e.target.value;
  else if (i === "f-amt") F.amount = e.target.value;
  else if (i === "f-payer") F.payer = e.target.value;
});
document.addEventListener("change", async (e) => {
  if (e.target.classList.contains("ph")) {
    const p = R.find((x) => x.name === e.target.dataset.p);
    try {
      await api("PATCH", "/people/" + p._id, { phone: e.target.value.trim() });
      S.phones[p.name] = e.target.value.trim();
      toast("Number saved");
    } catch (x) {
      toast(x.message);
    }
  }
});
document.addEventListener("keydown", (e) => {
  if (e.key !== "Enter") return;
  if (e.target.id === "p-in") addPeople();
  if (e.target.id === "a-pass")
    document.querySelector('[data-a="auth"]').click();
});
load();
