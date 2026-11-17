(() => {
  "use strict";

  const FIELD = {
    id: "รหัสงานซ่อม",
    date: "วันที่แจ้ง",
    department: "แผนก",
    device: "ประเภทอุปกรณ์",
    issue: "อาการเสีย",
    urgency: "ความเร่งด่วน",
    status: "สถานะงาน",
    hours: "เวลาซ่อม (ชั่วโมง)",
    parts: "ค่าอะไหล่ (บาท)",
    labor: "ค่าแรง (บาท)",
    satisfaction: "ความพึงพอใจ (1-5)"
  };
  const PAGE_TITLES = {
    overview: "ภาพรวม",
    jobs: "รายการซ่อม",
    backlog: "งานที่ต้องติดตาม",
    insights: "วิเคราะห์เชิงลึก",
    quality: "คุณภาพข้อมูล"
  };
  const STATUS_COLORS = {
    "ซ่อมเสร็จ": "#168d78",
    "กำลังซ่อม": "#7f9bd0",
    "รออะไหล่": "#e0ae62",
    "รอตรวจสอบ": "#a8b0b7"
  };
  const STATUS_CLASS = {
    "ซ่อมเสร็จ": "status-done",
    "กำลังซ่อม": "status-progress",
    "รออะไหล่": "status-waiting",
    "รอตรวจสอบ": "status-review"
  };
  const URGENCY_CLASS = {
    "เร่งด่วนมาก": "urgency-high",
    "เร่งด่วน": "urgency-medium",
    "ปกติ": "urgency-normal"
  };
  const PRIORITY_ORDER = { "เร่งด่วนมาก": 0, "เร่งด่วน": 1, "ปกติ": 2 };
  const PAGE_SIZE = 12;

  let allJobs = [];
  let currentPage = "overview";
  let currentRows = [];
  let pageNumber = 1;
  let sortKey = "date";
  let sortDirection = "desc";

  const $ = (selector) => document.querySelector(selector);
  const content = $("#pageContent");
  const numberFormat = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 1 });
  const currencyFormat = new Intl.NumberFormat("th-TH", { maximumFractionDigits: 0 });

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[char]);
  }

  function parseNumber(value) {
    if (value === "" || value == null) return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }

  function parseDate(value) {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value || "");
    if (!match) return null;
    const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
    return date.getUTCFullYear() === Number(match[1])
      && date.getUTCMonth() === Number(match[2]) - 1
      && date.getUTCDate() === Number(match[3]) ? date : null;
  }

  function normalizeJob(raw, index) {
    const values = {};
    for (const [key, field] of Object.entries(FIELD)) values[key] = String(raw[field] ?? "").trim();
    const duplicateKey = JSON.stringify(Object.values(values));
    return {
      ...values,
      sourceLine: index + 2,
      dateObject: parseDate(values.date),
      hoursNumber: parseNumber(values.hours),
      partsNumber: parseNumber(values.parts),
      laborNumber: parseNumber(values.labor),
      satisfactionNumber: parseNumber(values.satisfaction),
      duplicateKey,
      isDuplicate: false
    };
  }

  function prepareJobs(source) {
    const seenRows = new Set();
    const jobs = source.map(normalizeJob);
    for (const job of jobs) {
      if (seenRows.has(job.duplicateKey)) job.isDuplicate = true;
      else seenRows.add(job.duplicateKey);
    }
    return jobs;
  }

  function distinctJobs() {
    return allJobs.filter((job) => !job.isDuplicate);
  }

  function getFilteredRows() {
    const from = $("#dateFrom").value;
    const to = $("#dateTo").value;
    const status = $("#statusFilter").value;
    const urgency = $("#urgencyFilter").value;
    const department = $("#departmentFilter").value;
    const search = $("#searchFilter").value.trim().toLocaleLowerCase("th-TH");

    return distinctJobs().filter((job) => {
      if (from || to) {
        if (!job.dateObject) return false;
        if (from && job.date < from) return false;
        if (to && job.date > to) return false;
      }
      if (status && job.status !== status) return false;
      if (urgency && job.urgency !== urgency) return false;
      if (department && (job.department || "ไม่ระบุ") !== department) return false;
      if (search) {
        const searchable = [job.id, job.department, job.device, job.issue]
          .join(" ").toLocaleLowerCase("th-TH");
        if (!searchable.includes(search)) return false;
      }
      return true;
    });
  }

  function formatDate(value) {
    const date = parseDate(value);
    return date ? new Intl.DateTimeFormat("th-TH", {
      day: "numeric", month: "short", year: "2-digit", timeZone: "UTC"
    }).format(date) : "วันที่ไม่ถูกต้อง";
  }

  function formatMonth(value) {
    const date = parseDate(`${value}-01`);
    return date ? new Intl.DateTimeFormat("th-TH", {
      month: "short", year: "2-digit", timeZone: "UTC"
    }).format(date) : value;
  }

  function formatNumber(value, decimals = 0) {
    return new Intl.NumberFormat("th-TH", { maximumFractionDigits: decimals }).format(value);
  }

  function average(values) {
    return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
  }

  function median(values) {
    if (!values.length) return null;
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  }

  function standardDeviation(values) {
    if (!values.length) return null;
    const mean = average(values);
    return Math.sqrt(values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length);
  }

  function countBy(rows, key) {
    const counts = new Map();
    rows.forEach((row) => {
      const value = row[key] || "ไม่ระบุ";
      counts.set(value, (counts.get(value) || 0) + 1);
    });
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "th"));
  }

  function sumValidCosts(rows) {
    return rows.reduce((sum, job) => {
      const parts = job.partsNumber !== null && job.partsNumber >= 0 ? job.partsNumber : 0;
      const labor = job.laborNumber !== null && job.laborNumber >= 0 ? job.laborNumber : 0;
      return sum + parts + labor;
    }, 0);
  }

  function safePercent(numerator, denominator) {
    return denominator ? `${formatNumber((numerator / denominator) * 100, 1)}%` : "ไม่มีข้อมูล";
  }

  function pageHeading(title, description, actions = "") {
    return `<div class="page-heading"><div><h1>${title}</h1><p>${description}</p></div><div class="heading-actions">${actions}</div></div>`;
  }

  function kpiCard({ label, value, note, icon, tone = "", footTone = "plain" }) {
    return `<article class="kpi-card">
      <div class="kpi-top"><span class="kpi-label">${label}</span><span class="kpi-icon ${tone}">${icon}</span></div>
      <div class="kpi-value">${value}</div><div class="kpi-foot"><span class="${footTone}">${note}</span></div>
    </article>`;
  }

  const ICONS = {
    tools: '<svg viewBox="0 0 24 24"><path d="M14.7 6.3a5 5 0 0 0-6.4 6.4L3 18l3 3 5.3-5.3a5 5 0 0 0 6.4-6.4l-3.1 3.1-3.5-.9-.9-3.5 3.1-3.1Z"/></svg>',
    check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
    clock: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    smile: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M8 14s1.3 2 4 2 4-2 4-2M9 9h.01M15 9h.01"/></svg>',
    export: '<svg viewBox="0 0 24 24"><path d="M12 3v12m-4-4 4 4 4-4M5 17v4h14v-4"/></svg>'
  };

  function renderBarChart(items, { colorClass = "", maxItems = 7, empty = "ไม่มีข้อมูลในตัวกรองนี้" } = {}) {
    const visible = items.slice(0, maxItems);
    if (!visible.length) return `<div class="empty-state"><span class="empty-symbol">–</span><strong>${empty}</strong><p>ลองเปลี่ยนตัวกรองเพื่อดูข้อมูลเพิ่มเติม</p></div>`;
    const max = Math.max(...visible.map((item) => item[1]), 1);
    return `<div class="bar-chart">${visible.map(([label, count]) => `
      <div class="bar-row"><span class="bar-label" title="${escapeHtml(label)}">${escapeHtml(label)}</span>
        <span class="bar-track"><span class="bar-fill ${colorClass}" style="display:block;width:${Math.max(3, count / max * 100)}%"></span></span>
        <span class="bar-value">${formatNumber(count)}</span></div>`).join("")}</div>`;
  }

  function renderTrend(rows) {
    const counts = new Map();
    rows.forEach((job) => {
      if (!job.dateObject) return;
      const month = job.date.slice(0, 7);
      counts.set(month, (counts.get(month) || 0) + 1);
    });
    const values = [...counts.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    if (!values.length) return `<div class="empty-state"><span class="empty-symbol">–</span><strong>ไม่มีข้อมูลวันที่สำหรับช่วงนี้</strong><p>รายการที่มีวันที่ไม่ถูกต้องยังอยู่ในตาราง แต่ไม่นำมาคำนวณแนวโน้ม</p></div>`;
    const width = 560, height = 172, pad = { left: 22, right: 12, top: 16, bottom: 30 };
    const maxValue = Math.max(...values.map((entry) => entry[1]), 1);
    const x = (index) => values.length === 1 ? width / 2 : pad.left + index * (width - pad.left - pad.right) / (values.length - 1);
    const y = (value) => height - pad.bottom - (value / maxValue) * (height - pad.top - pad.bottom);
    const points = values.map((entry, index) => `${x(index)},${y(entry[1])}`);
    const polyline = points.join(" ");
    const area = `${x(0)},${height - pad.bottom} ${polyline} ${x(values.length - 1)},${height - pad.bottom}`;
    const gridLines = [0, .5, 1].map((fraction) => {
      const lineY = pad.top + fraction * (height - pad.top - pad.bottom);
      return `<line class="trend-grid" x1="${pad.left}" y1="${lineY}" x2="${width - pad.right}" y2="${lineY}"/>`;
    }).join("");
    const dots = values.map((entry, index) => `<circle class="trend-dot" cx="${x(index)}" cy="${y(entry[1])}" r="3.5"><title>${formatMonth(entry[0])}: ${entry[1]} รายการ</title></circle>`).join("");
    const labels = values.map((entry, index) => `<text class="trend-label" x="${x(index)}" y="${height - 8}" text-anchor="middle">${escapeHtml(formatMonth(entry[0]))}</text>`).join("");
    return `<svg class="trend-chart" viewBox="0 0 ${width} ${height}" role="img" aria-label="จำนวนงานแจ้งซ่อมรายเดือน">
      ${gridLines}<polygon class="trend-area" points="${area}"/><polyline class="trend-line" points="${polyline}"/>${dots}${labels}
    </svg>`;
  }

  function renderStatusDonut(rows) {
    const entries = ["ซ่อมเสร็จ", "กำลังซ่อม", "รออะไหล่", "รอตรวจสอบ"].map((status) => [
      status, rows.filter((job) => job.status === status).length
    ]);
    const total = entries.reduce((sum, entry) => sum + entry[1], 0);
    let position = 0;
    const segments = entries.map(([status, count]) => {
      const start = position;
      position += total ? count / total * 100 : 0;
      return `${STATUS_COLORS[status]} ${start}% ${position}%`;
    });
    const gradient = total ? `conic-gradient(${segments.join(",")})` : "conic-gradient(#e6ebef 0 100%)";
    return `<div class="status-layout"><div class="donut" style="--donut:${gradient}"><div class="donut-center"><strong>${formatNumber(total)}</strong><span>รายการ</span></div></div>
      <div class="legend">${entries.map(([status, count]) => `<div class="legend-row"><span class="legend-dot" style="--dot:${STATUS_COLORS[status]}"></span><span>${status}</span><strong>${formatNumber(count)}</strong></div>`).join("")}</div></div>`;
  }

  function miniPanel(title, subtitle, body, meta = "") {
    return `<section class="panel"><div class="panel-head"><div><h2>${title}</h2><p>${subtitle}</p></div>${meta ? `<span class="panel-meta">${meta}</span>` : ""}</div>${body}</section>`;
  }

  function getMetrics(rows) {
    const completed = rows.filter((job) => job.status === "ซ่อมเสร็จ");
    const pending = rows.filter((job) => job.status !== "ซ่อมเสร็จ");
    const validHours = completed.map((job) => job.hoursNumber).filter((value) => value !== null && value >= 0);
    const validRatings = completed.map((job) => job.satisfactionNumber).filter((value) => value !== null && value >= 1 && value <= 5);
    return {
      total: rows.length, completed, pending, validHours, validRatings,
      averageHours: average(validHours), medianHours: median(validHours), stdHours: standardDeviation(validHours),
      minHours: validHours.length ? Math.min(...validHours) : null,
      maxHours: validHours.length ? Math.max(...validHours) : null,
      averageRating: average(validRatings), costs: sumValidCosts(completed),
      topIssue: countBy(rows, "issue")[0] || null,
      topDevice: countBy(rows, "device")[0] || null,
      topDepartment: countBy(rows.filter((job) => job.department), "department")[0] || null
    };
  }

  function renderOverview(rows) {
    const metrics = getMetrics(rows);
    const deviceCounts = countBy(rows, "device");
    const statusCount = rows.filter((job) => job.status !== "ซ่อมเสร็จ").length;
    const costCount = metrics.completed.filter((job) =>
      (job.partsNumber !== null && job.partsNumber >= 0) || (job.laborNumber !== null && job.laborNumber >= 0)
    ).length;
    const cards = [
      kpiCard({ label: "งานแจ้งซ่อมทั้งหมด", value: formatNumber(metrics.total), note: "รายการไม่ซ้ำในช่วงที่เลือก", icon: ICONS.tools }),
      kpiCard({ label: "ซ่อมเสร็จแล้ว", value: formatNumber(metrics.completed.length), note: safePercent(metrics.completed.length, metrics.total) + " ของงานที่แสดง", icon: ICONS.check, tone: "blue", footTone: "positive" }),
      kpiCard({ label: "งานที่ยังไม่ปิด", value: formatNumber(metrics.pending.length), note: `${formatNumber(statusCount)} รายการต้องติดตาม`, icon: ICONS.clock, tone: "amber", footTone: "caution" }),
      kpiCard({ label: "คะแนนพึงพอใจเฉลี่ย", value: metrics.averageRating === null ? "—" : formatNumber(metrics.averageRating, 2), note: `จาก ${formatNumber(metrics.validRatings.length)} คะแนนที่ถูกต้อง`, icon: ICONS.smile, tone: "red" })
    ].join("");

    const dateWarning = rows.some((job) => !job.dateObject)
      ? `<div class="data-note"><span class="note-icon">i</span><div>มีรายการวันที่ไม่ถูกต้อง <strong>${formatNumber(rows.filter((job) => !job.dateObject).length)} รายการ</strong> รวมในจำนวนงาน แต่ไม่รวมในกราฟตามเดือนและตัวกรองวันที่</div></div>` : "";
    const costNote = `<div class="data-note"><span class="note-icon">i</span><div>ค่าใช้จ่ายจากงานที่ปิดแล้ว <strong>${currencyFormat.format(metrics.costs)} บาท</strong> · ใช้เฉพาะค่าอะไหล่/ค่าแรงที่เป็นตัวเลขตั้งแต่ 0 ขึ้นไป (${formatNumber(costCount)} งานมีค่าใช้จ่ายที่ใช้ได้)</div></div>`;
    return `${pageHeading("ภาพรวมงานซ่อม", "ติดตามปริมาณงาน สถานะ และสัญญาณสำคัญจากข้อมูลที่เลือก", `<span class="subtle-pill"><span class="live-dot"></span>อัปเดตจากชุดข้อมูล</span>`)}
      <div class="kpi-grid">${cards}</div>
      <div class="grid-two">
        ${miniPanel("งานตามประเภทอุปกรณ์", "แสดงจำนวนรายการในแต่ละประเภท", renderBarChart(deviceCounts, { colorClass: "blue", maxItems: 6 }), `${formatNumber(rows.length)} งาน`)}
        ${miniPanel("แนวโน้มงานแจ้งซ่อม", "นับจากวันที่แจ้งที่ตรวจสอบรูปแบบได้", renderTrend(rows), "รายเดือน")}
      </div>
      <div class="grid-two">
        ${miniPanel("สัดส่วนสถานะงาน", "รายการที่ปิดแล้วและรายการที่ยังต้องดำเนินการ", renderStatusDonut(rows))}
        ${miniPanel("อาการที่พบบ่อย", "เรียงตามจำนวนงานแจ้งซ่อม", renderBarChart(countBy(rows, "issue"), { maxItems: 5 }), "5 อันดับ")}
      </div>
      ${dateWarning}${costNote}`;
  }

  function statusBadge(status) {
    return `<span class="status-badge ${STATUS_CLASS[status] || "status-review"}">${escapeHtml(status || "ไม่ระบุ")}</span>`;
  }

  function urgencyBadge(urgency) {
    return `<span class="urgency-badge ${URGENCY_CLASS[urgency] || "urgency-normal"}">${escapeHtml(urgency || "ไม่ระบุ")}</span>`;
  }

  function sortRows(rows) {
    const getValue = (job) => {
      if (sortKey === "date") return job.dateObject ? job.date : "";
      if (sortKey === "status") return job.status;
      if (sortKey === "hours") return job.hoursNumber ?? -Infinity;
      return job[sortKey] || "";
    };
    return [...rows].sort((a, b) => {
      const left = getValue(a), right = getValue(b);
      const comparison = typeof left === "number" && typeof right === "number"
        ? left - right : String(left).localeCompare(String(right), "th");
      return comparison * (sortDirection === "asc" ? 1 : -1);
    });
  }

  function renderJobsTable(rows) {
    const sorted = sortRows(rows);
    const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
    pageNumber = Math.min(pageNumber, pageCount);
    const start = (pageNumber - 1) * PAGE_SIZE;
    const visible = sorted.slice(start, start + PAGE_SIZE);
    if (!visible.length) return `<div class="empty-state"><span class="empty-symbol">⌕</span><strong>ยังไม่มีรายการที่ตรงกับตัวกรอง</strong><p>ลบคำค้นหรือปรับตัวกรองด้านบน แล้วลองอีกครั้ง</p></div>`;

    const rowsHtml = visible.map((job) => `<tr>
      <td><span class="ticket-id">${escapeHtml(job.id)}</span></td>
      <td>${formatDate(job.date)}</td><td>${escapeHtml(job.department || "ไม่ระบุ")}</td>
      <td><span class="cell-strong">${escapeHtml(job.device)}</span></td><td>${escapeHtml(job.issue)}</td>
      <td>${job.hoursNumber === null ? '<span class="muted-cell">—</span>' : `${formatNumber(job.hoursNumber, 1)} ชม.`}</td>
      <td>${urgencyBadge(job.urgency)}</td><td>${statusBadge(job.status)}</td>
    </tr>`).join("");

    const headers = `<th><button class="sort-button" data-sort="id">รหัสงาน ${sortKey === "id" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</button></th>
      <th><button class="sort-button" data-sort="date">วันที่แจ้ง ${sortKey === "date" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</button></th>
      <th>แผนก</th><th>อุปกรณ์</th><th>อาการเสีย</th>
      <th><button class="sort-button" data-sort="hours">เวลาซ่อม ${sortKey === "hours" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</button></th>
      <th>ความเร่งด่วน</th><th><button class="sort-button" data-sort="status">สถานะ ${sortKey === "status" ? (sortDirection === "asc" ? "↑" : "↓") : ""}</button></th>`;
    const pageButtons = Array.from({ length: pageCount }, (_, index) => {
      const number = index + 1;
      if (pageCount > 5 && Math.abs(number - pageNumber) > 1 && number !== 1 && number !== pageCount) return "";
      return `<button type="button" class="${number === pageNumber ? "current" : ""}" data-page-number="${number}" aria-label="หน้าที่ ${number}">${number}</button>`;
    }).join("");

    return `<div class="table-wrap"><table><thead><tr>${headers}</tr></thead><tbody>${rowsHtml}</tbody></table></div>
      <div class="table-footer"><span>แสดง ${formatNumber(start + 1)}–${formatNumber(Math.min(start + PAGE_SIZE, sorted.length))} จาก ${formatNumber(sorted.length)} รายการ</span>
        <div class="pager"><button type="button" data-page-number="${pageNumber - 1}" ${pageNumber <= 1 ? "disabled" : ""} aria-label="หน้าก่อน">‹</button>${pageButtons}
          <button type="button" data-page-number="${pageNumber + 1}" ${pageNumber >= pageCount ? "disabled" : ""} aria-label="หน้าถัดไป">›</button></div></div>`;
  }

  function renderJobs(rows) {
    const actions = `<button class="button-primary" id="exportCsv" type="button">${ICONS.export}<span>ส่งออก CSV</span></button>`;
    return `${pageHeading("รายการแจ้งซ่อม", "ค้นหา เรียงลำดับ และส่งออกรายการตามตัวกรองปัจจุบัน", actions)}
      <div class="table-panel"><div class="table-head"><div><h2>รายการทั้งหมด</h2><p>รายการซ้ำที่ตรวจพบจะไม่นับซ้ำในตาราง</p></div><span class="subtle-pill">${formatNumber(rows.length)} รายการ</span></div>${renderJobsTable(rows)}</div>`;
  }

  function renderBacklog(rows) {
    const pending = rows.filter((job) => job.status !== "ซ่อมเสร็จ");
    const urgent = pending.filter((job) => job.urgency === "เร่งด่วนมาก").length;
    const waiting = pending.filter((job) => job.status === "รออะไหล่").length;
    const repair = pending.filter((job) => job.status === "กำลังซ่อม").length;
    const cards = [
      `<article class="followup-card"><div class="followup-label">งานยังไม่ปิด</div><div class="followup-value">${formatNumber(pending.length)}</div><p>งานที่ต้องตรวจสอบต่อ</p></article>`,
      `<article class="followup-card"><div class="followup-label">เร่งด่วนมาก</div><div class="followup-value">${formatNumber(urgent)}</div><p>จัดลำดับการติดตามก่อน</p></article>`,
      `<article class="followup-card"><div class="followup-label">รออะไหล่</div><div class="followup-value">${formatNumber(waiting)}</div><p>ตรวจสอบสถานะการจัดหา</p></article>`
    ].join("");
    return `${pageHeading("งานที่ต้องติดตาม", "รวมงานที่กำลังซ่อม รออะไหล่ และรอตรวจสอบ")}
      <div class="followup-grid">${cards}</div>
      <div class="callout"><span class="callout-mark">!</span><div><strong>ข้อมูลยังไม่มีวันปิดงานหรือ SLA</strong><span>จึงไม่คำนวณอายุงานค้างหรือสรุปว่างานใดเกินกำหนด ตารางนี้ช่วยจัดลำดับตามความเร่งด่วนและวันที่แจ้งเท่านั้น · กำลังซ่อม ${formatNumber(repair)} รายการ</span></div></div>
      <div class="table-panel"><div class="table-head"><div><h2>รายการที่ยังไม่ปิด</h2><p>เรียงวันที่แจ้งใหม่ไปเก่า · ตัวกรองด้านบนใช้ร่วมกับทุกหน้า</p></div><span class="subtle-pill">${formatNumber(pending.length)} รายการ</span></div>${renderJobsTable(pending, { pendingOnly: true })}</div>`;
  }

  function renderHistogram(values) {
    if (!values.length) return `<div class="empty-state"><span class="empty-symbol">–</span><strong>ไม่มีค่าที่นำมาคำนวณ</strong><p>ต้องมีเวลาซ่อมที่เป็นตัวเลขตั้งแต่ 0 ขึ้นไป</p></div>`;
    const maxHours = Math.max(...values);
    const binCount = Math.min(7, Math.max(4, Math.ceil(Math.sqrt(values.length))));
    const binSize = (maxHours || 1) / binCount;
    const bins = Array.from({ length: binCount }, (_, index) => ({
      count: values.filter((value) => Math.min(binCount - 1, Math.floor(value / binSize)) === index).length,
      label: `${formatNumber(index * binSize, 1)}–${formatNumber((index + 1) * binSize, 1)}`
    }));
    const maxCount = Math.max(...bins.map((bin) => bin.count), 1);
    return `<div class="histogram">${bins.map((bin) => `<div class="histogram-item" title="${bin.count} รายการ"><div class="histogram-bar-wrap"><span class="histogram-bar" style="height:${Math.max(2, bin.count / maxCount * 100)}%"></span></div><span>${bin.label}</span></div>`).join("")}</div>`;
  }

  function renderInsights(rows) {
    const metrics = getMetrics(rows);
    const topDevice = metrics.topDevice || ["ไม่มีข้อมูล", 0];
    const topIssue = metrics.topIssue || ["ไม่มีข้อมูล", 0];
    const topDepartment = metrics.topDepartment || ["ไม่มีข้อมูล", 0];
    const pendingRate = safePercent(metrics.pending.length, metrics.total);
    const timeLabel = metrics.averageHours === null ? "ไม่มีข้อมูล" : `${formatNumber(metrics.averageHours, 1)} ชั่วโมง`;
    const ratingLabel = metrics.averageRating === null ? "ไม่มีข้อมูล" : `${formatNumber(metrics.averageRating, 2)} / 5`;
    const insights = [
      { title: "อุปกรณ์ที่แจ้งซ่อมบ่อย", text: `<strong>${escapeHtml(topDevice[0])}</strong> มี ${formatNumber(topDevice[1])} งาน (${safePercent(topDevice[1], metrics.total)} ของรายการในตัวกรอง) แนะนำตรวจสอบประวัติอาการและความพร้อมของอะไหล่สำหรับอุปกรณ์กลุ่มนี้` },
      { title: "อาการที่พบบ่อย", text: `<strong>${escapeHtml(topIssue[0])}</strong> พบ ${formatNumber(topIssue[1])} งาน ควรตรวจสอบรายละเอียดหน้างานก่อนสรุปสาเหตุ เพราะข้อมูลนี้บันทึกอาการ ไม่ได้ระบุสาเหตุราก` },
      { title: "ภาระงานที่ยังไม่ปิด", text: `มีงานที่ยังไม่ปิด ${formatNumber(metrics.pending.length)} รายการ (${pendingRate}) โดย ${formatNumber(metrics.pending.filter((job) => job.urgency === "เร่งด่วนมาก").length)} รายการถูกระบุว่าเร่งด่วนมาก ควรจัดคิวและทบทวนสถานะเป็นระยะ` },
      { title: "แผนกผู้แจ้งมากที่สุด", text: `<strong>${escapeHtml(topDepartment[0])}</strong> แจ้ง ${formatNumber(topDepartment[1])} งาน ใช้เป็นข้อมูลประกอบการวางแผนบริการได้ แต่จำนวนงานไม่บอกจำนวนอุปกรณ์ทั้งหมดของแต่ละแผนก` }
    ];
    const timeStats = metrics.validHours.length
      ? `<div class="metric-strip"><div class="metric-mini"><span>ค่าเฉลี่ย</span><strong>${formatNumber(metrics.averageHours, 2)} ชม.</strong></div><div class="metric-mini"><span>มัธยฐาน</span><strong>${formatNumber(metrics.medianHours, 2)} ชม.</strong></div><div class="metric-mini"><span>ส่วนเบี่ยงเบนมาตรฐาน</span><strong>${formatNumber(metrics.stdHours, 2)} ชม.</strong></div><div class="metric-mini"><span>ต่ำสุด</span><strong>${formatNumber(metrics.minHours, 1)} ชม.</strong></div><div class="metric-mini"><span>สูงสุด</span><strong>${formatNumber(metrics.maxHours, 1)} ชม.</strong></div></div>`
      : `<div class="empty-state"><strong>ไม่มีข้อมูลเวลาซ่อมที่ใช้ได้</strong></div>`;
    const ratingCounts = [...new Set(metrics.validRatings)].sort((a, b) => a - b)
      .map((rating) => [`${rating} คะแนน`, metrics.validRatings.filter((value) => value === rating).length]);
    const maxHourJobs = metrics.maxHours === null ? [] : metrics.completed
      .filter((job) => job.hoursNumber === metrics.maxHours);
    return `${pageHeading("วิเคราะห์เชิงลึก", "ข้อสังเกตเพื่อช่วยจัดลำดับงานและวางแผนทรัพยากร · ไม่ใช่ข้อสรุปเชิงเหตุและผล")}
      <div class="insight-grid">${insights.map((item, index) => `<article class="insight-card"><span class="insight-number">0${index + 1}</span><div><h3>${item.title}</h3><p>${item.text}</p></div></article>`).join("")}</div>
      <div class="grid-two">
        ${miniPanel("การกระจายเวลาซ่อม", "เฉพาะงานที่ซ่อมเสร็จและมีเวลาซ่อมไม่ติดลบ", `${timeStats}${renderHistogram(metrics.validHours)}`, `${formatNumber(metrics.validHours.length)} รายการ`)}
        ${miniPanel("การกระจายคะแนนพึงพอใจ", "งานที่ซ่อมเสร็จและคะแนนอยู่ในช่วง 1–5", renderBarChart(ratingCounts, { colorClass: "blue", maxItems: 5 }), `${formatNumber(metrics.validRatings.length)} คะแนน`)}
      </div>
      ${maxHourJobs.length ? `<div class="data-note"><span class="note-icon">i</span><div>เวลาซ่อมสูงสุด <strong>${formatNumber(metrics.maxHours, 1)} ชั่วโมง</strong> (${maxHourJobs.map((job) => escapeHtml(job.id)).join(", ")}) ยังคงรวมในสถิติ เนื่องจากไม่มีหลักฐานยืนยันว่าเป็นค่าผิด ต้องตรวจสอบข้อมูลต้นทางก่อนตัดออก</div></div>` : ""}
      <div class="data-note"><span class="note-icon">i</span><div>คะแนนพึงพอใจเฉลี่ย <strong>${ratingLabel}</strong> คำนวณจากคะแนน 1–5 ของงานที่ซ่อมเสร็จเท่านั้น ส่วนคะแนนนอกช่วงและค่าว่างไม่นำมาคิด</div></div>`;
  }

  function issueRows() {
    const duplicates = allJobs.filter((job) => job.isDuplicate);
    const invalidDates = allJobs.filter((job) => !job.dateObject);
    const negativeHours = allJobs.filter((job) => job.hoursNumber !== null && job.hoursNumber < 0);
    const validCompletedHours = distinctJobs().filter((job) => job.status === "ซ่อมเสร็จ" && job.hoursNumber !== null && job.hoursNumber >= 0);
    const maxCompletedHours = validCompletedHours.length ? Math.max(...validCompletedHours.map((job) => job.hoursNumber)) : null;
    const highestHours = maxCompletedHours === null ? [] : validCompletedHours.filter((job) => job.hoursNumber === maxCompletedHours);
    const negativeParts = allJobs.filter((job) => job.partsNumber !== null && job.partsNumber < 0);
    const invalidRating = allJobs.filter((job) => job.satisfactionNumber !== null && (job.satisfactionNumber < 1 || job.satisfactionNumber > 5));
    const missingDepartment = distinctJobs().filter((job) => !job.department);
    return [
      ...duplicates.map((job) => ({ job, type: "รายการซ้ำ", detail: `รหัส ${job.id} ซ้ำกับรายการก่อนหน้า (แถวข้อมูล ${job.sourceLine - 1})`, action: "เหมือนกันทุกฟิลด์ เก็บรายการแรกและไม่นับรายการซ้ำ" })),
      ...invalidDates.map((job) => ({ job, type: "วันที่ไม่ถูกต้อง", detail: `วันที่แจ้ง "${job.date}" ไม่มีอยู่จริง`, action: "คงรายการไว้ แต่ไม่รวมในกราฟแนวโน้ม/การกรองวันที่" })),
      ...negativeHours.map((job) => ({ job, type: "เวลาซ่อมติดลบ", detail: `เวลาซ่อม ${job.hours} ชั่วโมง`, action: "คงจำนวนงานไว้ ไม่นำค่าไปคำนวณสถิติเวลา" })),
      ...highestHours.map((job) => ({ job, type: "เวลาสูงสุดที่ควรทวนสอบ", detail: `เวลาซ่อม ${formatNumber(job.hoursNumber, 1)} ชั่วโมง`, action: "ยังคงค่าไว้ในสถิติ เพราะไม่มีหลักฐานยืนยันว่าผิด ตรวจสอบกับบันทึกต้นทางก่อนแก้ไข" })),
      ...negativeParts.map((job) => ({ job, type: "ค่าอะไหล่ติดลบ", detail: `ค่าอะไหล่ ${job.parts} บาท`, action: "คงรายการไว้ ไม่นำค่าอะไหล่นี้ไปรวมค่าใช้จ่าย" })),
      ...invalidRating.map((job) => ({ job, type: "คะแนนนอกช่วง", detail: `ความพึงพอใจ ${job.satisfaction} (ช่วงที่กำหนด 1–5)`, action: "คงรายการไว้ ไม่นำคะแนนนี้ไปคำนวณค่าเฉลี่ย" })),
      ...missingDepartment.map((job) => ({ job, type: "แผนกว่าง", detail: "ไม่มีข้อมูลแผนกผู้แจ้ง", action: "แสดงเป็น “ไม่ระบุ” โดยไม่เดาแผนก" }))
    ];
  }

  function renderQuality(rows) {
    const anomalies = issueRows();
    const sourceCount = allJobs.length;
    const uniqueCount = distinctJobs().length;
    const invalidCount = allJobs.filter((job) => !job.dateObject).length;
    const activeCount = distinctJobs().filter((job) => job.status !== "ซ่อมเสร็จ").length;
    const dictionary = [
      ["รหัสงานซ่อม", "ตัวระบุงานซ่อม · ข้อความ"],
      ["วันที่แจ้ง", "วันที่ผู้ใช้แจ้งซ่อม · YYYY-MM-DD"],
      ["แผนก", "แผนกผู้แจ้ง · ข้อความ (มีค่าว่าง 1 รายการ)"],
      ["ประเภทอุปกรณ์", "ประเภทอุปกรณ์ที่นำมาซ่อม · หมวดหมู่"],
      ["อาการเสีย", "อาการที่แจ้ง · ข้อความ ไม่ได้ยืนยันสาเหตุ"],
      ["ความเร่งด่วน", "ระดับความเร่งด่วนที่ระบุ · หมวดหมู่"],
      ["สถานะงาน", "สถานะล่าสุดในข้อมูล · หมวดหมู่"],
      ["เวลาซ่อม (ชั่วโมง)", "ระยะเวลาซ่อม · ชั่วโมง; ค่าว่างของงานที่ยังไม่ปิดไม่ถูกเติม"],
      ["ค่าอะไหล่ (บาท)", "ค่าอะไหล่ที่บันทึก · บาท"],
      ["ค่าแรง (บาท)", "ค่าแรงที่บันทึก · บาท"],
      ["ความพึงพอใจ (1-5)", "คะแนนผู้ใช้ · คะแนนเต็ม 5; ค่าว่างไม่นำมาคิด"]
    ];
    const issueTable = anomalies.length ? `<div class="table-wrap"><table><thead><tr><th>รหัสงาน</th><th>รายการที่พบ</th><th>รายละเอียด</th><th>แนวทางจัดการในการวิเคราะห์</th></tr></thead><tbody>${anomalies.map(({ job, type, detail, action }) => `<tr>
      <td><span class="ticket-id">${escapeHtml(job.id)}</span></td><td><span class="quality-issue">${type}</span></td><td>${escapeHtml(detail)}</td><td class="rule-cell">${action}</td></tr>`).join("")}</tbody></table></div>` : `<div class="empty-state"><span class="empty-symbol">✓</span><strong>ไม่พบปัญหาคุณภาพข้อมูลที่ตรวจไว้</strong><p>ข้อมูลที่เหลือยังผ่านกฎตรวจสอบพื้นฐาน</p></div>`;

    return `${pageHeading("คุณภาพและที่มาของข้อมูล", "ตรวจสอบย้อนกลับได้ พร้อมแยกค่าว่างที่เกิดตามสถานะออกจากค่าผิดปกติ")}
      <div class="quality-summary">
        <article class="quality-card"><span class="quality-mark">≋</span><div><strong>${formatNumber(sourceCount)}</strong><span>แถวจากไฟล์ต้นฉบับ</span></div></article>
        <article class="quality-card"><span class="quality-mark">!</span><div><strong>${formatNumber(sourceCount - uniqueCount)}</strong><span>แถวซ้ำที่ไม่นับซ้ำ</span></div></article>
        <article class="quality-card"><span class="quality-mark">◷</span><div><strong>${formatNumber(invalidCount)}</strong><span>วันที่ไม่ถูกต้อง</span></div></article>
        <article class="quality-card"><span class="quality-mark">↗</span><div><strong>${formatNumber(activeCount)}</strong><span>งานยังไม่ปิด — ช่องผลซ่อมว่างเป็นเรื่องคาดหมาย</span></div></article>
      </div>
      <div class="callout"><span class="callout-mark">i</span><div><strong>กติกาทำความสะอาด</strong><span>ตัดช่องว่างหัวท้ายข้อความ · ตัดแถวซ้ำที่เหมือนกันทุกฟิลด์เพียงรายการที่ซ้ำออก · ค่าว่างคงเดิม · ไม่แก้ค่าผิดปกติแบบเดาสุ่ม · ตัวชี้วัดแต่ละชุดใช้เฉพาะค่าที่ผ่านกฎของตัวเอง</span></div></div>
      <div class="table-panel" style="margin-bottom:15px"><div class="table-head"><div><h2>รายการที่ควรตรวจสอบ</h2><p>คงต้นฉบับไว้ และแสดงผลกระทบต่อการวิเคราะห์อย่างชัดเจน</p></div><span class="subtle-pill">${formatNumber(anomalies.length)} จุดข้อมูล</span></div>${issueTable}</div>
      <section class="panel"><div class="panel-head"><div><h2>Data dictionary</h2><p>ความหมายและหน่วยตามคอลัมน์ในไฟล์ต้นฉบับ</p></div><span class="panel-meta">11 ฟิลด์</span></div>
        <div class="dictionary">${dictionary.map(([name, description]) => `<div class="dictionary-row"><strong>${name}</strong><span>${description}</span></div>`).join("")}</div>
      </section>`;
  }

  function renderPage() {
    currentRows = getFilteredRows();
    pageNumber = 1;
    const renderers = {
      overview: renderOverview,
      jobs: renderJobs,
      backlog: renderBacklog,
      insights: renderInsights,
      quality: renderQuality
    };
    content.innerHTML = renderers[currentPage](currentRows);
    $("#breadcrumbTitle").textContent = PAGE_TITLES[currentPage];
    document.title = `FixFlow | ${PAGE_TITLES[currentPage]}`;
    $("#jobNavCount").textContent = formatNumber(distinctJobs().length);
    $("#backlogNavCount").textContent = formatNumber(distinctJobs().filter((job) => job.status !== "ซ่อมเสร็จ").length);
    content.querySelectorAll("[data-sort]").forEach((button) => button.addEventListener("click", () => {
      if (sortKey === button.dataset.sort) sortDirection = sortDirection === "asc" ? "desc" : "asc";
      else { sortKey = button.dataset.sort; sortDirection = "asc"; }
      renderPage();
    }));
    content.querySelectorAll("[data-page-number]").forEach((button) => button.addEventListener("click", () => {
      const target = Number(button.dataset.pageNumber);
      if (!button.disabled && target >= 1) { pageNumber = target; renderCurrentTablePage(); }
    }));
    const exportButton = $("#exportCsv");
    if (exportButton) exportButton.addEventListener("click", exportCsv);
  }

  function renderCurrentTablePage() {
    currentRows = getFilteredRows();
    if (currentPage === "jobs") {
      const panel = content.querySelector(".table-panel");
      const head = panel.querySelector(".table-head").outerHTML;
      panel.innerHTML = head + renderJobsTable(currentRows);
      bindTableEvents();
    } else if (currentPage === "backlog") {
      const panel = content.querySelector(".table-panel");
      const head = panel.querySelector(".table-head").outerHTML;
      panel.innerHTML = head + renderJobsTable(currentRows.filter((job) => job.status !== "ซ่อมเสร็จ"));
      bindTableEvents();
    }
  }

  function bindTableEvents() {
    content.querySelectorAll("[data-sort]").forEach((button) => button.addEventListener("click", () => {
      if (sortKey === button.dataset.sort) sortDirection = sortDirection === "asc" ? "desc" : "asc";
      else { sortKey = button.dataset.sort; sortDirection = "asc"; }
      renderCurrentTablePage();
    }));
    content.querySelectorAll("[data-page-number]").forEach((button) => button.addEventListener("click", () => {
      const target = Number(button.dataset.pageNumber);
      if (!button.disabled && target >= 1) { pageNumber = target; renderCurrentTablePage(); }
    }));
  }

  function exportCsv() {
    const fields = ["id", "date", "department", "device", "issue", "urgency", "status", "hours", "parts", "labor", "satisfaction"];
    const header = fields.map((field) => FIELD[field]);
    const rows = sortRows(getFilteredRows()).map((job) => fields.map((field) => {
      const value = field === "department" && !job[field] ? "ไม่ระบุ" : job[field];
      return `"${String(value ?? "").replace(/"/g, '""')}"`;
    }));
    const csv = [header, ...rows].map((row) => row.map((value) => {
      if (value.startsWith('"') && value.endsWith('"')) return value;
      return `"${String(value).replace(/"/g, '""')}"`;
    }).join(",")).join("\r\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "computer-repair-filtered.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  function updatePeriodLabel() {
    const validDates = distinctJobs().filter((job) => job.dateObject).map((job) => job.date).sort();
    if (validDates.length) $("#dataPeriod").textContent = `ข้อมูล ${formatDate(validDates[0])} – ${formatDate(validDates[validDates.length - 1])}`;
  }

  function populateFilters() {
    const records = distinctJobs();
    const dates = records.filter((job) => job.dateObject).map((job) => job.date).sort();
    if (dates.length) {
      $("#dateFrom").min = dates[0]; $("#dateFrom").max = dates[dates.length - 1];
      $("#dateTo").min = dates[0]; $("#dateTo").max = dates[dates.length - 1];
    }
    const populate = (id, values) => {
      const select = $(id);
      const firstOption = select.querySelector("option");
      select.replaceChildren(firstOption);
      values.forEach((value) => {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        select.append(option);
      });
    };
    populate("#statusFilter", [...new Set(records.map((job) => job.status).filter(Boolean))].sort((a, b) => a.localeCompare(b, "th")));
    populate("#urgencyFilter", [...new Set(records.map((job) => job.urgency).filter(Boolean))].sort((a, b) => (PRIORITY_ORDER[a] ?? 9) - (PRIORITY_ORDER[b] ?? 9)));
    populate("#departmentFilter", [...new Set(records.map((job) => job.department || "ไม่ระบุ"))].sort((a, b) => a.localeCompare(b, "th")));
  }

  function resetFilters() {
    $("#dateFrom").value = "";
    $("#dateTo").value = "";
    $("#statusFilter").value = "";
    $("#urgencyFilter").value = "";
    $("#departmentFilter").value = "";
    $("#searchFilter").value = "";
    renderPage();
  }

  function setupNavigation() {
    document.querySelectorAll(".nav-link").forEach((button) => button.addEventListener("click", () => {
      currentPage = button.dataset.page;
      document.querySelectorAll(".nav-link").forEach((item) => item.classList.toggle("active", item === button));
      renderPage();
      closeMobileMenu();
    }));
    $("#resetFilters").addEventListener("click", resetFilters);
    ["#dateFrom", "#dateTo", "#statusFilter", "#urgencyFilter", "#departmentFilter"].forEach((selector) => {
      $(selector).addEventListener("change", renderPage);
    });
    $("#searchFilter").addEventListener("input", () => {
      pageNumber = 1;
      renderPage();
    });
    $("#mobileMenu").addEventListener("click", () => {
      const open = $("#sidebar").classList.toggle("open");
      $("#mobileMenu").setAttribute("aria-expanded", String(open));
      $("#mobileBackdrop").classList.toggle("show", open);
    });
    $("#mobileBackdrop").addEventListener("click", closeMobileMenu);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMobileMenu();
    });
  }

  function closeMobileMenu() {
    $("#sidebar").classList.remove("open");
    $("#mobileBackdrop").classList.remove("show");
    $("#mobileMenu").setAttribute("aria-expanded", "false");
  }

  function showError(message) {
    content.innerHTML = `<div class="error-state"><span class="empty-symbol">!</span><strong>ไม่สามารถโหลดข้อมูลได้</strong><p>${escapeHtml(message)}</p><p>ตรวจสอบว่าไฟล์ data.js และ computer_repair_dirty_200.csv อยู่ในโฟลเดอร์เดียวกันกับเว็บไซต์</p></div>`;
  }

  function initialize() {
    try {
      if (!Array.isArray(window.REPAIR_DATA) || !window.REPAIR_DATA.length) {
        throw new Error("ไม่พบข้อมูลใน data.js");
      }
      allJobs = prepareJobs(window.REPAIR_DATA);
      populateFilters();
      updatePeriodLabel();
      setupNavigation();
      renderPage();
    } catch (error) {
      console.error("FixFlow initialization failed:", error);
      showError(error.message || "เกิดข้อผิดพลาดที่ไม่ทราบสาเหตุ");
    }
  }

  initialize();
})();
