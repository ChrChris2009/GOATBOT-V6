"use strict";

const path = require("path");
const fs   = require("fs-extra");
const api  = require("./lib/sifu-api");

const VALID_QUALITIES = ["128", "192", "320"];
const DEFAULT_QUALITY = "320";
const FAST_MODE       = process.env.SIFU_MP3_FAST !== "0";

module.exports = {
    config: {
        name:        "sing",
        aliases:     ["mp3", "song", "music", "audio"],
        version:     "2.0.0",
        author:      "SIFAT",
        category:    "media",
        role:        0,
        countDown:   4,
        description: { en: "Search & download MP3 from YouTube." },
        guide:       { en: "{pn} [song name | URL] [-q 128|192|320] [-list]" },
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
        const event  = ctx.event || {};
        const userId = event.senderID || event.userID || null;

        let quality = DEFAULT_QUALITY, mode = "search", query = "";
        const rest = [];
        for (let i = 0; i < args.length; i++) {
            const a = args[i].toLowerCase();
            if (a === "-list" || a === "--list") { mode = "list"; continue; }
            if ((a === "-q" || a === "--quality") && VALID_QUALITIES.includes(args[i + 1])) {
                quality = args[i + 1]; i++; continue;
            }
            rest.push(args[i]);
        }
        query = rest.join(" ").trim();

        if (_directPick) {
            mode = "pick";
        }

        if (mode === "list") {
            if (!query) return;
            api.safeReact(ctx, "🔍");
            try {
                const imgPath   = path.join(api.config.CACHE_DIR, `sing_list_${Date.now()}.png`);
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
                    body: "",
                    attachment: fs.createReadStream(imgResult.path),
                });
                setTimeout(() => fs.unlink(imgResult.path).catch(() => {}), 15_000);

                if (sent?.messageID) {
                    global.GoatBot.onReply.set(sent.messageID, {
                        commandName: "sing",
                        messageID:   sent.messageID,
                        author:      userId,
                        results:     imgResult.results,
                        quality,
                    });
                }
            } catch (err) {
                api.safeReact(ctx, "❌");
                console.error("[sing] list error:", err.message);
            }
            return;
        }

        if (!api.tryAcquireLock(userId, 120_000)) {
            api.safeReact(ctx, "⏳");
            return;
        }

        try {
            await api.pruneCache();
            let trackUrl, trackTitle, trackUploader, trackDuration;

            if (_directPick) {
                const { pick } = _directPick;
                quality        = _directPick.quality || quality;
                trackUrl       = api.normalizeYouTubeUrl(pick.url);
                trackTitle     = pick.title;
                trackUploader  = pick.uploader;
                trackDuration  = pick.duration;

            } else {
                if (!query) {
                    api.safeReact(ctx, "❌");
                    return;
                }

                if (api.isYouTubeUrl(query)) {
                    trackUrl = api.normalizeYouTubeUrl(query);
                    api.safeReact(ctx, "📥");
                } else {
                    api.safeReact(ctx, "🔍");
                    const results = await api.searchVideos(query, 1);
                    if (!results.length) {
                        api.safeReact(ctx, "❌");
                        return;
                    }
                    const top     = results[0];
                    trackUrl      = api.normalizeYouTubeUrl(top.url);
                    trackTitle    = top.title;
                    trackUploader = top.uploader;
                    trackDuration = top.duration;
                    api.safeReact(ctx, "📥");
                }
            }

            const videoId  = api.extractVideoId(trackUrl);
            const cacheTag = `${quality}${FAST_MODE ? "f" : ""}`;
            let cached     = videoId ? await api.cacheLookup(videoId, cacheTag, "mp3") : null;
            let filePath, sizeBytes, headers = {};

            if (cached) {
                filePath  = cached.path;
                sizeBytes = cached.size;
            } else {
                const targetPath = videoId
                    ? api.cacheFilenameFor(videoId, cacheTag, "mp3")
                    : path.join(api.config.CACHE_DIR, `tmp_${Date.now()}.mp3`);
                const params = { url: trackUrl, quality };
                if (FAST_MODE) params.fast = "1";
                const result  = await api.downloadToDisk("/api/music/download", params, targetPath);
                filePath      = result.path;
                sizeBytes     = result.size;
                headers       = result.headers || {};
                if (headers["x-track-title"])  trackTitle    = decodeURIComponent(headers["x-track-title"]);
                if (headers["x-track-artist"]) trackUploader = decodeURIComponent(headers["x-track-artist"]);
                if (!trackDuration && headers["x-track-duration"]) trackDuration = Number(headers["x-track-duration"]) || null;
            }

            if (sizeBytes < 1024) {
                await fs.unlink(filePath).catch(() => {});
                api.safeReact(ctx, "❌");
                return;
            }

            const sizeMB = sizeBytes / (1024 * 1024);
            if (sizeMB > api.config.MAX_FILE_MB) {
                api.safeReact(ctx, "❌");
                return;
            }

            api.safeReact(ctx, "✅");
            await api.safeReply(ctx, {
                body:       "",
                attachment: fs.createReadStream(filePath),
            });

        } catch (err) {
            api.safeReact(ctx, "❌");
            console.error("[sing] error:", err.message);
        } finally {
            api.releaseLock(userId);
        }
    },
};
