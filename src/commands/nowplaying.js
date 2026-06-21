const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Show details about the currently playing track"),

  async execute(interaction, client) {
    await interaction.deferReply();

    const player = client.lavalink.getPlayer(interaction.guildId);
    if (!player || !player.queue.current)
      return interaction.editReply("Nothing is currently playing.");

    const track = player.queue.current;
    const position = player.position;
    const duration = track.info.duration;

    const barLen = 20;
    const filled = track.info.isStream
      ? barLen
      : Math.round((position / duration) * barLen);
    const bar =
      "▬".repeat(Math.max(0, filled - 1)) +
      "🔘" +
      "▬".repeat(Math.max(0, barLen - filled));

    const embed = new EmbedBuilder()
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
        { name: "Requested By", value: `${track.requester?.username || "Unknown"}`, inline: true },
        { name: "Progress", value: bar }
      )
      .setThumbnail(track.info.artworkUrl || "");

    await interaction.editReply({ embeds: [embed] });
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
