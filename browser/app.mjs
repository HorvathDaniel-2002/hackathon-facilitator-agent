import { STAGES, ROUTES, CAF, CHECKS, TEXT_LIMITS, LIMIT, newCard, newWorkspace, validateWorkspace, backup, parseBackup, csv } from "./model.mjs";
import { openStore } from "./storage.mjs";

const REPO = "https://github.com/HorvathDaniel-2002/hackathon-facilitator-agent";
const root = document.querySelector("#app"), dialog = document.querySelector("#editor");
let store, record = null, page = "board", grouping = "stage", query = "", routeFilter = "All routes";
let busy = false, dirty = false, draftReader, toastTimer;
const clone = value => structuredClone(value);
const el = (tag, props = {}, ...children) => {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (key.startsWith("on")) node.addEventListener(key.slice(2).toLowerCase(), value);
    else if (key === "className") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (value !== false && value !== undefined) node.setAttribute(key, value === true ? "" : value);
  }
  node.append(...children.flat(Infinity).filter(child => child !== null && child !== undefined));
  return node;
};
function message(text, error = false) {
  const notice = document.querySelector("#notice");
  notice.setAttribute("role", error ? "alert" : "status");
  notice.textContent = text;
  clearTimeout(toastTimer);
  if (!error) toastTimer = setTimeout(() => { notice.textContent = ""; }, 6500);
}
function action(fn) {
  return async event => {
    try { await fn(event); }
    catch (error) {
      const formError = dialog.open && dialog.querySelector("#form-error");
      if (formError) { formError.textContent = error.message; formError.focus(); }
      else message(error.message, true);
    }
  };
}
const button = (label, fn, style = "", props = {}) => el("button", { type: "button", className: style, onClick: action(fn), ...props }, label);
const link = (label, href) => el("a", { href, target: "_blank", rel: "noopener noreferrer" }, label);
const badge = (text, style = "") => el("span", { className: `badge ${style}` }, text);
const field = (name, label, value, { options, area = false, maxLength = 2000, type = "text", required = false } = {}) => {
  const control = el(options ? "select" : area ? "textarea" : "input", {
    name, id: `field-${name}`, ...(options || area ? {} : { type }), required,
    ...(options ? {} : { maxlength: maxLength }), ...(type === "date" ? { min: "1900-01-01", max: "9999-12-31" } : {}),
  }, options?.map(option => el("option", { value: option }, option)) || []);
  control.value = value;
  return el("div", { className: "field" }, el("label", { for: `field-${name}` }, label + (required ? " *" : "")), control);
};
function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = el("a", { href: url, download: name });
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function backupDownload(workspace = record.workspace, unsaved = false) {
  download(`hackathon-${unsaved ? "UNSAVED-draft-" : "backup-"}${new Date().toISOString().slice(0, 10)}.json`, backup(workspace), "application/json");
  message(unsaved ? "Unsaved draft download requested. It is not the latest saved workspace." : "Backup download requested. Keep the file somewhere safe.");
}
async function commit(workspace, expectedRevision) {
  if (busy) throw new Error("A save is already in progress. Please wait.");
  validateWorkspace(workspace);
  busy = true;
  const controls = [...document.querySelectorAll("button, input, select, textarea")].map(control => [control, control.disabled]);
  for (const [control] of controls) control.disabled = true;
  const status = document.querySelector("#save-state");
  if (status) status.textContent = "Saving locally...";
  root.setAttribute("aria-busy", "true");
  try { record = await store.save(clone(workspace), expectedRevision); }
  finally {
    busy = false;
    for (const [control, disabled] of controls) control.disabled = disabled;
    if (status) status.textContent = "Saved locally";
    root.removeAttribute("aria-busy");
  }
  message("Saved in this browser.");
}
function finishDialog() {
  dirty = false; draftReader = null; dialog.close(); render();
  document.querySelector("main h1")?.focus();
}
function closeDialog() {
  if (busy) return;
  if (dirty && !confirm("Discard unsaved changes? Your last saved workspace will not change.")) return;
  finishDialog();
}
dialog.addEventListener("cancel", event => { event.preventDefault(); closeDialog(); });
window.addEventListener("beforeunload", event => {
  if (dirty || busy) { event.preventDefault(); event.returnValue = ""; }
});
function openDialog(title, body, submit, { draft, extra = [] } = {}) {
  if (dialog.open) return;
  dirty = false; draftReader = draft;
  const error = el("p", { className: "error", role: "alert", id: "form-error", tabindex: "-1" });
  const form = el("form", { onInput: () => { dirty = true; }, onSubmit: async event => {
    event.preventDefault();
    if (busy) return;
    error.textContent = "";
    try { await submit(form); finishDialog(); }
    catch (failure) { error.textContent = failure.message; error.focus(); }
  } },
  el("header", { className: "dialog-head row spread" }, el("h2", { id: "dialog-title" }, title), button("Close", closeDialog)),
  el("div", { className: "dialog-body stack" }, body, error),
  el("footer", { className: "dialog-footer row spread" },
    el("div", { className: "row" }, extra,
      ...(draft ? [button("Download unsaved draft", () => backupDownload(draftReader(form), true))] : [])),
    el("div", { className: "row" }, button("Reload saved", reloadSaved), button("Cancel", closeDialog), el("button", { type: "submit", className: "primary" }, "Save changes"))));
  dialog.replaceChildren(form);
  dialog.showModal();
}
function editCard(id, stageOverride) {
  const base = clone(record.workspace), revision = record.revision;
  const existing = id ? base.cases.find(card => card.id === id) : null;
  const card = clone(existing || newCard(base.cases));
  if (stageOverride) card[grouping] = stageOverride;
  const section = title => el("h3", { className: "section-title span-two" }, title);
  const f = (key, label, extra) => field(key, label, card[key], { maxLength: TEXT_LIMITS[key], ...extra });
  const body = el("div", { className: "grid-two" },
    section("Use case"),
    f("code", "Code", { required: true }), f("title", "Title", { required: true }),
    f("problem", "Problem to solve", { area: true }), f("outcome", "Desired outcome / success measure", { area: true }),
    section("Progress and delivery"),
    f("stage", "Progress", { options: STAGES }), f("route", "Delivery route", { options: ROUTES }),
    el("p", { className: "hint span-two" }, "Progress and delivery are independent. Statuses record your decisions; they do not deploy anything or submit to CAF."),
    f("businessOwner", "Business owner"), f("technicalOwner", "Technical owner"),
    f("deliveryOwner", "Delivery owner"), f("productionReference", "Production evidence / reference"),
    f("cafStatus", "CAF status", { options: CAF }), f("cafReference", "CAF submission reference"),
    section("Shared handoff"),
    f("nextAction", "Next action", { area: true }), f("nextDate", "Next action date", { type: "date" }),
    f("whatWasBuilt", "What was built", { area: true }), f("results", "Demonstrated results / evidence", { area: true }),
    el("div", { className: "span-two" }, f("gaps", "Gaps, blockers and rollout notes", { area: true })));
  const candidate = form => {
    const data = new FormData(form), updated = { id: card.id };
    for (const key of [...Object.keys(TEXT_LIMITS), "stage", "route", "cafStatus"]) updated[key] = String(data.get(key) ?? "").trim();
    const workspace = clone(base), index = workspace.cases.findIndex(item => item.id === card.id);
    if (index < 0) workspace.cases.push(updated); else workspace.cases[index] = updated;
    return workspace;
  };
  openDialog(existing ? `${card.code} / Use case & handoff` : "New use case", body,
    form => commit(candidate(form), revision), {
      draft: candidate,
      extra: existing ? [button("Delete use case", async () => {
        if (busy || !confirm(`Delete ${card.code}: ${card.title}, including its handoff? Download a backup first if you may need it.`)) return;
        try {
          const next = clone(base); next.cases = next.cases.filter(item => item.id !== card.id);
          await commit(next, revision); finishDialog();
        } catch (error) { const notice = dialog.querySelector("#form-error"); notice.textContent = error.message; notice.focus(); }
      }, "danger")] : [],
    });
  if (stageOverride) dirty = true;
}
function editCheck(index) {
  const base = clone(record.workspace), revision = record.revision, check = base.checks[index];
  const done = el("input", { type: "checkbox", name: "done", id: "field-done" });
  done.checked = check.done;
  const candidate = form => {
    const data = new FormData(form), workspace = clone(base);
    workspace.checks[index] = { id: check.id, done: data.get("done") === "on",
      owner: data.get("owner").trim(), evidence: data.get("evidence").trim(), date: data.get("date") };
    return workspace;
  };
  openDialog(CHECKS[index][1], el("div", { className: "stack" },
    el("p", { className: "muted" }, CHECKS[index][2]),
    el("label", {}, el("span", { className: "row" }, done, "Reviewed / completed")),
    field("owner", "Review owner", check.owner, { maxLength: 160 }),
    field("evidence", "Evidence / reference", check.evidence, { area: true }),
    field("date", "Review date", check.date, { type: "date" }),
    el("p", { className: "hint" }, "Completion requires an owner, evidence and a date. This is a facilitation record, not corporate or production approval.")),
  form => commit(candidate(form), revision), { draft: candidate });
}
function summary() {
  const cases = record.workspace.cases;
  const values = [[cases.length, "use cases"], [cases.filter(c => c.stage === "In production").length, "in production"],
    [cases.filter(c => !c.businessOwner.trim()).length, "need an owner"],
    [cases.filter(c => c.gaps.trim()).length, "with open gaps"]];
  return el("div", { className: "summary" }, values.map(([count, label]) => el("div", {}, el("strong", {}, String(count)), el("span", {}, label))));
}
async function moveCard(id, target) {
  if (dialog.open || busy) return;
  const next = clone(record.workspace), card = next.cases.find(c => c.id === id);
  if (!card) throw new Error("This card no longer exists. Reload the saved workspace.");
  card[grouping] = target;
  if (target === "In production" && (!card.businessOwner.trim() || !card.productionReference.trim())) {
    editCard(id, target); return;
  }
  await commit(next, record.revision); render();
}
function cardTile(card) {
  return el("article", { className: "card", draggable: "true", onDragStart: event => {
    event.dataTransfer.setData("text/plain", card.id); event.dataTransfer.effectAllowed = "move";
  } },
  el("div", { className: "row spread" }, el("span", { className: "code" }, card.code), ...(card.gaps ? [badge("Gap")] : [])),
  button(card.title, () => editCard(card.id), "card-title"),
  badge(grouping === "stage" ? card.route : card.stage),
  el("p", { className: "owner" }, card.businessOwner || "Owner not assigned"),
  el("p", { className: "next" }, card.nextAction || "Set a next action"),
  ...(card.nextDate ? [el("small", {}, `Due ${card.nextDate}`)] : []));
}
function renderBoardContent() {
  const host = document.querySelector("#board-content");
  if (!host) return;
  const visible = record.workspace.cases.filter(card =>
    (routeFilter === "All routes" || card.route === routeFilter) &&
    `${card.code} ${card.title} ${card.businessOwner} ${card.problem}`.toLowerCase().includes(query.toLowerCase()));
  const groups = grouping === "stage" ? STAGES : ROUTES;
  host.className = `board ${grouping === "route" ? "routes" : ""}`;
  host.replaceChildren(...groups.map(group => {
    const cases = visible.filter(card => card[grouping] === group);
    return el("section", { className: "lane", "aria-label": group, onDragOver: event => { event.preventDefault(); event.dataTransfer.dropEffect = "move"; },
      onDrop: action(async event => { event.preventDefault(); await moveCard(event.dataTransfer.getData("text/plain"), group); }) },
    el("header", {}, el("h2", {}, group), badge(String(cases.length))),
    el("div", { className: "lane-list" }, cases.length ? cases.map(cardTile) : el("p", { className: "empty" }, "No use cases")),
    );
  }));
  document.querySelector("#result-count").textContent = `${visible.length} of ${record.workspace.cases.length} use cases`;
}
function boardView() {
  const search = field("search", "Find a use case", query, { type: "search", maxLength: 160 });
  search.lastChild.addEventListener("input", event => { query = event.target.value; renderBoardContent(); });
  const group = field("group", "Group by", grouping === "stage" ? "Progress" : "Delivery route", { options: ["Progress", "Delivery route"] });
  group.lastChild.addEventListener("change", event => { grouping = event.target.value === "Progress" ? "stage" : "route"; renderBoardContent(); });
  const route = field("filter", "Filter delivery route", routeFilter, { options: ["All routes", ...ROUTES] });
  route.lastChild.addEventListener("change", event => { routeFilter = event.target.value; renderBoardContent(); });
  return [
    summary(),
    el("div", { className: "toolbar" }, search, group, route, button("+ New use case", () => editCard(), "primary")),
    el("p", { className: "hint" }, el("span", { id: "result-count" }), " · Open a card to edit its progress and handoff. Drag between columns on desktop."),
    el("div", { id: "board-content", className: "board" }),
  ];
}
function handoffView() {
  return el("div", { className: "stack" },
    el("p", { className: "muted" }, "The same records as your Kanban cards. Select a use case to update its owners, evidence and next action."),
    !record.workspace.cases.length ? el("div", { className: "panel empty" }, "No handoffs yet. Add a use case on the board.") :
      el("div", { className: "panel table-scroll" }, el("table", {},
        el("thead", {}, el("tr", {}, ["Use case", "Progress / route", "Business owner", "Next action", "Due", "CAF"].map(t => el("th", { scope: "col" }, t)))),
        el("tbody", {}, record.workspace.cases.map(card => el("tr", {},
          el("td", {}, el("small", {}, card.code), button(card.title, () => editCard(card.id), "card-title")),
          el("td", {}, card.stage, el("br"), el("small", {}, card.route)),
          el("td", {}, card.businessOwner || "Not assigned"), el("td", {}, card.nextAction || "Not recorded"),
          el("td", {}, card.nextDate || "Not set"), el("td", {}, card.cafStatus)))))));
}
function dashboardView() {
  const now = new Date(), today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  const cases = record.workspace.cases;
  const overdue = cases.filter(c => c.nextDate && c.nextDate < today && !["In production", "Parked"].includes(c.stage));
  const stat = (number, name) => el("div", { className: "stat" }, el("strong", {}, String(number)), name);
  return el("div", { className: "stack" },
    el("div", { className: "stat-grid" }, stat(cases.length, "Total use cases"), stat(overdue.length, "Overdue next actions"),
      stat(cases.filter(c => c.cafStatus === "Submitted").length, "Recorded CAF submissions"),
      stat(cases.filter(c => !c.businessOwner.trim()).length, "Missing business owner"),
      stat(cases.filter(c => !c.nextAction.trim()).length, "Missing next action"),
      stat(record.workspace.checks.filter(c => c.done).length + "/" + CHECKS.length, "Readiness checks recorded")),
    el("section", { className: "panel stack" }, el("h2", {}, "Progress at a glance"),
      STAGES.map(stage => el("div", { className: "bar-row" }, el("span", {}, stage),
        el("progress", { max: Math.max(cases.length, 1), value: cases.filter(c => c.stage === stage).length, "aria-label": stage }),
        el("strong", {}, String(cases.filter(c => c.stage === stage).length))))),
    el("p", { className: "hint" }, "Counts reflect your manually recorded data. Browser Edition does not generate AI scores, submit to CAF or deploy prototypes."));
}
function readinessView() {
  return el("div", { className: "stack" },
    el("p", { className: "muted" }, "A compact workshop checklist. Keep evidence current and revisit it when the scope changes. These checks are not a compliance certification."),
    el("div", { className: "checklist" }, record.workspace.checks.map((check, i) =>
      el("section", { className: "panel check" },
        el("div", { className: "row spread" }, el("h2", {}, CHECKS[i][1]), badge(check.done ? "Recorded" : "Needs review", check.done ? "completed" : "")),
        el("p", { className: "muted" }, CHECKS[i][2]),
        el("p", {}, check.owner ? `Owner: ${check.owner}` : "Owner not assigned"),
        ...(check.date ? [el("small", {}, `Reviewed ${check.date}`)] : []),
        button("Review check", () => editCheck(i))))));
}
function renameWorkspace() {
  const base = clone(record.workspace), revision = record.revision;
  const candidate = form => ({ ...base, name: new FormData(form).get("workspaceName").trim() });
  openDialog("Workspace name", field("workspaceName", "Name", base.name, { required: true, maxLength: 120 }),
    form => commit(candidate(form), revision), { draft: candidate });
}
async function importBackup(file) {
  if (!file) return;
  if (busy) throw new Error("Wait for the current save before importing.");
  const revision = record?.revision ?? 0;
  if (file.size > LIMIT) throw new Error("Backup exceeds the 2 MB import limit.");
  const workspace = parseBackup(await file.text());
  if (!confirm(`Restore "${workspace.name}" (${workspace.cases.length} use cases)? This REPLACES the workspace in this browser. Download your current backup first. No file is uploaded.`)) return;
  await commit(workspace, revision); query = ""; routeFilter = "All routes"; render();
}
function importControl() {
  const input = el("input", { type: "file", accept: ".json,application/json", "aria-label": "Select browser backup", onChange: action(async event => {
    try { await importBackup(event.target.files[0]); } finally { event.target.value = ""; }
  }) });
  return el("label", {}, "Restore a Browser Edition backup (.json)", input);
}
async function reloadSaved() {
  if (busy) return;
  if (dirty && !confirm("Discard the open draft and reload the saved workspace? Download the unsaved draft first if needed.")) return;
  const latest = await store.read();
  record = latest; dirty = false; dialog.close(); draftReader = null; render();
  message("Reloaded the saved workspace.");
}
function dataView() {
  return el("div", { className: "stack" },
    el("section", { className: "panel stack" }, el("h2", {}, "Your workspace, your browser"),
      el("p", {}, "Saved only in this browser profile on this device. There is no account, cloud backup, cross-device sync or shared team workspace."),
      el("p", {}, "Clearing site data, private browsing or browser cleanup can remove your work. Download a JSON backup regularly and before switching devices. CSV is a report, not a restorable backup."),
      el("div", { className: "row" }, button("Download JSON backup", () => backupDownload(), "primary"),
        button("Export portfolio CSV", () => download("hackathon-portfolio.csv", csv(record.workspace), "text/csv;charset=utf-8")),
        button("Rename workspace", renameWorkspace))),
    el("section", { className: "panel stack" }, el("h2", {}, "Restore or move to another device"),
      el("p", {}, "Import a JSON backup created by this Browser Edition. You will be asked before anything is replaced. Desktop SQLite databases and older app exports are not compatible."),
      importControl(), button("Reload saved workspace", reloadSaved),
      button("Start a new empty workspace", async () => {
        if (!confirm("Replace this workspace with an empty one? Download a JSON backup first. This cannot be undone without your backup.")) return;
        await commit(newWorkspace("My hackathon"), record.revision); query = ""; routeFilter = "All routes"; render();
      }, "danger")),
    el("section", { className: "panel stack" }, el("h2", {}, "Privacy and scope"),
      el("p", {}, "This app has no analytics, no live AI and no workspace upload. GitHub Pages serves the public app files and can process normal web request metadata. External links open only when you select them."),
      el("p", {}, "Browser storage is not an access-control or encryption boundary. Other scripts on the same GitHub Pages origin and anyone using this browser profile can potentially access it. Use only approved, non-sensitive information. Do not enter credentials, regulated data or confidential customer records."),
      el("p", {}, "A lightweight companion to the desktop app, not the complete server-backed toolkit. It includes Kanban, shared handoffs, a compact readiness checklist and exports. It does not include AI evaluation, accounts, audit history, server integrations or automatic desktop migration."),
      el("p", {}, "No corporate approval is implied. Network/browser policies can still restrict access; do not disable them."),
      el("div", { className: "row" }, link("Full toolkit and materials", REPO), link("Browser guide", `${REPO}/blob/main/browser/README.md`))),
  );
}
function renderWelcome() {
  const name = field("workspaceName", "Workspace name", "My hackathon", { required: true, maxLength: 120 });
  const start = async sample => {
    if (busy) return;
    const workspace = newWorkspace(sample ? "Contoso workshop · fictional sample" : name.lastChild.value.trim(), sample);
    await commit(workspace, 0); render();
  };
  root.replaceChildren(el("main", { id: "main", className: "onboarding stack" },
    el("div", { className: "brand" }, el("img", { src: "./icon.png", alt: "" }), "Hackathon Facilitator", badge("Browser Edition", "edition")),
    el("p", { className: "eyebrow" }, "Open. Organize. Follow through."),
    el("h1", {}, "From hackathon idea", el("br"), "to an owned next step."),
    el("p", { className: "lead" }, "Your Kanban board, readiness checks and handoffs. No installer, login, subscription or setup."),
    el("p", { className: "hint" }, "This is a lightweight companion, not the original full app. ",
      link("Download the full Windows application", `${REPO}/releases/latest`)),
    el("div", { className: "choices" },
      el("section", { className: "panel stack" }, el("h2", {}, "Start your own workspace"), name, button("Create empty workspace", () => start(false), "primary")),
      el("section", { className: "panel stack" }, el("h2", {}, "Take a quick look"), el("p", { className: "muted" }, "Start with three fictional use cases. Edit them, move cards and explore the shared handoff."),
        button("Try fictional sample", () => start(true)))),
    el("div", { className: "panel stack" }, el("h2", {}, "Local means local"),
      el("p", {}, "Your work is stored in this browser only, not uploaded or shared with other people. Download backups regularly. Private browsing and clearing site data can erase it. Use approved, non-sensitive information."),
      importControl()),
    el("p", { className: "hint" }, "Created by Daniel Horvath · ", link("dahorvath@microsoft.com", "mailto:dahorvath@microsoft.com"),
      " · Experimental MVP, not an official Microsoft product. ", link("Full toolkit", REPO))));
}
const PAGES = { board: ["Kanban", "Make the next step visible"], dashboard: ["Dashboard", "A snapshot of your workspace"],
  handoff: ["Handoffs", "Keep ownership and follow-up connected"], readiness: ["Readiness", "Evidence before confidence"], data: ["Data & help", "Keep a backup. Stay in control."] };
