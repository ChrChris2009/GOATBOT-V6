"use strict";

const axios  = require("axios");
const fs     = require("fs-extra");
const path   = require("path");
const { Canvas, loadImage, registerFont } = require("canvas");

const FONT_DIR = path.resolve(__dirname, "cache", "fonts");
const FNT      = "NotoSans, NotoSansBengali, NotoEmoji, sans-serif";
const UA       = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124.0.0.0 Safari/537.36";

const TIERS = [
    { min: 0,    max: 499,  name: "BASIC",     color: "#8899aa", rgb: "136,153,170", symbol: "◇", glow: false  },
    { min: 500,  max: 999,  name: "IRON",      color: "#cd7f32", rgb: "205,127,50",  symbol: "◆", glow: false  },
    { min: 1000, max: 1999, name: "SILVER",    color: "#c0d0e0", rgb: "192,208,224", symbol: "◈", glow: false  },
    { min: 2000, max: 3499, name: "GOLD",      color: "#ffd700", rgb: "255,215,0",   symbol: "✦", glow: true   },
    { min: 3500, max: 4999, name: "ELITE",     color: "#00cfff", rgb: "0,207,255",   symbol: "⬡", glow: true   },
    { min: 5000, max: 6499, name: "SUPREME",   color: "#00ff88", rgb: "0,255,136",   symbol: "❋", glow: true   },
    { min: 6500, max: 7999, name: "MYTHIC",    color: "#ff4ecd", rgb: "255,78,205",  symbol: "✸", glow: true   },
    { min: 8000, max: 8999, name: "LEGENDARY", color: "#ff6b35", rgb: "255,107,53",  symbol: "⚡", glow: true   },
    { min: 9000, max: 9799, name: "DIVINE",    color: "#e8f4ff", rgb: "232,244,255", symbol: "☯", glow: true   },
    { min: 9800, max: 9999, name: "G·O·D",    color: "#ffd700", rgb: "255,215,0",   symbol: "⚔", glow: true   },
];

function getTier(p)   { return TIERS.find(t => p >= t.min && p <= t.max) || TIERS[0]; }
function fmtK(n)      { return n >= 1000 ? (n / 1000).toFixed(1) + "K" : String(n); }

async function makeFallback(uid, name) {
    const c    = new Canvas(256, 256);
    const cx   = c.getContext("2d");
    const COLS = ["#e74c3c","#3498db","#2ecc71","#f39c12","#9b59b6","#1abc9c","#e67e22","#e91e63"];
    const i    = String(uid || "0").split("").reduce((s, ch) => s + ch.charCodeAt(0), 0) % COLS.length;
    const g    = cx.createLinearGradient(0, 0, 256, 256);
    g.addColorStop(0, COLS[i]); g.addColorStop(1, COLS[(i + 3) % COLS.length]);
    cx.fillStyle = g; cx.fillRect(0, 0, 256, 256);
    cx.fillStyle = "rgba(0,0,0,0.25)"; cx.fillRect(0, 0, 256, 256);
    cx.fillStyle = "#fff"; cx.font = "bold 100px NotoSans, sans-serif";
    cx.textAlign = "center"; cx.textBaseline = "middle";
    cx.fillText((name || "?")[0].toUpperCase(), 128, 136);
    return loadImage(c.toBuffer());
}

async function getAvatar(uid, name, api) {
    if (!uid) return makeFallback(uid, name);
    if (api) {
        try {
            const info = await new Promise((rs, rj) => api.getUserInfo([uid], (e, r) => e ? rj(e) : rs(r)));
            const src  = info?.[uid]?.thumbSrc || info?.[uid]?.profilePicture;
            if (src) {
                const r = await axios.get(src, { responseType: "arraybuffer", timeout: 10000, maxRedirects: 10, headers: { "User-Agent": UA } });
                if ((r.headers["content-type"] || "").includes("image") && r.data?.byteLength > 500)
                    return loadImage(Buffer.from(r.data));
            }
        } catch {}
    }
    for (const url of [
        `https://graph.facebook.com/${uid}/picture?width=512&height=512&type=square&redirect=true`,
        `https://graph.facebook.com/${uid}/picture?width=256&height=256&type=large`,
    ]) {
        try {
            const r = await axios.get(url, { responseType: "arraybuffer", timeout: 10000, maxRedirects: 10, headers: { "User-Agent": UA } });
            if ((r.headers["content-type"] || "").includes("image") && r.data?.byteLength > 800)
                return loadImage(Buffer.from(r.data));
        } catch {}
    }
    return makeFallback(uid, name);
}

