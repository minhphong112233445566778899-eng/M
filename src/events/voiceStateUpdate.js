module.exports = {
  name: "voiceStateUpdate",
  once: false,
  async execute(oldState, newState, client) {
    const player = client.lavalink.getPlayer(oldState.guild.id);
    if (!player) return;

    if (oldState.id === client.user.id && !newState.channelId) {
      await player.destroy();
      return;
    }

    const voiceChannel = oldState.guild.channels.cache.get(player.voiceChannelId);
    if (!voiceChannel) return;
    const humans = voiceChannel.members.filter((m) => !m.user.bot);
    if (humans.size === 0) {
      setTimeout(async () => {
        const p = client.lavalink.getPlayer(oldState.guild.id);
        if (!p) return;
        const vc = oldState.guild.channels.cache.get(p.voiceChannelId);
        if (!vc) return;
        if (vc.members.filter((m) => !m.user.bot).size === 0) {
          await p.destroy();
          const ch = client.channels.cache.get(p.textChannelId);
          if (ch) ch.send("Left due to inactivity.");
        }
      }, 30000);
    }
  },
};
