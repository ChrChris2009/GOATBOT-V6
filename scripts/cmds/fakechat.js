const axios = require("axios");
const fs    = require("fs-extra");
const path  = require("path");
const { createCanvas, loadImage } = require("canvas");

const TMP = path.join(process.cwd(), "scripts", "tmp");

const THEMES = {
    love: {
        bg:          ["#1A0008", "#2D0018", "#1A000F"],
        hBg:         "#1C000A",
        hLine:       "rgba(255,23,68,0.16)",
        bubble:      ["#3D0020", "#2A0016"],
        bBorder:     ["rgba(255,107,157,0.72)", "rgba(255,23,68,0.42)"],
        name:        "#FF6B9D",
        text:        "#FFE4ED",
        time:        "rgba(255,107,157,0.58)",
        seen:        "#FF6B9D",
        hName:       "#FF9AB5",
        hSub:        "rgba(255,107,157,0.54)",
        accent:      ["rgba(255,23,68,0)", "rgba(255,23,68,0.62)", "rgba(255,23,68,0)"],
        ring:        "rgba(255,23,68,0.48)",
        online:      "#FF6B9D",
        back:        "#FF6B9D",
        btnFill:     "rgba(255,23,68,0.12)",
        btnIcon:     "rgba(255,107,157,0.72)",
        rxBg:        "#1A0008",
        rxFill:      "#FF1744",
        seenLabel:   "Seen ❤️",
        decor:       "hearts",
    },
    dark: {
        bg:          ["#0F0F0F", "#111111", "#0A0A0A"],
        hBg:         "#1A1A1A",
        hLine:       "rgba(255,255,255,0.06)",
        bubble:      ["#303030", "#282828"],
        bBorder:     ["rgba(255,255,255,0.08)", "rgba(255,255,255,0.03)"],
        name:        "#E4E6EB",
        text:        "#FFFFFF",
        time:        "rgba(140,140,140,0.68)",
        seen:        "rgba(170,170,170,0.88)",
        hName:       "#E4E6EB",
        hSub:        "#65676B",
        accent:      ["rgba(0,180,255,0)", "rgba(0,180,255,0.24)", "rgba(0,180,255,0)"],
        ring:        "rgba(0,180,255,0.2)",
        online:      "#31A24C",
        back:        "#00B4FF",
        btnFill:     "rgba(0,180,255,0.09)",
        btnIcon:     "rgba(0,180,255,0.68)",
        rxBg:        "#111111",
        rxFill:      "#FF1744",
        seenLabel:   "Seen",
        decor:       null,
    },
    light: {
        bg:          ["#F0F2F5", "#E8EAED", "#EFF1F5"],
        hBg:         "#FFFFFF",
        hLine:       "rgba(0,0,0,0.08)",
        bubble:      ["#E4E6EB", "#D8DADF"],
        bBorder:     ["rgba(0,0,0,0.05)", "rgba(0,0,0,0.02)"],
        name:        "#1C1E21",
        text:        "#1C1E21",
        time:        "rgba(60,60,60,0.52)",
        seen:        "#0084FF",
        hName:       "#1C1E21",
        hSub:        "#65676B",
        accent:      ["rgba(0,132,255,0)", "rgba(0,132,255,0.26)", "rgba(0,132,255,0)"],
        ring:        "rgba(0,132,255,0.16)",
        online:      "#31A24C",
        back:        "#0084FF",
        btnFill:     "rgba(0,132,255,0.07)",
        btnIcon:     "rgba(0,132,255,0.68)",
        rxBg:        "#F0F2F5",
        rxFill:      "#FF1744",
        seenLabel:   "Seen",
        decor:       null,
    },
    night: {
        bg:          ["#0A0718", "#0D0A22", "#070516"],
        hBg:         "#0C0920",
        hLine:       "rgba(140,80,255,0.15)",
        bubble:      ["#1E1040", "#160C30"],
        bBorder:     ["rgba(170,90,255,0.56)", "rgba(100,50,200,0.30)"],
        name:        "#BB86FC",
        text:        "#E8E4FF",
        time:        "rgba(165,112,255,0.56)",
        seen:        "#BB86FC",
        hName:       "#C8B8FF",
        hSub:        "rgba(165,112,255,0.50)",
        accent:      ["rgba(130,60,255,0)", "rgba(130,60,255,0.56)", "rgba(130,60,255,0)"],
        ring:        "rgba(150,80,255,0.36)",
        online:      "#03DAC6",
        back:        "#BB86FC",
        btnFill:     "rgba(150,80,255,0.11)",
        btnIcon:     "rgba(195,122,255,0.70)",
        rxBg:        "#0A0718",
        rxFill:      "#FF1744",
        seenLabel:   "Seen ✦",
        decor:       "stars",
    }
};

