import { LitElement, css, html } from "lit";

const TOKEN_KEY = "tanpit_token";
const ROLE_KEY = "tanpit_role";
const LABELS = { fill: "注液", tanning: "鞣制中", drained: "已放液" };
const FLAG_LABELS = { clear: "畅通", blocked: "淤塞" };

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
    flags: { type: Object },
    flagDate: { type: String },
    flagState: { type: String },
    showVoided: { type: Boolean },
    flagErr: { type: String },
    flagMsg: { type: String },
    newDate: { type: String },
  };

  static styles = css`
    :host { display: block; font-family: "KaiTi", serif; color: #2b2118; }
    .wrap { max-width: 880px; margin: 0 auto; padding: 28px 16px 50px; }
    nav { display: flex; gap: 10px; border-bottom: 2px solid #8a5a2b; margin-bottom: 18px; }
    nav button {
      background: none; border: 0; border-bottom: 3px solid transparent;
      font-size: 1.05em; padding: 8px 14px; margin-bottom: -2px; cursor: pointer; color: #6b5a48;
    }
    nav button.active { color: #2b2118; border-bottom-color: #8a5a2b; font-weight: bold; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    .pit { min-height: 110px; border-radius: 8px; color: #fff; cursor: pointer; border: 0; }
    .fill { background: #6d8f9e; }
    .tanning { background: #8a5a2b; }
    .drained { background: #5f6f4a; }
    .err { color: #9b1c1c; }
    .ok { color: #2f6b2f; }
    .hint { color: #6b5a48; font-size: 0.92em; }
    .banner { padding: 8px 12px; border-radius: 6px; margin: 10px 0; }
    .banner.clear { background: #e3f0dc; }
    .banner.blocked { background: #f3dada; }
    .banner.none { background: #ece5db; }
    label { display: block; margin: 8px 0; }
    input, select, button { font: inherit; padding: 8px 10px; margin: 4px 6px 4px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; }
    th, td { border-bottom: 1px solid #d8cbb8; padding: 8px 6px; text-align: left; }
    .voided { color: #9a8a78; text-decoration: line-through; }
    .tag-clear { color: #2f6b2f; font-weight: bold; }
    .tag-blocked { color: #9b1c1c; font-weight: bold; }
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
    this.role = localStorage.getItem(ROLE_KEY) || "";
    this.flags = null;
    this.flagDate = "";
    this.flagState = "";
    this.showVoided = false;
    this.flagErr = "";
    this.flagMsg = "";
    const now = new Date();
    this.newDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.ready) this.bootstrap();
  }

  async bootstrap() {
    try {
      const me = await api("/api/auth/me");
      this.role = me.role;
      localStorage.setItem(ROLE_KEY, me.role);
      await this.refresh();
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

  async login(e) {
    e.preventDefault();
    this.err = "";
    try {
      const data = await api("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username: this.username, password: this.password }),
      });
      localStorage.setItem(TOKEN_KEY, data.access_token);
      localStorage.setItem(ROLE_KEY, data.user.role);
      this.role = data.user.role;
      this.ready = true;
      await this.refresh();
    } catch (ex) {
      this.err = ex.message;
    }
  }

  logout() {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(ROLE_KEY);
    this.ready = false;
    this.role = "";
    this.board = null;
    this.flags = null;
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

  async loadFlags() {
    this.flagErr = "";
    const params = new URLSearchParams();
    if (this.flagDate) params.set("date", this.flagDate);
    if (this.flagState) params.set("state", this.flagState);
    if (this.showVoided) params.set("include_voided", "true");
    try {
      this.flags = await api(`/api/drain-flags?${params.toString()}`);
    } catch (e) {
      this.flagErr = e.message;
    }
  }

  switchView(view) {
    this.view = view;
    this.err = "";
    if (view === "drains" && this.flags === null) this.loadFlags();
  }

  async createFlag(state) {
    this.flagErr = "";
    this.flagMsg = "";
    const body = { state };
    if (this.newDate) body.date = this.newDate;
    try {
      await api("/api/drain-flags", { method: "POST", body: JSON.stringify(body) });
      this.flagMsg = `${this.newDate || "当日"}${FLAG_LABELS[state]}旗已插`;
      await this.loadFlags();
      await this.refresh();
    } catch (e) {
      this.flagErr = e.message;
    }
  }

  async voidFlag(id) {
    this.flagErr = "";
    this.flagMsg = "";
    try {
      await api(`/api/drain-flags/${id}/void`, { method: "POST" });
      this.flagMsg = "渠旗已作废";
      await this.loadFlags();
      await this.refresh();
    } catch (e) {
      this.flagErr = e.message;
    }
  }

  nav() {
    return html`<nav>
      <button class=${this.view === "board" ? "active" : ""} @click=${() => this.switchView("board")}>坑位场地图</button>
      <button class=${this.view === "drains" ? "active" : ""} @click=${() => this.switchView("drains")}>排液渠</button>
      <span style="flex:1"></span>
      <span class="hint" style="align-self:center">${this.role === "admin" ? "管理员" : "巡坑工"}</span>
      <button @click=${this.logout}>退出</button>
    </nav>`;
  }

  drainBanner() {
    const f = this.board.drainFlag;
    if (!f) return html`<div class="banner none">今日（${this.board.today}）排液渠尚无有效巡渠旗，鞣制中的坑不能改回注液。</div>`;
    return html`<div class="banner ${f.state}">
      今日（${f.date}）排液渠：<strong>${FLAG_LABELS[f.state]}</strong> · 巡渠人 ${f.inspector}
      ${f.state === "blocked" ? "；鞣制中的坑不能改回注液" : ""}
    </div>`;
  }

  renderBoard() {
    if (!this.board) return html`${this.err || "装载坑位…"}`;
    return html`
      <h1>${this.board.yard}</h1>
      <p>${this.board.village} · 点坑登记浸液酸碱度；放液须最近读数 3.5～5.0；鞣制中改回注液须当日渠旗畅通</p>
      ${this.drainBanner()}
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
          </section>`
        : ""}
      ${this.err ? html`<p class="err">${this.err}</p>` : ""}
    `;
  }

  renderDrains() {
    const isAdmin = this.role === "admin";
    return html`
      <h1>排液渠渠况</h1>
      <p class="hint">渠旗按日新建或作废；同一场地同一日只许一面未作废旗。仅管理员可巡渠与作废。</p>
      ${isAdmin
        ? html`<section>
            <label>巡渠日
              <input type="date" .value=${this.newDate} @change=${(e) => (this.newDate = e.target.value)} />
            </label>
            <button @click=${() => this.createFlag("clear")}>新建畅通旗</button>
            <button @click=${() => this.createFlag("blocked")}>新建淤塞旗</button>
          </section>`
        : html`<p class="hint">你不是管理员，只能查看渠况。</p>`}
      ${this.flagMsg ? html`<p class="ok">${this.flagMsg}</p>` : ""}
      ${this.flagErr ? html`<p class="err">${this.flagErr}</p>` : ""}
      <section style="margin-top:16px">
        <label style="display:inline">日期
          <input type="date" .value=${this.flagDate} @change=${(e) => { this.flagDate = e.target.value; this.loadFlags(); }} />
        </label>
        <label style="display:inline">旗况
          <select @change=${(e) => { this.flagState = e.target.value; this.loadFlags(); }}>
            <option value="">全部</option>
            <option value="clear" .selected=${this.flagState === "clear"}>畅通</option>
            <option value="blocked" .selected=${this.flagState === "blocked"}>淤塞</option>
          </select>
        </label>
        <label style="display:inline">
          <input type="checkbox" .checked=${this.showVoided} @change=${(e) => { this.showVoided = e.target.checked; this.loadFlags(); }} />
          含已作废
        </label>
        <button @click=${() => this.loadFlags()}>筛选</button>
      </section>
      ${this.flags
        ? this.flags.flags.length === 0
          ? html`<p class="hint">没有符合条件的渠旗。</p>`
          : html`<table>
              <thead><tr><th>场</th><th>巡渠日</th><th>渠况</th><th>巡渠人</th><th>状态</th><th></th></tr></thead>
              <tbody>
                ${this.flags.flags.map(
                  (f) => html`<tr class=${f.active ? "" : "voided"}>
                    <td>${this.flags.yard}</td>
                    <td>${f.date}</td>
                    <td class="tag-${f.state}">${FLAG_LABELS[f.state]}</td>
                    <td>${f.inspector}</td>
                    <td>${f.active ? "有效" : `已作废${f.voidedBy ? " · " + f.voidedBy : ""}`}</td>
                    <td>${f.active && isAdmin ? html`<button @click=${() => this.voidFlag(f.id)}>作废</button>` : ""}</td>
                  </tr>`
                )}
              </tbody>
            </table>`
        : html`<p class="hint">装载渠况…</p>`}
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
      ${this.nav()}
      ${this.view === "board" ? this.renderBoard() : this.renderDrains()}
    </div>`;
  }
}

customElements.define("tan-yard", TanYard);
