const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require("discord.js");
const { LavalinkManager } = require("lavalink-client");
const fs = require("fs");
const path = require("path");

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
  ],
});

client.commands = new Collection();
client.npIntervals = new Map();
client.errorCounts = new Map(); // guildId -> consecutive failed-track count
client.retriedTracks = new Map(); // guildId -> Set of track identifiers already retried once

const commandFiles = fs
  .readdirSync(path.join(__dirname, "commands"))
  .filter((f) => f.endsWith(".js"));

for (const file of commandFiles) {
  const cmd = require(path.join(__dirname, "commands", file));
  if (cmd.data && cmd.execute) client.commands.set(cmd.data.name, cmd);
}

client.lavalink = new LavalinkManager({
  nodes: [
    {
      id: "jirayu",
      host: "lavalink.jirayu.net",
      port: 13592,
      authorization: "youshallnotpass",
      secure: false,
      retryAmount: 20,
      retryDelay: 2500,
      requestSignalTimeoutMS: 30000,
    },
    {
      id: "serenetia",
      host: "lavalinkv4.serenetia.com",
      port: 443,
      authorization: "https://dsc.gg/serenetia-music",
      secure: true,
      retryAmount: 20,
      retryDelay: 2500,
      requestSignalTimeoutMS: 30000,
    },
    {
      id: "custom",
      host: process.env.LAVALINK_HOST,
      port: parseInt(process.env.LAVALINK_PORT, 10),
      authorization: process.env.LAVALINK_PASS,
      secure: false,
      retryAmount: 10,
      retryDelay: 5000,
      requestSignalTimeoutMS: 30000,
    },
  ],
  sendToShard: (guildId, payload) => {
    const guild = client.guilds.cache.get(guildId);
    if (guild) guild.shard.send(payload);
  },
  client: {
    id: process.env.CLIENT_ID,
    username: "MusicBot",
  },
  playerOptions: {
    defaultSearchPlatform: "ytmsearch",
    allowCustomSources: true,
    onDisconnect: {
      autoReconnect: true,
      destroyPlayer: false,
    },
    onEmptyQueue: {
      destroyAfterMs: 30000,
    },
  },
  queueOptions: {
    maxPreviousTracks: 10,
  },
  advancedOptions: {
    enableDebugEvents: true,
  },
});

const eventFiles = fs
  .readdirSync(path.join(__dirname, "events"))
  .filter((f) => f.endsWith(".js"));