function wrapText(ctx, text, maxWidth) {
    const words = text.split(" ");
    const lines = [];
    let line    = "";
    for (const word of words) {
        const probe = line ? `${line} ${word}` : word;
        if (ctx.measureText(probe).width > maxWidth && line !== "") {
            lines.push(line);
            line = word;
        } else {
            line = probe;
        }
    }
    if (line) lines.push(line);
    return lines;
}

function messengerBubble(ctx, x, y, w, h, r, tail) {
    const tl = tail === "left"  ? 5 : r;
    const tr = tail === "right" ? 5 : r;
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - tr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - tr, y + h);
    ctx.lineTo(x + tl, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - tl);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
}

function circleClip(ctx, img, cx, cy, r) {
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(img, cx - r, cy - r, r * 2, r * 2);
    ctx.restore();
}

function fallbackAvatar(ctx, name, cx, cy, r, theme) {
    const palette = {
        love:  ["#FF4080", "#CC0040"],
        dark:  ["#00B4FF", "#0058B8"],
        light: ["#0084FF", "#0050B8"],
        night: ["#9040E0", "#5500A0"],
    };
    const [c1, c2] = palette[theme] || palette.dark;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();
    const g = ctx.createLinearGradient(cx - r, cy - r, cx + r, cy + r);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    ctx.fillStyle    = "#FFFFFF";
    ctx.font         = `bold ${Math.floor(r * 0.92)}px sans-serif`;
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText((name || "?").charAt(0).toUpperCase(), cx, cy + 2);
    ctx.restore();
}

async function fetchAvatar(uid) {
    const url = `https://graph.facebook.com/${uid}/picture?width=256&height=256&access_token=6628568379%7Cc1e620fa708a1d5696fb991c1bde5662`;
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 8000 });
    return loadImage(Buffer.from(res.data));
}

function drawHeart(ctx, x, y, s, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle   = color;
    ctx.beginPath();
    ctx.moveTo(x, y + s / 4);
    ctx.bezierCurveTo(x, y, x - s / 2, y, x - s / 2, y + s / 4);
    ctx.bezierCurveTo(x - s / 2, y + s / 2, x, y + s * 0.75, x, y + s);
    ctx.bezierCurveTo(x, y + s * 0.75, x + s / 2, y + s / 2, x + s / 2, y + s / 4);
    ctx.bezierCurveTo(x + s / 2, y, x, y, x, y + s / 4);
    ctx.fill();
    ctx.restore();
}

