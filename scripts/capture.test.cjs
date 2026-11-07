// Run with: node --test scripts/capture.test.cjs
// Synthetic DOM only: no signed-in browser, network, or private messages.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "..", "content.js"), "utf8");

class Element {
  constructor(role = null, text = "", style = {}) {
    this.attrs = role ? { role } : {};
    this.innerText = this.textContent = text;
    this.children = [];
    this.parentElement = null;
    this.isConnected = true;
    this.clientHeight = 400;
    this.scrollHeight = 2000;
    this.position = 0;
    this.style = { overflowY: "visible", flexDirection: "column", ...style };
  }
  get scrollTop() { return this.position; }
  set scrollTop(value) {
    if (!/^(auto|scroll|overlay)$/.test(this.style.overflowY)) return;
    const distance = Math.max(0, this.scrollHeight - this.clientHeight);
    this.position = this.style.flexDirection === "column-reverse"
      ? Math.min(0, Math.max(-distance, value))
      : Math.max(0, Math.min(distance, value));
  }
  append(...children) {
    for (const child of children) {
      this.children.push(child);
      child.parentElement = this;
    }
    return this;
  }
  getAttribute(name) { return this.attrs[name] ?? null; }
  querySelectorAll(selector) {
    const descendants = this.children.flatMap(c => [c, ...c.querySelectorAll("*")]);
    if (selector === "*" || selector === "div") return descendants;
    const roles = Array.from(selector.matchAll(/\[role=["']([^"']+)["']\]/g), m => m[1]);
    return descendants.filter(c => roles.includes(c.getAttribute("role")));
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function harness(settings = {}, { parentScroll = false, reversed = false, deferredStorage = false } = {}) {
  let time = 0;
  let nextTimer = 0;
  let listener;
  let releaseStorage;
  const intervals = new Map();
  const observers = [];
  const main = new Element("main");
  const root = new Element("grid", "", { overflowY: parentScroll ? "visible" : "auto" });
  const scroller = parentScroll ? new Element(null, "", { overflowY: "auto" }) : root;
  if (reversed) scroller.style.flexDirection = "column-reverse";
  scroller.scrollTop = reversed ? 0 : 800;
  root.append(new Element("row", "Synthetic current message"));
  if (parentScroll) main.append(scroller.append(root)); else main.append(root);
  const document = {
    title: "Synthetic thread | Messenger",
    querySelectorAll(selector) { return main.querySelectorAll(selector); },
    querySelector(selector) {
      if (selector === '[role="main"]') return main;
      return main.querySelector(selector);
    },
  };
  const location = { href: "https://www.messenger.com/t/synthetic", origin: "https://www.messenger.com" };
  const storageSettings = { pacing: "fast", maxScrolls: 2000, ...settings };
  const context = vm.createContext({
    window: {}, document, location, URL, console,
    getComputedStyle: el => el.style,
    setInterval(fn, ms) {
      const id = ++nextTimer;
      intervals.set(id, { fn, ms, next: time + ms });
      return id;
    },
    clearInterval: id => intervals.delete(id),
    MutationObserver: class {
      constructor(fn) { this.fn = fn; this.active = false; observers.push(this); }
      observe(target, options) { this.target = target; this.options = options; this.active = true; }
      disconnect() { this.active = false; }
    },
    chrome: {
      storage: { local: { get: () => deferredStorage
        ? new Promise(resolve => { releaseStorage = () => resolve(storageSettings); })
        : Promise.resolve(storageSettings) } },
      runtime: { onMessage: { addListener(fn) { listener = fn; } } },
    },
  });
  vm.runInContext(source, context);
  const send = (type, more = {}) => new Promise(resolve => listener({ type, ...more }, {}, resolve));
  async function tick(ms) {
    const end = time + ms;
    while (true) {
      const next = Array.from(intervals.entries()).filter(([,t]) => t.next <= end)
        .sort((a,b) => a[1].next - b[1].next)[0];
      if (!next) break;
      const [id, timer] = next;
      time = timer.next;
      timer.next += timer.ms;
      await timer.fn();
      await Promise.resolve();
      if (!intervals.has(id)) continue;
    }
    time = end;
  }
  async function mutate(target, mutation) {
    for (const observer of observers) {
      if (!observer.active || observer.target !== target) continue;
      if (mutation.type === "characterData" && !observer.options.characterData) continue;
      if (mutation.type === "attributes" && (!observer.options.attributes ||
          !observer.options.attributeFilter.includes(mutation.attributeName))) continue;
      await observer.fn([mutation]);
    }
  }
  function replaceRoot(next = new Element("grid", "", { overflowY: "auto" })) {
    root.isConnected = false;
    main.children = [];
    if (next) main.append(next);
    return next;
  }
  return { root, scroller, main, location, intervals, observers, tick, mutate, replaceRoot, send,
    releaseStorage: () => releaseStorage(), status: () => send("GET_STATUS") };
}

async function start(h) { assert.equal((await h.send("START_CAPTURE")).ok, true); }

test("auto-scroll survives a delayed page at the top, even with unchanged virtualized height", async () => {
  const h = harness({ maxScrolls: 5 });
  h.scroller.scrollTop = 0;
  await start(h);
  await h.tick(60000);
  assert.equal((await h.status()).capturing, true);
  assert.equal((await h.status()).total, 1);
  h.root.append(new Element("row", "Synthetic older page after a long wait"));
  // Messenger reanchors after prepending; a virtualized list need not grow.
  h.scroller.scrollTop = 900;
  await h.tick(1500);
  assert.ok(h.scroller.scrollTop < 900, "scrolling must resume without Stop/Start");
  assert.equal((await h.status()).total, 2);
});

test("scrolls the overflow ancestor rather than the non-scrollable semantic grid", async () => {
  const h = harness({}, { parentScroll: true });
  await start(h);
  await h.tick(1000);
  assert.ok(h.scroller.scrollTop < 800);
  assert.equal(h.root.scrollTop, 0);
});

test("supports negative scroll offsets in a reversed flex message list", async () => {
  const h = harness({}, { reversed: true });
  await start(h);
  await h.tick(1000);
  assert.ok(h.scroller.scrollTop < 0);
  h.scroller.scrollTop = -1600;
  await h.tick(5000);
  h.scroller.scrollHeight = 3000;
  await h.tick(1000);
  assert.ok(h.scroller.scrollTop < -1600);
});

test("reattaches when React replaces the message root without changing the URL", async () => {
  const h = harness();
  await start(h);
  const next = h.replaceRoot().append(new Element("row", "Synthetic replacement message"));
  next.scrollTop = 800;
  await h.tick(3000);
  assert.equal((await h.status()).total, 2);
  assert.ok(next.scrollTop < 800);
  assert.equal(h.observers.filter(o => o.active).length, 1);
  assert.equal(h.observers.find(o => o.active).target, next);
});

test("recovers after the message root is temporarily absent", async () => {
  const h = harness();
  await start(h);
  h.replaceRoot(null);
  await h.tick(10000);
  const next = h.replaceRoot().append(new Element("row", "Synthetic delayed replacement"));
  next.scrollTop = 800;
  await h.tick(3000);
  assert.equal((await h.status()).total, 2);
  assert.ok(next.scrollTop < 800);
});

test("captures recycled text nodes immediately in manual mode", async () => {
  const h = harness({ pacing: "off" });
  await start(h);
  h.root.children[0].innerText = "Synthetic recycled message";
  await h.mutate(h.root, { type: "characterData", addedNodes: [], removedNodes: [] });
  assert.equal((await h.status()).total, 2);
});

test("captures newly rendered accessible metadata", async () => {
  const h = harness({ pacing: "off" });
  await start(h);
  h.root.children[0].attrs["aria-label"] = "Synthetic sender sent message at 2026-11-07T10:00:00Z";
  await h.mutate(h.root, { type: "attributes", attributeName: "aria-label", addedNodes: [] });
  const output = await h.send("EXPORT");
  assert.ok(output.messages.some(m => m.timestamp === "2026-11-07T10:00:00Z"));
});

test("scroll limit is visible while manual capture remains active; Resume gets a new budget", async () => {
  const h = harness({ maxScrolls: 1 });
  await start(h);
  await h.tick(2000);
  assert.equal((await h.status()).autoScrollStatus, "limit");
  h.root.append(new Element("row", "Synthetic message after limit"));
  await h.mutate(h.root, { type: "childList", addedNodes: [{}], removedNodes: [] });
  assert.equal((await h.status()).total, 2);
  const before = h.scroller.scrollTop;
  await h.send("STOP_CAPTURE");
  await start(h);
  await h.tick(1000);
  assert.ok(h.scroller.scrollTop < before);
  assert.equal((await h.status()).total, 2);
});

test("stop disconnects observers and every timer", async () => {
  const h = harness();
  await start(h);
  await h.send("STOP_CAPTURE");
  assert.equal(h.intervals.size, 0);
  assert.equal(h.observers.some(o => o.active), false);
  h.root.append(new Element("row", "Synthetic ignored after stop"));
  await h.tick(3000);
  assert.equal((await h.status()).total, 1);
});

test("a pending storage read cannot restart capture after Stop", async () => {
  const h = harness({}, { deferredStorage: true });
  const pending = h.send("START_CAPTURE");
  await h.send("STOP_CAPTURE");
  h.releaseStorage();
  await pending;
  assert.equal((await h.status()).capturing, false);
  assert.equal(h.intervals.size, 0);
});

test("navigation waits for the new thread and exports only that thread", async () => {
  const h = harness();
  await start(h);
  h.location.href = "https://www.messenger.com/t/other-synthetic";
  await h.tick(3000);
  assert.equal((await h.status()).total, 1);
  const next = h.replaceRoot().append(new Element("row", "Other synthetic conversation"));
  next.scrollTop = 800;
  await h.tick(3000);
  const output = await h.send("EXPORT");
  assert.equal(output.messages.length, 1);
  assert.equal(output.messages[0].text, "Other synthetic conversation");
  assert.deepEqual(Object.keys(output.messages[0]).sort(),
    ["attachments", "direction", "reactions", "sender", "text", "timestamp"]);
});

test("manual mode recovers from root replacement without starting automatic scrolling", async () => {
  const h = harness({ pacing: "off" });
  await start(h);
  const next = h.replaceRoot().append(new Element("row", "Manual synthetic replacement"));
  next.scrollTop = 800;
  await h.tick(3000);
  assert.equal((await h.status()).total, 2);
  assert.equal(next.scrollTop, 800);
});


test("resolves a scrollable child inside a semantic grid", async () => {
  const h = harness();
  h.root.style.overflowY = "visible";
  const inner = new Element(null, "", { overflowY: "auto" });
  const rows = h.root.children;
  h.root.children = [];
  inner.append(...rows);
  h.root.append(inner);
  inner.scrollTop = 800;
  await start(h);
  await h.tick(1000);
  assert.ok(inner.scrollTop < 800);
});
