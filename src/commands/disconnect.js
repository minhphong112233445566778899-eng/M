const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("disconnect")
    .setDescription("Clear the queue and leave the voice channel"),

  async execute(interaction, client) {
    await interaction.deferReply();

    const player = client.lavalink.getPlayer(interaction.guildId);
    if (!player || !player.connected)
      return interaction.editReply("I'm not in a voice channel.");

    await player.destroy();
    await interaction.editReply("Disconnected and cleared the queue ✅");
  },
};