function drawDecorations(ctx, W, H, type) {
    if (type === "hearts") {
        const hs = [
            {x:28,y:8,s:9,c:"#FF6B9D",a:.18},{x:108,y:4,s:6,c:"#FF1744",a:.13},
            {x:192,y:13,s:10,c:"#FF6B9D",a:.16},{x:302,y:7,s:7,c:"#FFB3C6",a:.16},
            {x:412,y:11,s:9,c:"#FF1744",a:.11},{x:500,y:5,s:6,c:"#FF6B9D",a:.14},
            {x:558,y:15,s:8,c:"#FFB3C6",a:.14},{x:626,y:7,s:9,c:"#FF1744",a:.12},
            {x:55,y:H-18,s:7,c:"#FF6B9D",a:.13},{x:142,y:H-13,s:9,c:"#FF1744",a:.10},
            {x:268,y:H-16,s:6,c:"#FFB3C6",a:.14},{x:386,y:H-11,s:8,c:"#FF6B9D",a:.13},
            {x:516,y:H-18,s:7,c:"#FF1744",a:.10},
        ];
        for (const h of hs) drawHeart(ctx, h.x, h.y, h.s, h.c, h.a);
    } else if (type === "stars") {
        const pts = [
            {x:38,y:10},{x:118,y:5},{x:218,y:14},{x:338,y:7},{x:438,y:12},
            {x:536,y:6},{x:618,y:17},{x:78,y:H-13},{x:188,y:H-7},
            {x:308,y:H-15},{x:456,y:H-9},{x:576,y:H-12},
        ];
        const cs = ["rgba(185,105,255,0.32)","rgba(145,85,255,0.25)","rgba(210,150,255,0.20)"];
        ctx.save();
        for (let i = 0; i < pts.length; i++) {
            ctx.beginPath();
            ctx.arc(pts[i].x, pts[i].y, 1.5 + (i % 3) * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = cs[i % 3];
            ctx.fill();
        }
        ctx.restore();
    }
}

function drawHeaderBar(ctx, avatarImg, name, W, theme, T) {
    const H = 58;
    ctx.fillStyle = T.hBg;
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = T.hLine;
    ctx.fillRect(0, H - 1, W, 1);

    ctx.save();
    ctx.strokeStyle = T.back;
    ctx.lineWidth   = 2.4;
    ctx.lineCap     = "round";
    ctx.lineJoin    = "round";
    ctx.beginPath();
    ctx.moveTo(26, H / 2);
    ctx.lineTo(16, H / 2);
    ctx.moveTo(20, H / 2 - 6);
    ctx.lineTo(16, H / 2);
    ctx.lineTo(20, H / 2 + 6);
    ctx.stroke();
    ctx.restore();

    const ax = 46, ay = H / 2, ar = 18;
    if (avatarImg) {
        circleClip(ctx, avatarImg, ax, ay, ar);
    } else {
        fallbackAvatar(ctx, name, ax, ay, ar, theme);
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(ax + ar - 4, ay + ar - 5, 5.5, 0, Math.PI * 2);
    ctx.fillStyle = T.hBg;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ax + ar - 4, ay + ar - 5, 4, 0, Math.PI * 2);
    ctx.fillStyle = T.online;
    ctx.fill();
    ctx.restore();

    ctx.font         = "bold 15px sans-serif";
    ctx.fillStyle    = T.hName;
    ctx.textAlign    = "left";
    ctx.textBaseline = "alphabetic";
    ctx.fillText(name, ax + ar + 10, H / 2 - 2);

    ctx.font      = "11px sans-serif";
    ctx.fillStyle = T.hSub;
    ctx.fillText("Active now", ax + ar + 10, H / 2 + 13);

    const iconXs = [W - 22, W - 54, W - 86];
    for (let i = 0; i < 3; i++) {
        const ix = iconXs[i], iy = H / 2;
        ctx.save();
        ctx.beginPath();
        ctx.arc(ix, iy, 15, 0, Math.PI * 2);
        ctx.fillStyle = T.btnFill;
        ctx.fill();
        ctx.strokeStyle = T.btnIcon;
        ctx.lineWidth   = 1.8;
        ctx.lineCap     = "round";
        if (i === 0) {
            ctx.beginPath();
            ctx.arc(ix, iy - 5, 1.8, 0, Math.PI * 2);
            ctx.fillStyle = T.btnIcon;
            ctx.fill();
            ctx.beginPath();
            ctx.moveTo(ix, iy - 2);
            ctx.lineTo(ix, iy + 5);
            ctx.stroke();
        } else if (i === 1) {
            ctx.beginPath();
            ctx.arc(ix - 1, iy, 5.5, Math.PI * 0.9, Math.PI * 2.1);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ix + 3, iy + 5);
            ctx.lineTo(ix + 7, iy + 7);
            ctx.stroke();
        } else {
            ctx.beginPath();
            ctx.moveTo(ix - 5, iy - 5);
            ctx.lineTo(ix - 5, iy + 5);
            ctx.lineTo(ix + 5, iy);
            ctx.closePath();
            ctx.fillStyle = T.btnIcon;
            ctx.fill();
        }
        ctx.restore();
    }
}