function render() {
  if (!record) { renderWelcome(); return; }
  const sidebar = el("aside", { className: "sidebar" },
    el("div", { className: "brand" }, el("img", { src: "./icon.png", alt: "" }), el("span", {}, "Hackathon", el("br"), "Facilitator")),
    el("div", {}, badge("Browser Edition", "edition")),
    el("nav", { "aria-label": "Workspace" }, Object.entries(PAGES).map(([id, [title]]) =>
      button(title, () => { page = id; render(); }, "", { "aria-current": page === id ? "page" : undefined }))),
    el("footer", {}, el("strong", {}, "Created by Daniel Horvath"), link("dahorvath@microsoft.com", "mailto:dahorvath@microsoft.com"),
      link("Full Windows application", `${REPO}/releases/latest`), link("GitHub & materials", REPO),
      el("span", {}, "Local-only companion · No live AI"), el("span", {}, "Not an official Microsoft product.")));
  const main = el("main", { id: "main", className: page === "board" ? "board-view" : "" },
    el("div", { className: "topbar row spread" }, el("span", {}, record.workspace.name),
      el("div", { className: "row" }, el("span", { className: "badge", id: "save-state" }, "Saved locally"), button("Backup", () => backupDownload()))),
    el("div", { className: "title-block" }, el("p", { className: "eyebrow" }, PAGES[page][1]), el("h1", { tabindex: "-1" }, PAGES[page][0]),
      el("p", { className: "muted" }, page === "board" ? "One board for progress. One shared handoff for every use case." : "Single-user browser workspace · changes stay on this device.")),
    page === "board" ? boardView() : page === "handoff" ? handoffView() :
      page === "dashboard" ? dashboardView() : page === "readiness" ? readinessView() : dataView());
  root.replaceChildren(el("div", { className: "layout" }, sidebar, main));
  if (page === "board") renderBoardContent();
}
window.addEventListener("focus", action(async () => {
  if (!store || dialog.open || busy) return;
  const latest = await store.read();
  if ((latest?.revision ?? 0) !== (record?.revision ?? 0)) { record = latest; render(); message("Loaded changes saved by another tab."); }
}));

try {
  store = await openStore(); record = await store.read(); render();
} catch (error) {
  root.replaceChildren(el("main", { id: "main", className: "onboarding stack" },
    el("h1", {}, "Workspace unavailable"),
    el("p", { className: "error", role: "alert" }, error.message),
    el("p", {}, "No saved data was deleted or replaced. Do not clear site data if you need to recover an existing workspace."),
    button("Retry", () => location.reload()), link("No-install Word / PowerPoint materials", `${REPO}/tree/main/materials`)));
}
