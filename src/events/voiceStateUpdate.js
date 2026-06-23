module.exports = {
  name: "voiceStateUpdate",
  once: false,
  async execute(oldState, newState, client) {
    const player = client.lavalink.getPlayer(oldState.guild.id);
    if (!player) return;

    // Bot was disconnected from channel — clean up status and destroy player
    if (oldState.id === client.user.id && !newState.channelId) {
      if (player.voiceChannelId) {
        await client.rest.patch(`/channels/${player.voiceChannelId}`, {
          body: { status: "" },
        }).catch(() => {});
      }
      await player.destroy();
      return;
    }

    // Auto-leave if all humans leave
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
          // Clear status before leaving
          await client.rest.patch(`/channels/${p.voiceChannelId}`, {
            body: { status: "" },
          }).catch(() => {});
          await p.destroy();
          const ch = client.channels.cache.get(p.textChannelId);
          if (ch) ch.send("Left due to inactivity.");
        }
      }, 30000);
    }
  },
};
