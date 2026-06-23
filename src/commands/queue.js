const {
  SlashCommandBuilder,
  EmbedBuilder,
  ButtonBuilder,
  ButtonStyle,
  ActionRowBuilder,
  ComponentType,
} = require("discord.js");

const PAGE_SIZE = 10;

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
    const tracks = player.queue.tracks;
    const totalPages = Math.max(1, Math.ceil(tracks.length / PAGE_SIZE));
    let page = 0;

    const buildEmbed = (p) => {
      const slice = tracks.slice(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE);
      const lines = slice.map((t, i) => {
        const num = p * PAGE_SIZE + i + 1;
        const dur = t.info.isStream ? "🔴 LIVE" : formatDuration(t.info.duration);
        return `\`${num}.\` **[${t.info.title}](${t.info.uri})** — ${dur}`;
      });

      return new EmbedBuilder()
        .setColor(0xff0000)
        .setTitle("Queue")
        .addFields(
          {
            name: "Now Playing",
            value: `**[${current.info.title}](${current.info.uri})** — ${
              current.info.isStream ? "🔴 LIVE" : formatDuration(current.info.duration)
            }`,
          },
          {
            name: `Up Next — ${tracks.length} track${tracks.length !== 1 ? "s" : ""}`,
            value: lines.length ? lines.join("\n") : "Nothing queued.",
          }
        )
        .setFooter({ text: `Page ${p + 1} / ${totalPages}` });
    };

    const buildRow = (p) =>
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("queue_prev")
          .setLabel("◀ Prev")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p === 0),
        new ButtonBuilder()
          .setCustomId("queue_next")
          .setLabel("Next ▶")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(p >= totalPages - 1)
      );

    const msg = await interaction.editReply({
      embeds: [buildEmbed(page)],
      components: totalPages > 1 ? [buildRow(page)] : [],
    });

    if (totalPages <= 1) return;

    const collector = msg.createMessageComponentCollector({
      componentType: ComponentType.Button,
      time: 60_000,
      filter: (btn) => btn.user.id === interaction.user.id,
    });

    collector.on("collect", async (btn) => {
      if (btn.customId === "queue_prev") page = Math.max(0, page - 1);
      if (btn.customId === "queue_next") page = Math.min(totalPages - 1, page + 1);
      await btn.update({
        embeds: [buildEmbed(page)],
        components: [buildRow(page)],
      });
    });

    collector.on("end", () => {
      interaction.editReply({ components: [] }).catch(() => {});
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