function clipCircle(ctx, img, x, y, r) {
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.clip();
    ctx.drawImage(img, x - r, y - r, r * 2, r * 2); ctx.restore();
}

function hexGrid(ctx, W, H, rgb, alpha) {
    const s = 24;
    ctx.strokeStyle = `rgba(${rgb},${alpha})`; ctx.lineWidth = 0.5;
    for (let row = -1; row < H / (s * 1.5) + 2; row++) {
        for (let col = -1; col < W / (s * 1.73) + 2; col++) {
            const ox = row % 2 ? s * 0.866 : 0;
            const hx = col * s * 1.73 + ox, hy = row * s * 1.5;
            ctx.beginPath();
            for (let k = 0; k < 6; k++) {
                const a = (Math.PI / 3) * k + Math.PI / 6;
                k === 0 ? ctx.moveTo(hx + s * Math.cos(a), hy + s * Math.sin(a))
                        : ctx.lineTo(hx + s * Math.cos(a), hy + s * Math.sin(a));
            }
            ctx.closePath(); ctx.stroke();
        }
    }
}

function scanlines(ctx, W, H) {
    for (let y = 0; y < H; y += 4) {
        ctx.fillStyle = "rgba(0,0,0,0.018)";
        ctx.fillRect(0, y, W, 2);
    }
}

function glassRect(ctx, x, y, w, h, rgb, radius = 10, fillA = 0.07, strokeA = 0.22) {
    ctx.save();
    ctx.fillStyle = `rgba(${rgb},${fillA})`;
    ctx.beginPath(); ctx.roundRect(x, y, w, h, radius); ctx.fill();
    ctx.strokeStyle = `rgba(${rgb},${strokeA})`; ctx.lineWidth = 1;
    ctx.stroke(); ctx.restore();
}

function corners(ctx, W, H, color, sz = 38) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = 3; ctx.lineCap = "square";
    ctx.shadowColor = color; ctx.shadowBlur = 26;
    const M = 10;
    for (const [ox, oy, dx, dy] of [[M,M,1,1],[W-M,M,-1,1],[M,H-M,1,-1],[W-M,H-M,-1,-1]]) {
        ctx.beginPath();
        ctx.moveTo(ox, oy + sz * dy); ctx.lineTo(ox, oy); ctx.lineTo(ox + sz * dx, oy);
        ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.restore();
}

