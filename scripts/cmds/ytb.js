"use strict";

const path = require("path");
const fs   = require("fs-extra");
const api  = require("./lib/sifu-api");

const VALID_QUALITIES = ["240", "360", "480", "720", "1080"];
const DEFAULT_QUALITY = "480";
const FALLBACK_LADDER = ["480", "360", "240"];

module.exports = {
    config: {
        name:        "ytb",
        aliases:     ["yt", "youtube", "ytvideo", "ytsearch"],
        version:     "2.0.0",
        author:      "SIFAT",
        category:    "media",
        role:        0,
        countDown:   8,
        description: { en: "Search & download any YouTube video." },
        guide:       { en: "{pn} [query | URL] [-q 240|360|480|720|1080] [-list]" },
    },

    onStart: async function ({ args, event, message, api: botApi }) {
        return module.exports._run({
            args: args || [],
            ctx:  { reply: message.reply.bind(message), event, api: botApi },
        });
    },

    onReply: async function ({ event, Reply, message, api: botApi }) {
        if (event.senderID !== Reply.author) return;

        const num = parseInt(event.body?.trim());
        if (isNaN(num) || num < 1 || num > Reply.results.length) return;

        const ctx = { reply: message.reply.bind(message), event, api: botApi };

        try { botApi.unsendMessage(Reply.messageID); } catch {}
        global.GoatBot.onReply.delete(Reply.messageID);

        api.safeReact(ctx, "📥");

        const pick    = Reply.results[num - 1];
        const quality = Reply.quality || DEFAULT_QUALITY;

        return module.exports._run({
            args: [],
            ctx,
            _directPick: { pick, quality },
        });
    },

    _run: async function ({ args, ctx, _directPick }) {
        const event = ctx.event || {};
        const userId = event.senderID || event.userID || null;

        let mode = "search", quality = DEFAULT_QUALITY, query = "";
        const rest = [];
        for (let i = 0; i < args.length; i++) {
            const a = args[i].toLowerCase();
            if (a === "-list" || a === "--list" || a === "list") { mode = "list"; continue; }
            if ((a === "-q" || a === "--quality") && VALID_QUALITIES.includes(args[i + 1])) {
                quality = args[i + 1]; i++; continue;
            }
            rest.push(args[i]);
        }
        query = rest.join(" ").trim();

        if (_directPick) mode = "pick";

        if (mode === "list") {
            if (!query) return;
            api.safeReact(ctx, "🔍");
            try {
                const imgPath   = path.join(api.config.CACHE_DIR, `ytb_list_${Date.now()}.png`);
                const imgResult = await api.downloadSearchImage(
                    "/api/video/search-image",
                    { q: query, limit: 6, cmd: "Reply 1-6" },
                    imgPath,
                );

                if (!imgResult.results?.length) {
                    api.safeReact(ctx, "❌");
                    return;
                }

                api.safeReact(ctx, "✅");
                const sent = await api.safeReply(ctx, {
                    body:       "",
                    attachment: fs.createReadStream(imgResult.path),
                });
                setTimeout(() => fs.unlink(imgResult.path).catch(() => {}), 15_000);

                if (sent?.messageID) {
                    global.GoatBot.onReply.set(sent.messageID, {
                        commandName: "ytb",
                        messageID:   sent.messageID,
                        author:      userId,
                        results:     imgResult.results,
                        quality,
                    });
                }
            } catch (err) {
                api.safeReact(ctx, "❌");
                console.error("[ytb] list error:", err.message);
            }
            return;
        }

        try {
            await api.pruneCache();
            let videoUrl, videoTitle, videoUploader, videoDuration;

            if (_directPick) {
                const { pick } = _directPick;
                quality         = _directPick.quality || quality;
                videoUrl        = api.normalizeYouTubeUrl(pick.url);
                videoTitle      = pick.title;
                videoUploader   = pick.uploader;
                videoDuration   = pick.duration;

            } else {
                if (!query) {
                    api.safeReact(ctx, "❌");
                    return;
                }

                if (api.isYouTubeUrl(query)) {
                    videoUrl = api.normalizeYouTubeUrl(query);
                    api.safeReact(ctx, "📥");
                } else {
                    api.safeReact(ctx, "🔍");
                    const data    = await api.httpGetJson("/api/video/search", { q: query, limit: 1 });
                    const results = data?.results || [];
                    if (!results.length || !results[0].url) {
                        api.safeReact(ctx, "❌");
                        return;
                    }
                    const top     = results[0];
                    videoUrl      = api.normalizeYouTubeUrl(top.url);
                    videoTitle    = top.title;
                    videoUploader = top.uploader;
                    videoDuration = top.duration;
                    api.safeReact(ctx, "📥");
                }
            }

            if (!videoTitle && videoUrl) {
                try {
                    const info = await api.getInfo(videoUrl);
                    videoTitle    = info.title;
                    videoUploader = info.uploader;
                    videoDuration = info.duration;
                } catch (_) {}
            }

            const reqIdx = VALID_QUALITIES.indexOf(quality);
            const ladder = [
                quality,
                ...FALLBACK_LADDER.filter(q => {
                    const i = VALID_QUALITIES.indexOf(q);
                    return i !== -1 && i < reqIdx;
                }),
            ];
            const videoId = api.extractVideoId(videoUrl);

            let finalResult = null, finalQuality = quality;

            for (let i = 0; i < ladder.length; i++) {
                const tryQ   = ladder[i];
                let   result = videoId ? await api.cacheLookup(videoId, `ytb_${tryQ}`, "mp4") : null;

                if (!result) {
                    const targetPath = videoId
                        ? api.cacheFilenameFor(videoId, `ytb_${tryQ}`, "mp4")
                        : path.join(api.config.CACHE_DIR, `tmp_ytb_${Date.now()}.mp4`);
                    try {
                        const dl = await api.downloadToDisk(
                            "/api/video/download",
                            { url: videoUrl, quality: tryQ },
                            targetPath,
                        );
                        result = { path: dl.path, size: dl.size };
                    } catch (err) {
                        if (i === ladder.length - 1) throw err;
                        continue;
                    }
                }

                if (result.size < 1024) {
                    await fs.unlink(result.path).catch(() => {});
                    if (i === ladder.length - 1) {
                        api.safeReact(ctx, "❌");
                        return;
                    }
                    continue;
                }

                const sizeMB = result.size / (1024 * 1024);
                if (sizeMB <= api.config.MAX_FILE_MB) {
                    finalResult = result; finalQuality = tryQ; break;
                }
                if (i === ladder.length - 1) {
                    api.safeReact(ctx, "❌");
                    return;
                }
            }

            if (!finalResult) {
                api.safeReact(ctx, "❌");
                return;
            }

            api.safeReact(ctx, "✅");
            await api.safeReply(ctx, {
                body:       "",
                attachment: fs.createReadStream(finalResult.path),
            });

        } catch (err) {
            api.safeReact(ctx, "❌");
            console.error("[ytb] error:", err.message);
        }
    },
};
