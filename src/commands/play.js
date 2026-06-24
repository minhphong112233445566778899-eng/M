const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("play")
    .setDescription("Search or play a track / Spotify link / playlist")
    .addStringOption((o) =>
      o.setName("query").setDescription("Song name, YouTube URL, or Spotify URL").setRequired(true)
    ),

  async execute(interaction, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member.voice?.channel;
    if (!voiceChannel)
      return interaction.editReply("You must be in a voice channel.");

    const perms = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (!perms.has("Connect") || !perms.has("Speak"))
      return interaction.editReply("I need permission to join and speak in your channel.");

    let player = client.lavalink.getPlayer(interaction.guildId);
    const isNew = !player;

    if (!player) {
      // Use our own Railway node for playback
      const customNode = client.lavalink.nodeManager.nodes.get("custom");
      player = client.lavalink.createPlayer({
        guildId: interaction.guildId,
        voiceChannelId: voiceChannel.id,
        textChannelId: interaction.channelId,
        selfDeaf: true,
        selfMute: false,
        node: customNode?.id ?? "custom",
      });
    }

    if (!player.connected) {
      await player.connect();
      console.log(`[Play] Connected to voice for guild ${interaction.guildId} (new=${isNew})`);
      if (isNew) {
        await new Promise((r) => setTimeout(r, 1000));
      }
    }

    const query = interaction.options.getString("query");
    const isUrl = /^https?:\/\//.test(query);
    const searchSource = isUrl ? undefined : "ytmsearch";

    console.log(`[Play] Searching: "${query}" source=${searchSource || "auto"}`);

    // Search via jirayu, but always resolve/play through the player's own node (custom)
    // so track encoded data matches the node that will actually play it
    const res = await player
      .search(isUrl ? { query } : { query, source: searchSource }, interaction.user)
      .catch((err) => {
        console.error(`[Play] Search error:`, err.message || err);
        return null;
      });

    console.log(`[Play] Search result: loadType=${res?.loadType}, tracks=${res?.tracks?.length}`);

    if (!res || res.loadType === "empty" || res.loadType === "error")
      return interaction.editReply(`No results found for \`${query}\`.`);

    if (res.loadType === "playlist") {
      for (const track of res.tracks) player.queue.add(track);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Playlist Added")
            .setDescription(
              `Added **${res.tracks.length}** tracks from **${res.playlist?.name || "playlist"}** to the queue.`
            ),
        ],
      });
    } else {
      const track = res.tracks[0];
      player.queue.add(track);
      await interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setTitle("Added to Queue")
            .setDescription(`**[${track.info.title}](${track.info.uri})**`)
            .addFields(
              { name: "Author", value: track.info.author || "Unknown", inline: true },
              {
                name: "Duration",
                value: track.info.isStream ? "🔴 LIVE" : formatDuration(track.info.duration),
                inline: true,
              }
            )
            .setThumbnail(track.info.artworkUrl || null),
        ],
      });
    }

    if (!player.playing && !player.paused) {
      console.log(`[Play] Starting playback for guild ${interaction.guildId}`);
      await player.play().catch((err) =>
        console.error(`[Play] player.play() error:`, err.message || err)
      );
    }
  },
};

function formatDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
  return `${m}:${String(sec).padStart(2, "0")}`;
}