async function buildAuraCard(avatarImg, name, power, uid, msgCount, memberCount, rank) {
    const W       = 1080;
    const H       = 580;
    const tier    = getTier(power);
    const { color, rgb, symbol, glow } = tier;

    const LPAD    = 14;
    const LW      = 198;
    const CX      = LW + 20 + 170;
    const CY      = H / 2 + 18;
    const AVR     = 108;
    const RX      = LW + 20 + 340 + 16;
    const RW      = W - RX - 14;

    const canvas = new Canvas(W, H);
    const ctx    = canvas.getContext("2d");

    ctx.fillStyle = "#030810"; ctx.fillRect(0, 0, W, H);

    const bgG = ctx.createRadialGradient(CX, CY, 0, CX, CY, 400);
    bgG.addColorStop(0, `rgba(${rgb},0.1)`); bgG.addColorStop(0.5, `rgba(${rgb},0.04)`); bgG.addColorStop(1, "transparent");
    ctx.fillStyle = bgG; ctx.fillRect(0, 0, W, H);

    const bgG2 = ctx.createRadialGradient(RX + RW * 0.6, H * 0.3, 0, RX + RW * 0.6, H * 0.3, 280);
    bgG2.addColorStop(0, `rgba(${rgb},0.06)`); bgG2.addColorStop(1, "transparent");
    ctx.fillStyle = bgG2; ctx.fillRect(0, 0, W, H);

    hexGrid(ctx, W, H, rgb, 0.038);
    scanlines(ctx, W, H);

    const TOP_H = 44;
    const hG = ctx.createLinearGradient(0, 0, W, 0);
    hG.addColorStop(0, "rgba(0,0,0,0)");
    hG.addColorStop(0.06, `rgba(${rgb},0.14)`);
    hG.addColorStop(0.94, `rgba(${rgb},0.14)`);
    hG.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = hG; ctx.fillRect(0, 0, W, TOP_H);
    ctx.strokeStyle = `rgba(${rgb},0.3)`; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, TOP_H); ctx.lineTo(W, TOP_H); ctx.stroke();

    ctx.font = `bold 11px ${FNT}`; ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = 10;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText("◈  GOATBOT  ·  AURA  SCANNER", LPAD + 4, TOP_H / 2);
    ctx.shadowBlur = 0;

    ctx.font = `10px ${FNT}`; ctx.fillStyle = `rgba(${rgb},0.45)`;
    ctx.textAlign = "center";
    ctx.fillText("[ POWER ANALYSIS SYSTEM ]", W / 2, TOP_H / 2);

    ctx.font = `9px ${FNT}`; ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.textAlign = "right";
    ctx.fillText(`uid: ${uid || "—"}`, W - LPAD - 4, TOP_H / 2);

    const tierAreaY = TOP_H + 10;
    const tierAreaH = H - TOP_H - 10 - 14;
    glassRect(ctx, LPAD, tierAreaY, LW, tierAreaH, rgb, 12, 0.05, 0.16);

    ctx.font = `bold 8px ${FNT}`; ctx.fillStyle = `rgba(${rgb},0.55)`;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.letterSpacing = "2.5px";
    ctx.fillText("TIER SCALE", LPAD + LW / 2, tierAreaY + 10);
    ctx.letterSpacing = "0px";

    const tierSlotH = (tierAreaH - 30) / TIERS.length;
    for (let i = TIERS.length - 1; i >= 0; i--) {
        const t          = TIERS[i];
        const slotIndex  = TIERS.length - 1 - i;
        const ty         = tierAreaY + 26 + slotIndex * tierSlotH;
        const isCurrent  = t.name === tier.name;

        if (isCurrent) {
            ctx.fillStyle = `rgba(${t.rgb},0.18)`;
            ctx.shadowColor = t.color; ctx.shadowBlur = 12;
            ctx.beginPath(); ctx.roundRect(LPAD + 6, ty, LW - 12, tierSlotH - 2, 6); ctx.fill();
            ctx.strokeStyle = `rgba(${t.rgb},0.55)`; ctx.lineWidth = 1;
            ctx.beginPath(); ctx.roundRect(LPAD + 6, ty, LW - 12, tierSlotH - 2, 6); ctx.stroke();
            ctx.shadowBlur = 0;
        }

        ctx.font = isCurrent ? `bold 13px ${FNT}` : `11px ${FNT}`;
        ctx.fillStyle = isCurrent ? t.color : `rgba(${t.rgb},${power > t.max ? 0.65 : 0.28})`;
        if (isCurrent && t.glow) { ctx.shadowColor = t.color; ctx.shadowBlur = 8; }
        ctx.textAlign = "left"; ctx.textBaseline = "middle";
        ctx.fillText(t.symbol, LPAD + 14, ty + tierSlotH / 2);
        ctx.shadowBlur = 0;

        ctx.font = isCurrent ? `bold 11px ${FNT}` : `9px ${FNT}`;
        ctx.fillStyle = isCurrent ? "#fff" : `rgba(255,255,255,${power > t.max ? 0.4 : 0.18})`;
        ctx.fillText(t.name, LPAD + 30, ty + tierSlotH / 2);

        if (isCurrent) {
            ctx.font = `bold 9px ${FNT}`; ctx.fillStyle = t.color;
            ctx.textAlign = "right";
            ctx.fillText("▶", LPAD + LW - 14, ty + tierSlotH / 2);
        }
    }

    const divX = LW + 18;
    const divG = ctx.createLinearGradient(divX, TOP_H + 20, divX, H - 20);
    divG.addColorStop(0, "transparent");
    divG.addColorStop(0.12, `rgba(${rgb},0.3)`);
    divG.addColorStop(0.88, `rgba(${rgb},0.3)`);
    divG.addColorStop(1, "transparent");
    ctx.strokeStyle = divG; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(divX, TOP_H + 20); ctx.lineTo(divX, H - 16); ctx.stroke();

    const avGlow = ctx.createRadialGradient(CX, CY, 0, CX, CY, AVR + 80);
    avGlow.addColorStop(0, `rgba(${rgb},0.28)`);
    avGlow.addColorStop(0.5, `rgba(${rgb},0.08)`);
    avGlow.addColorStop(1, "transparent");
    ctx.fillStyle = avGlow;
    ctx.fillRect(CX - AVR - 90, TOP_H, (AVR + 90) * 2, H - TOP_H);

    for (const [rr, op, lw, dash] of [
        [AVR + 58, 0.06, 0.7, [4, 10]],
        [AVR + 38, 0.1,  0.9, [3, 7]],
        [AVR + 20, 0.15, 1.2, []],
    ]) {
        ctx.strokeStyle = `rgba(${rgb},${op})`; ctx.lineWidth = lw;
        ctx.setLineDash(dash);
        ctx.beginPath(); ctx.arc(CX, CY, rr, 0, Math.PI * 2); ctx.stroke();
        ctx.setLineDash([]);
    }

    const arcR  = AVR + 46;
    const arcSt = Math.PI * 0.6, arcEn = Math.PI * 2.4;
    ctx.strokeStyle = "rgba(255,255,255,0.06)"; ctx.lineWidth = 11; ctx.lineCap = "round";
    ctx.beginPath(); ctx.arc(CX, CY, arcR, arcSt, arcEn); ctx.stroke();

    const arcFill = arcSt + (arcEn - arcSt) * (power / 9999);
    if (arcFill > arcSt) {
        const arcG = ctx.createLinearGradient(
            CX + Math.cos(arcSt) * arcR, CY + Math.sin(arcSt) * arcR,
            CX + Math.cos(arcFill) * arcR, CY + Math.sin(arcFill) * arcR
        );
        arcG.addColorStop(0, `rgba(${rgb},0.35)`); arcG.addColorStop(1, color);
        ctx.strokeStyle = arcG; ctx.shadowColor = color; ctx.shadowBlur = glow ? 20 : 8;
        ctx.beginPath(); ctx.arc(CX, CY, arcR, arcSt, arcFill); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = glow ? 22 : 8;
        ctx.beginPath();
        ctx.arc(CX + Math.cos(arcFill) * arcR, CY + Math.sin(arcFill) * arcR, 7, 0, Math.PI * 2);
        ctx.fill(); ctx.shadowBlur = 0;
    }
    ctx.lineCap = "butt";

    ctx.strokeStyle = color; ctx.lineWidth = 4;
    ctx.shadowColor = color; ctx.shadowBlur = glow ? 36 : 16;
    ctx.beginPath(); ctx.arc(CX, CY, AVR + 8, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;

    for (let s = 0; s < 16; s++) {
        const a1 = (s / 16) * Math.PI * 2 - Math.PI / 2;
        const a2 = a1 + (Math.PI / 16) * 0.5;
        ctx.strokeStyle = `rgba(${rgb},${s % 4 === 0 ? 0.35 : 0.12})`;
        ctx.lineWidth   = s % 4 === 0 ? 2 : 1;
        ctx.beginPath(); ctx.arc(CX, CY, AVR + 60, a1, a2); ctx.stroke();
    }

    clipCircle(ctx, avatarImg, CX, CY, AVR);

    const vigG = ctx.createRadialGradient(CX, CY, AVR * 0.62, CX, CY, AVR);
    vigG.addColorStop(0, "transparent");
    vigG.addColorStop(1, "rgba(0,0,0,0.22)");
    ctx.save(); ctx.beginPath(); ctx.arc(CX, CY, AVR, 0, Math.PI * 2); ctx.clip();
    ctx.fillStyle = vigG; ctx.fillRect(CX - AVR, CY - AVR, AVR * 2, AVR * 2); ctx.restore();

    const symY = CY + AVR + 16;
    const symPillW = 60, symPillH = 30;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.beginPath(); ctx.roundRect(CX - symPillW / 2, symY, symPillW, symPillH, 15); ctx.fill();
    ctx.strokeStyle = color; ctx.lineWidth = 1.5;
    ctx.shadowColor = color; ctx.shadowBlur = glow ? 16 : 6;
    ctx.beginPath(); ctx.roundRect(CX - symPillW / 2, symY, symPillW, symPillH, 15); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.font = `bold 16px ${FNT}`; ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = glow ? 12 : 4;
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(symbol, CX, symY + symPillH / 2); ctx.shadowBlur = 0;

    ctx.font = `bold 16px ${FNT}`; ctx.fillStyle = "#fff";
    ctx.shadowColor = color; ctx.shadowBlur = glow ? 10 : 0;
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    const dispName = name.length > 20 ? name.slice(0, 20) + "…" : name;
    ctx.fillText(dispName, CX, symY + symPillH + 8);
    ctx.shadowBlur = 0;

    const divX2 = RX - 8;
    const divG2 = ctx.createLinearGradient(divX2, TOP_H + 20, divX2, H - 20);
    divG2.addColorStop(0, "transparent");
    divG2.addColorStop(0.12, `rgba(${rgb},0.22)`);
    divG2.addColorStop(0.88, `rgba(${rgb},0.22)`);
    divG2.addColorStop(1, "transparent");
    ctx.strokeStyle = divG2; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(divX2, TOP_H + 20); ctx.lineTo(divX2, H - 16); ctx.stroke();

    const ry = TOP_H + 20;

    glassRect(ctx, RX, ry, RW, 70, rgb, 10, 0.08, 0.25);
    ctx.shadowColor = color; ctx.shadowBlur = glow ? 24 : 10;
    ctx.font = `bold 22px ${FNT}`; ctx.fillStyle = color;
    ctx.textAlign = "left"; ctx.textBaseline = "middle";
    ctx.fillText(tier.name, RX + 16, ry + 30);
    ctx.shadowBlur = 0;
    ctx.font = `bold 24px ${FNT}`; ctx.fillStyle = color;
    ctx.textAlign = "right"; ctx.textBaseline = "middle";
    ctx.shadowColor = color; ctx.shadowBlur = glow ? 20 : 6;
    ctx.fillText(symbol, RX + RW - 16, ry + 30);
    ctx.shadowBlur = 0;
    ctx.font = `9px ${FNT}`; ctx.fillStyle = `rgba(${rgb},0.45)`;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.letterSpacing = "2px";
    ctx.fillText("CURRENT TIER", RX + 16, ry + 50);
    ctx.letterSpacing = "0px";

    const plY = ry + 84;
    ctx.font = `8px ${FNT}`; ctx.fillStyle = `rgba(${rgb},0.5)`;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.letterSpacing = "2.5px"; ctx.fillText("AURA POWER LEVEL", RX, plY); ctx.letterSpacing = "0px";

    ctx.font = `bold 76px ${FNT}`; ctx.fillStyle = color;
    ctx.shadowColor = color; ctx.shadowBlur = glow ? 36 : 14;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText(power.toLocaleString(), RX, plY + 12);
    ctx.shadowBlur = 0;

    ctx.font = `13px ${FNT}`; ctx.fillStyle = `rgba(255,255,255,0.2)`;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("/ 9,999", RX, plY + 98);

    const pbY = plY + 122;
    const pbH = 13;
    const prog = (power / 9999) * RW;

    ctx.fillStyle = "rgba(255,255,255,0.06)";
    ctx.beginPath(); ctx.roundRect(RX, pbY, RW, pbH, pbH / 2); ctx.fill();

    if (prog > 0) {
        const pG = ctx.createLinearGradient(RX, 0, RX + prog, 0);
        pG.addColorStop(0, `rgba(${rgb},0.4)`); pG.addColorStop(1, color);
        ctx.fillStyle = pG; ctx.shadowColor = color; ctx.shadowBlur = glow ? 16 : 6;
        ctx.beginPath(); ctx.roundRect(RX, pbY, Math.max(8, prog), pbH, pbH / 2); ctx.fill();
        ctx.shadowBlur = 0;
        ctx.fillStyle = "#fff"; ctx.shadowColor = color; ctx.shadowBlur = glow ? 22 : 8;
        ctx.beginPath(); ctx.arc(RX + Math.max(8, prog), pbY + pbH / 2, pbH / 2 + 2, 0, Math.PI * 2); ctx.fill();
        ctx.shadowBlur = 0;
    }

    ctx.font = `9px ${FNT}`; ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.fillText("0", RX, pbY + pbH + 6);
    ctx.textAlign = "right";
    ctx.fillText("9,999", RX + RW, pbY + pbH + 6);

    const nextTier = TIERS.find(t => t.min > power);
    if (nextTier) {
        const gap = nextTier.min - power;
        ctx.textAlign = "center"; ctx.font = `9px ${FNT}`;
        ctx.fillStyle = "rgba(255,255,255,0.28)";
        ctx.fillText(`${gap.toLocaleString()} pts to ${nextTier.name}  ·  ${Math.round((power / nextTier.min) * 100)}%`, RX + RW / 2, pbY + pbH + 6);
    }

    const pillY  = pbY + pbH + 32;
    const pills  = [
        { label: "TIER",   value: tier.name.split("·")[0].trim().split(" ")[0] },
        { label: "POWER",  value: fmtK(power) },
        { label: "MSGS",   value: fmtK(msgCount || 0) },
        { label: "RANK",   value: rank ? `#${rank}` : "—" },
    ];
    const pillW  = Math.floor((RW - (pills.length - 1) * 8) / pills.length);
    let   pillX  = RX;
    for (const p of pills) {
        glassRect(ctx, pillX, pillY, pillW, 58, rgb, 10, 0.08, 0.25);
        ctx.font = `7px ${FNT}`; ctx.fillStyle = `rgba(${rgb},0.55)`;
        ctx.textAlign = "center"; ctx.textBaseline = "top";
        ctx.letterSpacing = "2px"; ctx.fillText(p.label, pillX + pillW / 2, pillY + 9); ctx.letterSpacing = "0px";
        ctx.font = `bold 18px ${FNT}`; ctx.fillStyle = color;
        if (glow) { ctx.shadowColor = color; ctx.shadowBlur = 8; }
        ctx.textBaseline = "middle";
        ctx.fillText(p.value, pillX + pillW / 2, pillY + 36);
        ctx.shadowBlur = 0;
        pillX += pillW + 8;
    }

    const actY = pillY + 72;
    glassRect(ctx, RX, actY, RW, 44, rgb, 8, 0.06, 0.18);
    ctx.font = `8px ${FNT}`; ctx.fillStyle = `rgba(${rgb},0.5)`;
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.letterSpacing = "2px"; ctx.fillText("ACTIVITY  SCORE", RX + 10, actY + 8); ctx.letterSpacing = "0px";

    const actScore = Math.min(100, Math.round(((msgCount || 0) / Math.max(memberCount || 1, 1)) * 10));
    const actW     = RW - 20;
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.beginPath(); ctx.roundRect(RX + 10, actY + 24, actW, 10, 5); ctx.fill();
    const aFill = (actScore / 100) * actW;
    if (aFill > 0) {
        const aG = ctx.createLinearGradient(RX + 10, 0, RX + 10 + aFill, 0);
        aG.addColorStop(0, `rgba(${rgb},0.4)`); aG.addColorStop(1, color);
        ctx.fillStyle = aG; ctx.shadowColor = color; ctx.shadowBlur = glow ? 10 : 4;
        ctx.beginPath(); ctx.roundRect(RX + 10, actY + 24, Math.max(8, aFill), 10, 5); ctx.fill();
        ctx.shadowBlur = 0;
    }
    ctx.font = `bold 10px ${FNT}`; ctx.fillStyle = color;
    ctx.textAlign = "right"; ctx.textBaseline = "top";
    ctx.fillText(`${actScore}%`, RX + RW - 10, actY + 8);

    const bG = ctx.createLinearGradient(0, 0, W, H);
    bG.addColorStop(0, `rgba(${rgb},0.7)`); bG.addColorStop(0.5, `rgba(${rgb},0.3)`); bG.addColorStop(1, `rgba(${rgb},0.7)`);
    ctx.strokeStyle = bG; ctx.lineWidth = 1.5;
    ctx.shadowColor = color; ctx.shadowBlur = 18;
    ctx.beginPath(); ctx.roundRect(5, 5, W - 10, H - 10, 16); ctx.stroke(); ctx.shadowBlur = 0;
    corners(ctx, W, H, color);

    return canvas.toBuffer("image/jpeg", { quality: 0.95 });
}

