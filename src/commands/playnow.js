const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("playnow")
    .setDescription("Immediately play a track, skipping the current one")
    .addStringOption((o) =>
      o.setName("query").setDescription("Song name, YouTube URL, or Spotify URL").setRequired(true)
    ),

  async execute(interaction, client) {
    await interaction.deferReply();

    const voiceChannel = interaction.member.voice?.channel;
    if (!voiceChannel)
      return interaction.editReply("You must be in a voice channel.");

    let player = client.lavalink.getPlayer(interaction.guildId);
    if (!player) {
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

    if (!player.connected) await player.connect();

    const query = interaction.options.getString("query");
    const isUrl = /^https?:\/\//.test(query);
    const searchSource = isUrl ? undefined : "ytmsearch";

    // Use jirayu for search, fallback to player node
    const searchNode = client.lavalink.nodeManager.nodes.get("jirayu")
      ?? client.lavalink.nodeManager.leastUsedNodes[0];

    const res = await searchNode
      .search(isUrl ? { query } : { query, source: searchSource }, interaction.user)
      .catch(async (err) => {
        console.warn(`[PlayNow] jirayu search failed, falling back:`, err.message);
        return player
          .search(isUrl ? { query } : { query, source: searchSource }, interaction.user)
          .catch((e) => { console.error(`[PlayNow] Search error:`, e.message); return null; });
      });

    if (!res || res.loadType === "empty" || res.loadType === "error")
      return interaction.editReply("No results found.");

    const track = res.tracks[0];
    player.queue.splice(0, 0, track);
    await player.skip();

    await interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setTitle("Playing Now")
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
