const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("channelstatus")
    .setDescription("Set or clear the current voice channel's status")
    .addStringOption((o) =>
      o
        .setName("status")
        .setDescription('Text to display — leave blank to clear, use "auto" to show current song')
        .setRequired(false)
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ ephemeral: true });

    const voiceChannel = interaction.member.voice?.channel;
    if (!voiceChannel)
      return interaction.editReply("You must be in a voice channel to set its status.");

    const perms = voiceChannel.permissionsFor(interaction.guild.members.me);
    if (!perms.has(PermissionFlagsBits.ManageChannels))
      return interaction.editReply(
        "I need the **Manage Channel** permission on that voice channel to set its status."
      );

    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageChannels))
      return interaction.editReply(
        "You need the **Manage Channel** permission to set a voice channel status."
      );

    const input = interaction.options.getString("status");

    // "auto" = pull the current track title from the player
    if (input?.toLowerCase() === "auto") {
      const player = client.lavalink.getPlayer(interaction.guildId);
      if (!player?.queue?.current)
        return interaction.editReply(
          "Nothing is currently playing — can't auto-set the status."
        );

      const track = player.queue.current;
      const status = `🎵 ${track.info.title}`;
      await setChannelStatus(voiceChannel, status);
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setDescription(`✅ Channel status set to: **${status}**`),
        ],
      });
    }

    // Empty input = clear the status
    if (!input) {
      await setChannelStatus(voiceChannel, "");
      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setDescription("✅ Channel status cleared."),
        ],
      });
    }

    // Custom text
    await setChannelStatus(voiceChannel, input);
    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(`✅ Channel status set to: **${input}**`),
      ],
    });
  },
};

async function setChannelStatus(channel, status) {
  // Discord.js exposes this via channel.setStatus() in v14.14+
  await channel.setStatus(status).catch((err) => {
    console.error("[ChannelStatus] Failed to set voice channel status:", err.message);
    throw new Error("Discord rejected the status update — check bot permissions.");
  });
}
