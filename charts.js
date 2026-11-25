/* ============================================================
   ANKARA PALACE — LIGHTWEIGHT CANVAS CHARTING
   No external dependencies. Provides simple bar, line and
   doughnut charts tuned to the brand palette.
   ============================================================ */

(function () {
  "use strict";

  const PALETTE = ["#174C3C", "#B65F43", "#A7B9A3", "#C9A227", "#2C3E70", "#6E2B2B", "#4A5B47"];

  function prepareCanvas(canvas) {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const w = rect.width || canvas.clientWidth || 300;
    const h = rect.height || canvas.clientHeight || 200;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    const ctx = canvas.getContext("2d");
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx, w, h };
  }

  function drawAxes(ctx, w, h, pad) {
    ctx.strokeStyle = "#E4DDCF";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(pad.left, pad.top);
    ctx.lineTo(pad.left, h - pad.bottom);
    ctx.lineTo(w - pad.right, h - pad.bottom);
    ctx.stroke();
  }

  function niceMax(value) {
    if (value <= 0) return 10;
    const exp = Math.floor(Math.log10(value));
    const base = Math.pow(10, exp);
    const n = value / base;
    const niceN = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
    return niceN * base;
  }

  /* ---------- Bar chart ---------- */
  function bar(canvas, { labels, values, colors }) {
    if (!canvas) return;
    const { ctx, w, h } = prepareCanvas(canvas);
    const pad = { top: 20, right: 16, bottom: 42, left: 46 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const max = niceMax(Math.max(1, ...values));

    drawAxes(ctx, w, h, pad);

    // Grid
    ctx.strokeStyle = "#EFE8D9";
    ctx.fillStyle = "#6B6F6A";
    ctx.font = "11px 'DM Sans', sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      const val = max - (max / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillText(Math.round(val).toLocaleString(), pad.left - 6, y + 4);
    }

    if (values.length === 0) {
      ctx.fillStyle = "#6B6F6A";
      ctx.textAlign = "center";
      ctx.fillText("No data", w / 2, h / 2);
      return;
    }

    const gap = 8;
    const bw = (chartW - gap * (values.length - 1)) / values.length;

    values.forEach((v, i) => {
      const bh = (v / max) * chartH;
      const x = pad.left + i * (bw + gap);
      const y = pad.top + chartH - bh;
      ctx.fillStyle = (colors && colors[i]) || PALETTE[i % PALETTE.length];
      const radius = Math.min(4, bw / 2);
      // Rounded top bar
      ctx.beginPath();
      ctx.moveTo(x, y + bh);
      ctx.lineTo(x, y + radius);
      ctx.quadraticCurveTo(x, y, x + radius, y);
      ctx.lineTo(x + bw - radius, y);
      ctx.quadraticCurveTo(x + bw, y, x + bw, y + radius);
      ctx.lineTo(x + bw, y + bh);
      ctx.closePath();
      ctx.fill();

      // Label
      ctx.fillStyle = "#6B6F6A";
      ctx.textAlign = "center";
      ctx.font = "11px 'DM Sans', sans-serif";
      const label = labels[i] || "";
      ctx.fillText(label, x + bw / 2, h - pad.bottom + 16);
    });
  }

  /* ---------- Line chart ---------- */
  function line(canvas, { labels, values }) {
    if (!canvas) return;
    const { ctx, w, h } = prepareCanvas(canvas);
    const pad = { top: 20, right: 16, bottom: 42, left: 46 };
    const chartW = w - pad.left - pad.right;
    const chartH = h - pad.top - pad.bottom;
    const max = niceMax(Math.max(1, ...values));

    drawAxes(ctx, w, h, pad);

    ctx.strokeStyle = "#EFE8D9";
    ctx.fillStyle = "#6B6F6A";
    ctx.font = "11px 'DM Sans', sans-serif";
    ctx.textAlign = "right";
    for (let i = 0; i <= 4; i++) {
      const y = pad.top + (chartH / 4) * i;
      const val = max - (max / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad.left, y);
      ctx.lineTo(w - pad.right, y);
      ctx.stroke();
      ctx.fillText(Math.round(val).toLocaleString(), pad.left - 6, y + 4);
    }

    if (values.length === 0) {
      ctx.fillStyle = "#6B6F6A";
      ctx.textAlign = "center";
      ctx.fillText("No data", w / 2, h / 2);
      return;
    }

    const stepX = values.length > 1 ? chartW / (values.length - 1) : chartW;
    const points = values.map((v, i) => ({
      x: pad.left + i * stepX,
      y: pad.top + chartH - (v / max) * chartH
    }));

    // Area fill
    const grad = ctx.createLinearGradient(0, pad.top, 0, h - pad.bottom);
    grad.addColorStop(0, "rgba(23,76,60,0.25)");
    grad.addColorStop(1, "rgba(23,76,60,0.02)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(points[0].x, h - pad.bottom);
    points.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(points[points.length - 1].x, h - pad.bottom);
    ctx.closePath();
    ctx.fill();

    // Line
    ctx.strokeStyle = "#174C3C";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();

    // Dots
    points.forEach((p) => {
      ctx.fillStyle = "#B65F43";
      ctx.beginPath();
      ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#FFFFFF";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    });

    // Labels
    ctx.fillStyle = "#6B6F6A";
    ctx.textAlign = "center";
    const every = Math.max(1, Math.floor(labels.length / 8));
    labels.forEach((l, i) => {
      if (i % every === 0 || i === labels.length - 1) {
        ctx.fillText(l, points[i].x, h - pad.bottom + 16);
      }
    });
  }

  /* ---------- Doughnut chart ---------- */
  function doughnut(canvas, { labels, values, colors }) {
    if (!canvas) return;
    const { ctx, w, h } = prepareCanvas(canvas);
    const cx = w / 2;
    const cy = h / 2;
    const radius = Math.min(w, h) / 2 - 20;
    const inner = radius * 0.6;

    const total = values.reduce((s, v) => s + v, 0);
    if (total === 0) {
      ctx.fillStyle = "#6B6F6A";
      ctx.font = "13px 'DM Sans', sans-serif";
      ctx.textAlign = "center";
      ctx.fillText("No data", cx, cy);
      return;
    }

    let angle = -Math.PI / 2;
    values.forEach((v, i) => {
      const slice = (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, radius, angle, angle + slice);
      ctx.closePath();
      ctx.fillStyle = (colors && colors[i]) || PALETTE[i % PALETTE.length];
      ctx.fill();
      angle += slice;
    });

    // Inner hole
    ctx.beginPath();
    ctx.arc(cx, cy, inner, 0, Math.PI * 2);
    ctx.fillStyle = "#FFFFFF";
    ctx.fill();

    // Center label
    ctx.fillStyle = "#252925";
    ctx.textAlign = "center";
    ctx.font = "600 13px 'DM Sans', sans-serif";
    ctx.fillText("Total", cx, cy - 4);
    ctx.font = "700 18px 'Playfair Display', serif";
    ctx.fillStyle = "#174C3C";
    ctx.fillText(String(total), cx, cy + 16);

    // Legend
    const legendY = h - 6;
    let lx = 10;
    labels.forEach((label, i) => {
      const textW = ctx.measureText(label).width + 20;
      if (lx + textW > w - 10) return;
      ctx.fillStyle = (colors && colors[i]) || PALETTE[i % PALETTE.length];
      ctx.fillRect(lx, legendY - 8, 8, 8);
      ctx.fillStyle = "#6B6F6A";
      ctx.font = "11px 'DM Sans', sans-serif";
      ctx.textAlign = "left";
      ctx.fillText(label, lx + 12, legendY - 1);
      lx += textW;
    });
  }

  window.APCharts = { bar, line, doughnut };
})();