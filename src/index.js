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
      if (!p || !p.queue.current) {
        clearNpInterval(player.guildId);
        return;
      }
      try {
        await npMessage.edit({ embeds: [buildNowPlayingEmbed(p, p.queue.current)] });
      } catch {
        clearNpInterval(player.guildId);
      }
    }, 5000);
    client.npIntervals.set(player.guildId, iv);
  }
});

client.lavalink.on("trackEnd", (player, track) => {
  clearNpInterval(player.guildId);
  if (player.get("autoplay")) handleAutoplay(player, track);
});

client.lavalink.on("trackError", (player, track, payload) => {
  console.error(`[Lavalink] Track error in guild ${player.guildId}:`, payload?.exception || payload);
  clearNpInterval(player.guildId);
  const channel = client.channels.cache.get(player.textChannelId);
  if (channel) channel.send(`⚠️ Error playing **${track?.info?.title || "unknown"}**: ${payload?.exception?.message || "Unknown error"}`);
});

client.lavalink.on("playerSocketClosed", (player, payload) => {
  console.warn(`[Lavalink] Player socket closed in guild ${player.guildId}:`, payload);
});

client.lavalink.on("queueEnd", (player) => {
  clearNpInterval(player.guildId);
  if (player.get("autoplay")) return;
  const channel = client.channels.cache.get(player.textChannelId);
  if (channel) channel.send("Queue finished. Use `/play` to add more tracks.");
});

async function handleAutoplay(player, lastTrack) {
  try {
    const query = `${lastTrack.info.title} ${lastTrack.info.author}`;
    const res = await player.search({ query, source: "ytmsearch" }, client.user);
    if (!res?.tracks?.length) return;
    const track = res.tracks[Math.floor(Math.random() * Math.min(res.tracks.length, 5))];
    player.queue.add(track);
    if (!player.playing) await player.play();
  } catch {}
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
