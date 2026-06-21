const { SlashCommandBuilder } = require("discord.js");

module.exports = {
  data: new SlashCommandBuilder()
    .setName("autoplay")
    .setDescription("Toggle autoplay when the queue ends"),

  async execute(interaction, client) {
    await interaction.deferReply();

    const player = client.lavalink.getPlayer(interaction.guildId);
    if (!player)
      return interaction.editReply("No active player. Start playing something first.");

    const next = !player.get("autoplay");
    player.set("autoplay", next);
    await interaction.editReply(`Autoplay is now **${next ? "enabled ✅" : "disabled ❌"}**.`);
  },
};