for (const file of eventFiles) {
  const event = require(path.join(__dirname, "events", file));
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

client.lavalink.nodeManager.on("connect", (node) =>
  console.log(`[Lavalink] Node "${node.id}" connected ✅`)
);
client.lavalink.nodeManager.on("error", (node, err) =>
  console.error(`[Lavalink] Node "${node.id}" error:`, err.message)
);
client.lavalink.nodeManager.on("disconnect", (node, reason) =>
  console.warn(`[Lavalink] Node "${node.id}" disconnected:`, JSON.stringify(reason))
);
client.lavalink.nodeManager.on("reconnecting", (node) =>
  console.log(`[Lavalink] Node "${node.id}" reconnecting...`)
);

client.lavalink.on("debug", (eventName, eventData) => {
  if (eventName.startsWith("NO-AUDIO")) {
    console.warn(`[Lavalink/NO-AUDIO] ${eventName}:`, eventData?.message || JSON.stringify(eventData));
  }
});

function buildNowPlayingEmbed(player, track) {
  const position = player.position;
  const duration = track.info.duration;
  const barLen = 20;
  const filled = track.info.isStream
    ? barLen
    : Math.min(barLen, Math.round((position / duration) * barLen));
  const bar =
    "▬".repeat(Math.max(0, filled - 1)) +
    "🔘" +
    "▬".repeat(Math.max(0, barLen - filled));

  return new EmbedBuilder()
    .setColor(0xff0000)
    .setTitle("Now Playing")
    .setDescription(`**[${track.info.title}](${track.info.uri})**`)
    .addFields(
      { name: "Author", value: track.info.author || "Unknown", inline: true },
      {
        name: "Duration",
        value: track.info.isStream
          ? "🔴 LIVE"
          : `${formatDuration(position)} / ${formatDuration(duration)}`,
        inline: true,
      },
      { name: "Requested By", value: track.requester?.username || "Unknown", inline: true },
      { name: "Progress", value: bar }
    )
    .setThumbnail(track.info.artworkUrl || "");
}

function clearNpInterval(guildId) {
  const iv = client.npIntervals.get(guildId);
  if (iv) {
    clearInterval(iv);
    client.npIntervals.delete(guildId);
  }
}

client.lavalink.on("trackStart", async (player, track) => {
  console.log(`[Lavalink] Track started: ${track.info.title} in guild ${player.guildId}`);
  clearNpInterval(player.guildId);
  client.errorCounts.set(player.guildId, 0);
  client.retriedTracks.delete(player.guildId);

  // Auto-update voice channel status with the current song
  const voiceChannel = client.channels.cache.get(player.voiceChannelId);
  if (voiceChannel?.setStatus) {
    voiceChannel.setStatus(`🎵 ${track.info.title}`).catch(() => {});
  }

  const channel = client.channels.cache.get(player.textChannelId);
  if (!channel) return;

  let npMessage = null;
  try {
    npMessage = await channel.send({ embeds: [buildNowPlayingEmbed(player, track)] });
  } catch {
    return;
  }

  if (!track.info.isStream) {
    const iv = setInterval(async () => {
      const p = client.lavalink.getPlayer(player.guildId);
      if (!p || !p.queue.current || p.paused) return; // don't edit while paused
      try {
        await npMessage.edit({ embeds: [buildNowPlayingEmbed(p, p.queue.current)] });
      } catch {
        clearNpInterval(player.guildId);
      }
    }, 10000); // 10s — fast enough to feel live, safe from Discord's rate limit
    client.npIntervals.set(player.guildId, iv);
  }
});

client.lavalink.on("trackEnd", (player, track) => {
  clearNpInterval(player.guildId);
  // Note: no longer manually storing lastTrack here.
  // lavalink-client pushes the finished track into player.queue.previous automatically,
  // so queueEnd reads it from there instead.
});

client.lavalink.on("trackError", async (player, track, payload) => {
  const guildId = player.guildId;
  const reason =
    payload?.exception?.message || payload?.exception?.cause || "Unknown error";
  console.error(`[Lavalink] Track error in guild ${guildId}:`, reason);
  clearNpInterval(guildId);

  const channel = client.channels.cache.get(player.textChannelId);

  // Circuit breaker: if many tracks in a row fail (e.g. YouTube auth/cookies are
  // broken on this node), stop instead of silently burning through the whole queue.
  const failCount = (client.errorCounts.get(guildId) || 0) + 1;
  client.errorCounts.set(guildId, failCount);
  if (failCount >= 5) {
    client.errorCounts.set(guildId, 0);
    if (channel)
      channel
        .send(
          "⚠️ 5 tracks in a row failed to play (likely a YouTube auth/cookie issue on the node). Stopping playback — check the bot logs."
        )
        .catch(() => {});
    await player.stopPlaying(true).catch(() => {});
    return;
  }

  // Try once to re-resolve the SAME track via a fresh search before giving up on it.
  // Lavalink had already "downloaded"/resolved this exact track object, but that
  // resolution (stream URL, cipher, etc.) can be stale or blocked; searching again
  // often returns a working source instead.
  const trackKey = track?.info?.identifier || track?.encoded;
  let retriedSet = client.retriedTracks.get(guildId);
  if (!retriedSet) {
    retriedSet = new Set();
    client.retriedTracks.set(guildId, retriedSet);
  }

  if (track && trackKey && !retriedSet.has(trackKey)) {
    retriedSet.add(trackKey);
    const replacement = await searchReplacementTrack(player, track);
    if (replacement) {
      console.log(`[Lavalink] Retrying "${track.info.title}" via fresh search after error.`);
      player.queue.tracks.unshift(replacement);
      await player.skip(0, false).catch((err) =>
        console.error("[Lavalink] skip-to-retry failed:", err.message)
      );
      return;
    }
  }

  if (channel)
    channel
      .send(`⚠️ Couldn't play **${track?.info?.title || "that track"}**: ${reason}. Skipping...`)
      .catch(() => {});

  // This is the critical fix: lavalink-client only auto-advances the queue on
  // trackEnd/trackStuck, NOT on trackError, so without an explicit skip() here
  // the player just sits idle forever and the rest of the queue never plays.
  await player.skip(0, false).catch((err) => {
    console.error("[Lavalink] skip-after-error failed:", err.message);
    player.stopPlaying(true).catch(() => {});
  });
});

async function searchReplacementTrack(player, failedTrack) {
  try {
    const query = `${failedTrack.info.title} ${failedTrack.info.author || ""}`.trim();
    const res = await player.search(
      { query, source: "ytmsearch" },
      failedTrack.requester
    );
    if (!res?.tracks?.length) return null;
    const targetDuration = failedTrack.info.duration || 0;
    return (
      res.tracks.find(
        (t) => Math.abs((t.info.duration || 0) - targetDuration) < 5000
      ) || res.tracks[0]
    );
  } catch (err) {
    console.error("[Lavalink] searchReplacementTrack failed:", err.message);
    return null;
  }
}

client.lavalink.on("trackStuck", (player, track) => {
  console.warn(`[Lavalink] Track stuck in guild ${player.guildId}: ${track?.info?.title}`);
  clearNpInterval(player.guildId);
  const channel = client.channels.cache.get(player.textChannelId);
  if (channel)
    channel
      .send(`⚠️ **${track?.info?.title || "Track"}** got stuck and was skipped.`)
      .catch(() => {});
});

client.lavalink.on("playerSocketClosed", (player, payload) => {
  console.warn(`[Lavalink] Player socket closed in guild ${player.guildId}:`, payload);
});

client.lavalink.on("queueEnd", (player) => {
  clearNpInterval(player.guildId);
  const voiceChannel = client.channels.cache.get(player.voiceChannelId);
  if (voiceChannel?.setStatus) voiceChannel.setStatus("").catch(() => {});

  if (player.get("autoplay")) {
    // lavalink-client pushes the last-played track into queue.previous automatically
    const seed = player.queue.previous[0];
    console.log(`[Autoplay] queueEnd fired, seed track: ${seed?.info?.title || "NONE"}`);
    if (seed) {
      handleAutoplay(player, seed);
      return;
    }
    console.warn("[Autoplay] No previous track found to seed autoplay.");
  }

  const channel = client.channels.cache.get(player.textChannelId);
  if (channel) channel.send("Queue finished. Use `/play` to add more tracks.");
});

async function handleAutoplay(player, lastTrack) {
  try {
    const query = `${lastTrack.info.title} ${lastTrack.info.author || ""}`.trim();
    console.log(`[Autoplay] Searching for: "${query}"`);
    const res = await player.search({ query, source: "ytmsearch" }, client.user);
    if (!res?.tracks?.length) {
      console.warn("[Autoplay] Search returned no results.");
      return;
    }
    // Pick randomly from top 5, but exclude the exact same track
    const candidates = res.tracks
      .slice(0, 5)
      .filter((t) => t.info.identifier !== lastTrack.info.identifier);
    const track = candidates[Math.floor(Math.random() * candidates.length)] || res.tracks[0];
    console.log(`[Autoplay] Queuing: "${track.info.title}"`);
    player.queue.add(track);
    if (!player.playing) await player.play();
  } catch (err) {
    console.error("[Autoplay] Error:", err.message);
  }
}

client.on("raw", (d) => {
  if (["VOICE_STATE_UPDATE", "VOICE_SERVER_UPDATE"].includes(d.t)) {
    console.log(`[Voice] Raw ${d.t} received for guild ${d.d?.guild_id}`);
  }
  client.lavalink.sendRawData(d);
});

client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const command = client.commands.get(interaction.commandName);
  if (!command) return;
  try {
    await command.execute(interaction, client);
  } catch (err) {
    console.error(`[Command/${interaction.commandName}]`, err);
    const payload = { content: "An error occurred.", ephemeral: true };
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => {});
    } else {
      await interaction.reply(payload).catch(() => {});
    }
  }
});

process.on("unhandledRejection", (reason) =>
  console.error("[Process] Unhandled Rejection:", reason)
);
process.on("uncaughtException", (err) =>
  console.error("[Process] Uncaught Exception:", err)
);
process.on("uncaughtExceptionMonitor", (err) =>
  console.error("[Process] Uncaught Exception Monitor:", err)
);

client.login(process.env.DISCORD_TOKEN);

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