module.exports = {
    config: {
        name:        "aura",
        aliases:     ["laura", "power"],
        version:     "4.0.0",
        author:      "SIFAT",
        countDown:   12,
        role:        0,
        description: { en: "Scan your aura power level — cinematic card with tier ladder" },
        category:    "fun",
        guide:       { en: "   {pn}       → your aura card\n   {pn} @tag  → tagged user's aura" },
    },

    onLoad: async function () {
        fs.ensureDirSync(FONT_DIR);
        const fonts = [
            { file: path.join(FONT_DIR, "NotoSans-Bold.ttf"),          url: "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Bold.ttf",                  family: "NotoSans",        weight: "bold"   },
            { file: path.join(FONT_DIR, "NotoSans-Regular.ttf"),        url: "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSans/NotoSans-Regular.ttf",                family: "NotoSans",        weight: "normal" },
            { file: path.join(FONT_DIR, "NotoSansBengali-Bold.ttf"),    url: "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansBengali/NotoSansBengali-Bold.ttf",    family: "NotoSansBengali", weight: "bold"   },
            { file: path.join(FONT_DIR, "NotoSansBengali-Regular.ttf"), url: "https://raw.githubusercontent.com/googlefonts/noto-fonts/main/hinted/ttf/NotoSansBengali/NotoSansBengali-Regular.ttf", family: "NotoSansBengali", weight: "normal" },
            { file: path.join(FONT_DIR, "NotoEmoji-Regular.ttf"),       url: "https://raw.githubusercontent.com/googlefonts/noto-emoji/main/fonts/Noto-COLRv1-noflags.ttf",                         family: "NotoEmoji",       weight: "normal" },
        ];
        const dl = (url, dest) => new Promise((res, rej) => {
            const file = fs.createWriteStream(dest);
            const req  = u => require("https").get(u, r => {
                if (r.statusCode === 301 || r.statusCode === 302) return req(r.headers.location);
                r.pipe(file); file.on("finish", () => { file.close(); res(); });
            }).on("error", e => { try { fs.unlinkSync(dest); } catch {} rej(e); });
            req(url);
        });
        for (const f of fonts) {
            try {
                if (!fs.existsSync(f.file)) await dl(f.url, f.file);
                registerFont(f.file, { family: f.family, weight: f.weight });
            } catch (e) { console.error("[aura] font:", e.message); }
        }
    },

    onStart: async function ({ args, message, event, threadsData, api }) {
        const { threadID, senderID, mentions, type, messageReply } = event;

        let targetUID  = senderID;

        if (type === "message_reply" && messageReply?.senderID) targetUID = messageReply.senderID;
        else if (Object.keys(mentions || {}).length > 0) targetUID = Object.keys(mentions)[0];

        try {
            const members     = (await threadsData.get(threadID, "members")) || [];
            const m           = members.find(u => u.userID == targetUID);
            const targetName  = m?.name || "Facebook User";
            const msgCount    = m?.count || 0;
            const memberCount = members.length;

            const sortedMembers = [...members].sort((a, b) => (b.count || 0) - (a.count || 0));
            const rank          = sortedMembers.findIndex(u => u.userID == targetUID) + 1;

            const base  = Math.min(msgCount * 4, 4500);
            const rand  = Math.floor(Math.random() * 5500);
            const power = Math.min(9999, base + rand);

            const wait = await message.reply("⚡ Scanning aura...");
            const avatarImg = await getAvatar(targetUID, targetName, api);

            fs.ensureDirSync(path.resolve(__dirname, "cache"));
            const imgBuf  = await buildAuraCard(avatarImg, targetName, power, targetUID, msgCount, memberCount, rank || null);
            const outPath = path.resolve(__dirname, "cache", `aura_${targetUID}_${Date.now()}.jpg`);
            fs.writeFileSync(outPath, imgBuf);

            try { if (wait?.messageID) await message.unsend(wait.messageID); } catch {}
            await message.reply({ body: "", attachment: fs.createReadStream(outPath) });
            setTimeout(() => fs.unlink(outPath).catch(() => {}), 30_000);

        } catch (err) {
            console.error("[aura]", err);
            message.reply("❌ Error: " + err.message);
        }
    },
};
