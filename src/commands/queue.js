const { SlashCommandBuilder, EmbedBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("queue")
    .setDescription("Show the current queue"),

  async execute(interaction, client) {
    await interaction.deferReply();

    const player = client.lavalink.getPlayer(interaction.guildId);
    if (!player || !player.queue.current)
      return interaction.editReply("Nothing is currently playing.");

    const current = player.queue.current;
    const upcoming = player.queue.tracks;

    const lines = upcoming.slice(0, 15).map((t, i) => {
      const dur = t.info.isStream ? "LIVE" : formatDuration(t.info.duration);
      return `\`${i + 1}.\` **[${t.info.title}](${t.info.uri})** — ${dur}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0xff0000)
      .setTitle("Queue")
      .addFields({
        name: "Now Playing",
        value: `**[${current.info.title}](${current.info.uri})** — ${
          current.info.isStream ? "🔴 LIVE" : formatDuration(current.info.duration)
        }`,
      });

    embed.addFields({
      name: `Up Next (${upcoming.length} track${upcoming.length !== 1 ? "s" : ""})`,
      value: lines.length ? lines.join("\n") : "Nothing queued.",
    });

    if (upcoming.length > 15)
      embed.setFooter({ text: `...and ${upcoming.length - 15} more` });

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
