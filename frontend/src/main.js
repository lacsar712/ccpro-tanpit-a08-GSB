import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };
const DITCH_LABELS = { clear: "畅通", silted: "淤塞" };

function todayStr() {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

async function api(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body) headers["Content-Type"] = "application/json";
  const t = localStorage.getItem(TOKEN_KEY);
  if (t) headers.Authorization = `Bearer ${t}`;
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.detail || "请求失败");
  return data;
}

class TanYard extends LitElement {
  static properties = {
    ready: { type: Boolean },
    view: { type: String },
    board: { type: Object },
    picked: { type: Object },
    ph: { type: String },
    err: { type: String },
    username: { type: String },
    password: { type: String },
    role: { type: String },
    flags: { type: Array },
    flagDate: { type: String },
    flagState: { type: String },
    filterDay: { type: String },
    filterState: { type: String },
    filterValid: { type: String },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .wrap { max-width: 880px; margin: 0 auto; padding: 28px 16px 50px; }
    .tabs { display: flex; gap: 8px; margin-bottom: 18px; border-bottom: 2px solid #d8c9b4; padding-bottom: 10px; }
    .tabs button { border: 1px solid #b39b7a; background: #f4ecdf; border-radius: 6px; cursor: pointer; }
    .tabs button.on { background: #8a5a2b; color: #fff; border-color: #8a5a2b; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .err { color: #9b1c1c; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    .ditch { border-radius: 6px; padding: 8px 12px; }
    .ditch.clear { background: #e3efe0; color: #2f5d2a; }
    .ditch.silted { background: #f6e2de; color: #8c2f22; }
    .ditch.none { background: #eee7db; color: #6b5a48; }
    table { border-collapse: collapse; width: 100%; margin-top: 12px; }
    th, td { border: 1px solid #d8c9b4; padding: 6px 10px; text-align: left; }
    th { background: #f4ecdf; }
    tr.void td { color: #9a8a76; text-decoration: line-through; }
    tr.void td:last-child { text-decoration: none; }
    .bar { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; margin: 10px 0; }
    label { display: block; margin: 8px 0; }
    input, button, select { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
  `;

  constructor() {
    super();
    this.ready = Boolean(localStorage.getItem(TOKEN_KEY));
    this.view = "board";
    this.board = null;
    this.picked = null;
    this.ph = "4.2";
    this.err = "";
    this.username = "admin";
    this.password = "123456";
    this.role = "";
    this.flags = [];
    this.flagDate = todayStr();
    this.flagState = "clear";
    this.filterDay = "";
    this.filterState = "";
    this.filterValid = "";
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.ready) {
      this.loadMe();
      this.refresh();
    }
  }

  async loadMe() {
    try {
      const me = await api("/api/auth/me");
      this.role = me.role;
    } catch (e) {
      this.err = e.message;
    }
  }

  async refresh() {
    try {
      this.board = await api("/api/board");
      if (this.picked) {
        this.picked = this.board.pits.find((p) => p.id === this.picked.id) || this.board.pits[0];
      }
    } catch (e) {
      this.err = e.message;
    }
  }

  async loadFlags() {
    const q = new URLSearchParams();
    if (this.filterDay) q.set("day", this.filterDay);
    if (this.filterState) q.set("state", this.filterState);
    if (this.filterValid) q.set("valid", this.filterValid);
    try {
      const data = await api(`/api/ditch-flags?${q}`);
      this.flags = data.flags;
    } catch (e) {
      this.err = e.message;
    }
  }

  switchView(view) {
    this.err = "";
    this.view = view;
    if (view === "ditch") this.loadFlags();
    if (view === "board") this.refresh();
  }

  async login(e) {
    e.preventDefault();
    this.err = "";
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      localStorage.setItem(TOKEN_KEY, data.access_token);
      this.role = data.user.role;
      this.ready = true;
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async writePh() {
    this.err = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/samples`, {
        method: "POST",
        body: JSON.stringify({ ph: Number(this.ph) }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async setStatus(status) {
    this.err = "";
    try {
      this.picked = await api(`/api/pits/${this.picked.id}/status`, {
        method: "POST",
        body: JSON.stringify({ status }),
      });
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async createFlag() {
    this.err = "";
    try {
      await api("/api/ditch-flags", {
        method: "POST",
        body: JSON.stringify({ state: this.flagState, check_date: this.flagDate || null }),
      });
      await Promise.all([this.loadFlags(), this.refresh()]);
    } catch (ex) {
      this.err = ex.message;
    }
  }

  async voidFlag(id) {
    this.err = "";
    try {
      await api(`/api/ditch-flags/${id}/void`, { method: "POST" });
      await Promise.all([this.loadFlags(), this.refresh()]);
    } catch (ex) {
      this.err = ex.message;
    }
  }

  renderBoard() {
    if (!this.board) return html`${this.err || "装载坑位…"}`;
    const ditch = this.board.ditch;
    return html`
      <h1>${this.board.yard}</h1>
      <p>${this.board.village} · 点坑登记浸液酸碱度；放液须最近读数 3.5～5.0</p>
      ${ditch
        ? html`<p class="ditch ${ditch.state}">今日（${this.board.today}）排液渠：${DITCH_LABELS[ditch.state]} · 巡渠人 ${ditch.inspector}</p>`
        : html`<p class="ditch none">今日（${this.board.today}）尚无巡渠旗，鞣制中的坑不能注液</p>`}
      <div class="grid">
        ${this.board.pits.map(
          (p) => html`<button class="pit ${p.status}" @click=${() => (this.picked = p)}>
            <strong>${p.code}</strong><br />${LABELS[p.status]}
          </button>`
        )}
      </div>
      ${this.picked
        ? html`<section>
            <h3>${this.picked.code} · ${LABELS[this.picked.status]}</h3>
            <p>最近酸碱度：${this.picked.latestPh ?? "无"} · ${this.picked.sampleCount} 次</p>
            <input .value=${this.ph} @input=${(e) => (this.ph = e.target.value)} />
            <button @click=${this.writePh}>登记酸碱度</button>
            <div>
              <button @click=${() => this.setStatus("fill")}>注液</button>
              <button @click=${() => this.setStatus("tanning")}>鞣制中</button>
              <button @click=${() => this.setStatus("drained")}>已放液</button>
            </div>
            ${this.picked.status === "tanning"
              ? html`<p class="hint">鞣制中改注液须当日巡渠畅通旗；无旗或淤塞会被挡住</p>`
              : ""}
          </section>`
        : ""}
    `;
  }

  renderDitch() {
    return html`
      <h1>排液渠 · 渠况旗</h1>
      ${this.role === "admin"
        ? html`<div class="bar">
            <label>巡渠日
              <input type="date" .value=${this.flagDate} @input=${(e) => (this.flagDate = e.target.value)} />
            </label>
            <label>渠况
              <select .value=${this.flagState} @change=${(e) => (this.flagState = e.target.value)}>
                <option value="clear">畅通</option>
                <option value="silted">淤塞</option>
              </select>
            </label>
            <button @click=${this.createFlag}>新建渠旗</button>
          </div>`
        : html`<p class="hint">仅管理员可巡渠与作废</p>`}
      <div class="bar">
        <label>巡渠日
          <input type="date" .value=${this.filterDay} @input=${(e) => (this.filterDay = e.target.value)} />
        </label>
        <label>渠况
          <select .value=${this.filterState} @change=${(e) => (this.filterState = e.target.value)}>
            <option value="">全部</option>
            <option value="clear">畅通</option>
            <option value="silted">淤塞</option>
          </select>
        </label>
        <label>效力
          <select .value=${this.filterValid} @change=${(e) => (this.filterValid = e.target.value)}>
            <option value="">全部</option>
            <option value="true">仅有效</option>
            <option value="false">已作废</option>
          </select>
        </label>
        <button @click=${this.loadFlags}>筛选</button>
      </div>
      <table>
        <thead>
          <tr><th>场</th><th>巡渠日</th><th>渠况</th><th>巡渠人</th><th>作废</th><th></th></tr>
        </thead>
        <tbody>
          ${this.flags.map(
            (f) => html`<tr class=${f.voidedAt ? "void" : ""}>
              <td>${f.yard}</td>
              <td>${f.checkDate}</td>
              <td>${DITCH_LABELS[f.state] ?? f.state}</td>
              <td>${f.inspector}</td>
              <td>${f.voidedAt ? `${f.voidedBy ?? ""} ${f.voidedAt.slice(0, 16).replace("T", " ")}` : ""}</td>
              <td>${this.role === "admin" && !f.voidedAt
                ? html`<button @click=${() => this.voidFlag(f.id)}>作废</button>`
                : ""}</td>
            </tr>`
          )}
        </tbody>
      </table>
      ${this.flags.length === 0 ? html`<p class="hint">没有符合条件的渠旗</p>` : ""}
    `;
  }

  render() {
    if (!this.ready) {
      return html`<div class="wrap">
        <h1>南冈鞣场</h1>
        <form @submit=${this.login} autocomplete="off">
          <label>用户名
            <input name="username" autocomplete="off" .value=${this.username} @input=${(e) => (this.username = e.target.value)} />
          </label>
          <label>密码
            <input name="password" type="password" autocomplete="off" .value=${this.password} @input=${(e) => (this.password = e.target.value)} />
          </label>
          <p class="hint">已预填 admin / 123456，另有 worker / 123456</p>
          <button>登录</button>
        </form>
        ${this.err ? html`<p class="err">${this.err}</p>` : ""}
      </div>`;
    }
    return html`<div class="wrap">
      <nav class="tabs">
        <button class=${this.view === "board" ? "on" : ""} @click=${() => this.switchView("board")}>坑位场地图</button>
        <button class=${this.view === "ditch" ? "on" : ""} @click=${() => this.switchView("ditch")}>排液渠</button>
      </nav>
      ${this.view === "board" ? this.renderBoard() : this.renderDitch()}
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    </div>`;
  }
}

customElements.define("tan-yard", TanYard);
