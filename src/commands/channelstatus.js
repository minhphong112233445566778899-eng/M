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

    // FIX 1: Guard against me being null (bot not cached in guild)
    const me = interaction.guild.members.me;
    if (!me)
      return interaction.editReply("I couldn't resolve my own member — please try again.");

    const perms = voiceChannel.permissionsFor(me);
    if (!perms?.has(PermissionFlagsBits.ManageChannels))
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

      // FIX 2: Properly catch and report errors back to the user
      try {
        await setChannelStatus(voiceChannel, status);
      } catch (err) {
        return interaction.editReply(`❌ ${err.message}`);
      }

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
      try {
        await setChannelStatus(voiceChannel, "");
      } catch (err) {
        return interaction.editReply(`❌ ${err.message}`);
      }

      return interaction.editReply({
        embeds: [
          new EmbedBuilder()
            .setColor(0xff0000)
            .setDescription("✅ Channel status cleared."),
        ],
      });
    }

    // Custom text
    try {
      await setChannelStatus(voiceChannel, input);
    } catch (err) {
      return interaction.editReply(`❌ ${err.message}`);
    }

    return interaction.editReply({
      embeds: [
        new EmbedBuilder()
          .setColor(0xff0000)
          .setDescription(`✅ Channel status set to: **${input}**`),
      ],
    });
  },
};

// FIX 3: channel.setStatus() does NOT exist in discord.js — use the REST API directly.
// Discord's PATCH /channels/{id} with a "status" field is the correct approach.
async function setChannelStatus(channel, status) {
  try {
    await channel.client.rest.patch(`/channels/${channel.id}`, {
      body: { status },
    });
  } catch (err) {
    console.error("[ChannelStatus] Failed to set voice channel status:", err.message);
    throw new Error("Discord rejected the status update — check bot permissions.");
  }
}