async function buildImage(avatarImg, name, text, themeKey, sent) {
    const T = THEMES[themeKey] || THEMES.love;

    const W        = 660;
    const HDR      = 58;
    const HP       = 16;
    const VP       = 14;
    const AVR      = 26;
    const AVD      = AVR * 2;
    const GAP      = 10;
    const BPX      = 15;
    const BPY      = 11;
    const NAME_H   = 21;
    const LINE_H   = 22;
    const TAIL     = sent ? "right" : "left";

    const BX_START = sent ? HP : HP + AVD + GAP;
    const BX_END   = sent ? W - HP - AVD - GAP : W - HP;
    const MAX_BW   = BX_END - BX_START;

    const sc = createCanvas(W, 100);
    const sx = sc.getContext("2d");
    sx.font  = "15px sans-serif";
    const lines = wrapText(sx, text, MAX_BW - BPX * 2);
    sx.font     = "bold 14px sans-serif";
    const nW    = sx.measureText(name).width;
    sx.font     = "15px sans-serif";
    const maxLW = Math.max(nW, ...lines.map(l => sx.measureText(l).width));

    const BW     = Math.min(MAX_BW, maxLW + BPX * 2 + 10);
    const BH     = BPY + NAME_H + lines.length * LINE_H + BPY;
    const BX     = sent ? BX_END - BW : BX_START;
    const BY     = HDR + VP;
    const CONT_H = Math.max(AVD, BH);
    const TOT_H  = HDR + VP + CONT_H + VP + 32 + 14;

    const cv  = createCanvas(W, TOT_H);
    const ctx = cv.getContext("2d");

    const bgG = ctx.createLinearGradient(0, HDR, W, TOT_H);
    bgG.addColorStop(0,   T.bg[0]);
    bgG.addColorStop(0.5, T.bg[1]);
    bgG.addColorStop(1,   T.bg[2]);
    ctx.fillStyle = bgG;
    ctx.fillRect(0, 0, W, TOT_H);

    const vig = ctx.createRadialGradient(W / 2, (HDR + TOT_H) / 2, 0, W / 2, (HDR + TOT_H) / 2, W * 0.72);
    vig.addColorStop(0, "rgba(0,0,0,0)");
    vig.addColorStop(1, "rgba(0,0,0,0.18)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, HDR, W, TOT_H - HDR);

    drawDecorations(ctx, W, TOT_H, T.decor);
    drawHeaderBar(ctx, avatarImg, name, W, themeKey, T);

    const accG = ctx.createLinearGradient(0, HDR, W, HDR);
    accG.addColorStop(0, T.accent[0]);
    accG.addColorStop(0.5, T.accent[1]);
    accG.addColorStop(1, T.accent[2]);
    ctx.fillStyle = accG;
    ctx.fillRect(0, HDR, W, 1);

    const ACX = sent ? W - HP - AVR : HP + AVR;
    const ACY = BY + AVR;

    ctx.save();
    ctx.beginPath();
    ctx.arc(ACX, ACY, AVR + 5, 0, Math.PI * 2);
    const rg = ctx.createRadialGradient(ACX, ACY, AVR, ACX, ACY, AVR + 5);
    rg.addColorStop(0, T.ring);
    rg.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = rg;
    ctx.fill();
    ctx.restore();

    if (avatarImg) {
        circleClip(ctx, avatarImg, ACX, ACY, AVR);
    } else {
        fallbackAvatar(ctx, name, ACX, ACY, AVR, themeKey);
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(ACX + AVR - 5, ACY + AVR - 5, 7, 0, Math.PI * 2);
    ctx.fillStyle = T.bg[0];
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ACX + AVR - 5, ACY + AVR - 5, 5, 0, Math.PI * 2);
    ctx.fillStyle = T.online;
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.shadowColor   = T.ring;
    ctx.shadowBlur    = 18;
    ctx.shadowOffsetY = 3;
    messengerBubble(ctx, BX, BY, BW, BH, 18, TAIL);
    const bG = ctx.createLinearGradient(BX, BY, BX + BW, BY + BH);
    bG.addColorStop(0, T.bubble[0]);
    bG.addColorStop(1, T.bubble[1]);
    ctx.fillStyle = bG;
    ctx.fill();
    ctx.restore();

    messengerBubble(ctx, BX, BY, BW, BH, 18, TAIL);
    const bbG = ctx.createLinearGradient(BX, BY, BX + BW, BY + BH);
    bbG.addColorStop(0, T.bBorder[0]);
    bbG.addColorStop(1, T.bBorder[1]);
    ctx.strokeStyle = bbG;
    ctx.lineWidth   = 1.5;
    ctx.stroke();

    ctx.font         = "bold 14px sans-serif";
    ctx.fillStyle    = T.name;
    ctx.textAlign    = "left";
    ctx.textBaseline = "top";
    ctx.fillText(name, BX + BPX, BY + BPY);

    ctx.font      = "15px sans-serif";
    ctx.fillStyle = T.text;
    for (let i = 0; i < lines.length; i++) {
        ctx.fillText(lines[i], BX + BPX, BY + BPY + NAME_H + i * LINE_H);
    }

    const now     = new Date();
    const timeStr = now.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
    ctx.font         = "10px sans-serif";
    ctx.fillStyle    = T.time;
    ctx.textAlign    = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(timeStr, BX + BW - BPX / 2, BY + BH - 4);

    const RX = sent ? BX + BW - 24 : BX + 24;
    const RY = BY + BH - 4;
    ctx.save();
    ctx.beginPath();
    ctx.arc(RX, RY, 12, 0, Math.PI * 2);
    ctx.fillStyle = T.rxBg;
    ctx.fill();
    ctx.beginPath();
    ctx.arc(RX, RY, 9.5, 0, Math.PI * 2);
    ctx.fillStyle = T.rxFill;
    ctx.fill();
    ctx.font         = "10px sans-serif";
    ctx.fillStyle    = "#FFFFFF";
    ctx.textAlign    = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("❤️", RX, RY + 1);
    ctx.restore();

    const seenY = BY + BH + 9;
    ctx.font      = "11px sans-serif";
    ctx.fillStyle = T.seen;
    if (sent) {
        ctx.textAlign = "right";
        ctx.fillText(T.seenLabel, BX + BW, seenY);
    } else {
        ctx.textAlign = "left";
        ctx.fillText(T.seenLabel, BX, seenY);
    }

    const botG = ctx.createLinearGradient(0, TOT_H - 2, W, TOT_H - 2);
    botG.addColorStop(0, T.accent[0]);
    botG.addColorStop(0.5, T.accent[1]);
    botG.addColorStop(1, T.accent[2]);
    ctx.fillStyle = botG;
    ctx.fillRect(0, TOT_H - 2, W, 2);

    return cv.toBuffer("image/png");
}

module.exports = {
    config: {
        name:             "fakechat",
        aliases:          ["fc", "fake", "ফেকচ্যাট"],
        version:          "1.0.0",
        author:           "SIFAT",
        countDown:        5,
        role:             0,
        shortDescription: { en: "Generate a fake Messenger chat screenshot" },
        longDescription:  {
            en: "Create a realistic fake Facebook Messenger chat screenshot. Supports 4 themes and sent/received mode.",
            bn: "নকল Facebook Messenger চ্যাট স্ক্রিনশট তৈরি করুন। ৪টি থিম ও sent/recv মোড সাপোর্ট করে।"
        },
        category: "fun",
        guide: {
            en: "  {pn} <@tag|reply|UID> [--sent] [--love|--dark|--light|--night] <message>",
            bn: "  {pn} <@ট্যাগ|রিপ্লাই|UID> [--sent] [--love|--dark|--light|--night] <মেসেজ>"
        }
    },

    langs: {
        en: {
            noTarget: "❌ Mention someone, reply to a message, or provide a UID.",
            noText:   "❌ Include the message text you want to fake.",
            error:    "⚠️ Something went wrong: %1"
        },
        bn: {
            noTarget: "❌ কাউকে মেনশন করো, রিপ্লাই দাও, অথবা UID দাও।",
            noText:   "❌ কী মেসেজ দেখাতে চাও সেটা লিখো।",
            error:    "⚠️ সমস্যা হয়েছে: %1"
        }
    },

    onStart: async function ({ api, event, args: rawArgs, message, usersData, getLang }) {
        try {
            let args     = [...rawArgs];
            let themeKey = "love";
            let sent     = false;
            const keep   = [];

            for (let i = 0; i < args.length; i++) {
                const a = args[i].toLowerCase();
                if (a === "--theme" && THEMES[args[i + 1]?.toLowerCase()]) {
                    themeKey = args[++i].toLowerCase();
                } else if (a === "--love")  { themeKey = "love"; }
                else if (a === "--dark")    { themeKey = "dark"; }
                else if (a === "--light")   { themeKey = "light"; }
                else if (a === "--night")   { themeKey = "night"; }
                else if (a === "--sent" || a === "--send") { sent = true; }
                else if (a === "--recv" || a === "--received") { sent = false; }
                else { keep.push(args[i]); }
            }
            args = keep;

            const { mentions, messageReply } = event;
            let targetId  = null;
            let inputText = args.join(" ").trim();

            if (messageReply) {
                targetId = messageReply.senderID;
            } else if (Object.keys(mentions).length > 0) {
                targetId = Object.keys(mentions)[0];
                for (const [, tag] of Object.entries(mentions)) {
                    inputText = inputText.split(tag).join("").trim();
                }
                inputText = inputText.replace(/@\S+/g, "").replace(/\s{2,}/g, " ").trim();
            } else if (args[0] && /^\d{5,}$/.test(args[0])) {
                targetId  = args[0];
                inputText = args.slice(1).join(" ").trim();
            }

            if (!targetId)  return message.reply(getLang("noTarget"));
            if (!inputText) return message.reply(getLang("noText"));

            let displayName = "Unknown";
            try { displayName = (await usersData.getName(targetId)) || "Unknown"; } catch {}

            let avatarImg = null;
            try { avatarImg = await fetchAvatar(targetId); } catch {}

            const buf = await buildImage(avatarImg, displayName, inputText, themeKey, sent);

            await fs.ensureDir(TMP);
            const fp = path.join(TMP, `fc_${Date.now()}.png`);
            await fs.writeFile(fp, buf);

            await message.reply({ attachment: fs.createReadStream(fp) });
            await fs.remove(fp);

        } catch (err) {
            return message.reply(getLang("error", err.message));
        }
    }
};
