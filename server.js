// Modules
const { Client, Intents, MessageEmbed } = require("discord.js");
const { joinVoiceChannel, VoiceConnectionStatus, createAudioPlayer, NoSubscriberBehavior, createAudioResource } = require("@discordjs/voice");
const ytdl = require("ytdl-core");
const play = require("play-dl")
const Youtube = require("youtube-sr").default;

// Constants
const token = "OTYzNzYxNzk1MTA4MDY1Mjgw.YlazHQ.wX3C-2U0sItTzr_vr-oGoknMs9I";
const inviteLink = "https://discord.com/api/oauth2/authorize?client_id=963761795108065280&permissions=412320521280&scope=bot";
const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES, Intents.FLAGS.GUILD_VOICE_STATES]
});
const prefix = "?";

// StreamingSession
function StreamingSession(guildProfile) {
	this.guildProfile = guildProfile;
	this.status = "idle";
	this.currentTrack = "";
	this.messageChannel = null;
	this.queue = new Map();

	this.rearrangeQueue = () => {
		const map = [];
		this.queue.forEach((value, key) => {
			map.push(value);
			this.queue.delete(key);
		});
		map.forEach((value, index) => {
			this.queue.set(index + 1, value);
		});
	}

	this.play = () => {
		const audio = this.queue.get(1);
		const embed = new MessageEmbed();
		embed.setColor("#000000");
		embed.setTitle("Playing track: `" + audio[0] + "`");
		this.messageChannel.send({embeds: [embed]});
		this.currentTrack = audio[0];
		this.guildProfile.play();
		this.queue.delete(1);
		this.rearrangeQueue();
	}

	this.error = () => {
		const embed = new MessageEmbed();
		embed.setColor("#000000");
		embed.setTitle("I had an error!");
		this.messageChannel.send({embeds: [embed]});
	}

	this.start = (messageChannel) => {
		this.messageChannel = messageChannel;
		// const embed = new MessageEmbed();
		// embed.setColor("#000000");
		// embed.setTitle("Session started");
		// this.messageChannel.send({embeds: [embed]});
		this.status = "playing";
	}

	this.stop = () => {
		// const embed = new MessageEmbed();
		// embed.setColor("#000000");
		// embed.setTitle("Session ended");
		// this.messageChannel.send({embeds: [embed]});
		this.messageChannel = null;
		this.status = "idle";
		this.queue = new Map();
		this.guildProfile.player = createAudioPlayer({
			behaviors: {
				noSubscriber: NoSubscriberBehavior.Pause,
			},
		});
	}

	this.remove = (position) => {
		const song = this.queue.get(Number(position));
		if (!song) {return;}
		this.rearrangeQueue();
		const embed = new MessageEmbed();
		embed.setColor("#000000");
		embed.setTitle("Removed track `" + song[0] + "` from queue");
		embed.setDescription("Added by <@" + song[2] + ">");
		this.messageChannel.send({embeds: [embed]});
		this.queue.delete(Number(position));
	}

	this.queueSong = (searchQuery, id) => {
		const ytSearch = Youtube.searchOne(searchQuery);
		ytSearch.then((ytSearchData) => {
			console.log(ytSearchData.title);
			this.queue.set(this.queue.size + 1, [searchQuery, ytSearchData.id, id]);
			if (this.guildProfile.player._state.status !== "playing" && this.guildProfile.player._state.status !== "paused") {
				this.play();
			} else {
				const embed = new MessageEmbed();
				embed.setColor("#000000");
				embed.setTitle("Found YouTube url for `" + searchQuery + "`");
				this.messageChannel.send({embeds: [embed]});
			}
		});
	}
}

// GuildProfile
function GuildProfile(guildId) {
	this.guildId = guildId;
	this.session = new StreamingSession(this);

	this.player = createAudioPlayer({
		behaviors: {
			noSubscriber: NoSubscriberBehavior.Pause,
		},
	});

	this.player.on("idle", () => {
		if (this.session.queue.get(1)) {
			this.session.play();
		} else {
			this.disconnect();
		}
	});

	this.player.on("error", error => {
		console.log(`Error: ${error.message}`);
		this.session.error();
	});

	this.play = () => {
		if (!this.session.queue.get(1)) {return;}
		const audio = this.session.queue.get(1);
		const stream = ytdl("https://www.youtube.com/watch?v=" + audio[1], { filter: 'audioonly', quality: 'highestaudio' });
		const resource = createAudioResource(stream);
		this.player.play(resource);
		this.connection.subscribe(this.player);
	}

	this.pause = () => {
		this.player.pause();
	}

	this.resume = () => {
		this.player.unpause();
	}

	this.connect = (channelId, messageChannel) => {
		const channel = client.channels.cache.get(channelId);
		const guildId = channel.guildId;
		const voiceAdapterCreator = channel.guild.voiceAdapterCreator;
		const channelName = channel.name;
		this.connection = joinVoiceChannel({
			channelId: channelId,
			guildId: guildId,
			adapterCreator: voiceAdapterCreator,
			selfDeaf: false
		});
		this.connectionReady = this.connection.on(VoiceConnectionStatus.Ready, () => {
			// const embed = new MessageEmbed();
			// embed.setColor("#000000");
			// embed.setTitle("Connected to voice channel: `" + channelName + "`");
			// messageChannel.send({embeds: [embed]});
		});
		this.connectionDisconnected = this.connection.on(VoiceConnectionStatus.Disconnected, async (oldState, newState) => {
			try {
				await Promise.race([
					entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
					entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
				]);
				// Seems to be reconnecting to a new channel - ignore disconnect
			} catch (error) {
				// Seems to be a real disconnect which SHOULDN'T be recovered from
				this.disconnect()
			}
		});
	}

	this.disconnect = () => {
		if (this.connection._state.status !== "disconnected") {
			this.connection.destroy();
		}
		this.session.stop();
	}

	this.queueSong = (message, searchQuery) => {
		if (this.connection) {
			if (this.connection._state.status !== "ready") {
				this.connect(message.member.voice.channelId, message.channel);
			}
		} else {
			this.connect(message.member.voice.channelId, message.channel);
		}
		if (this.session.status === "idle") {
			this.session.start(message.channel);
		}
		this.session.queueSong(searchQuery, message.member.user.id);
	}

	this.showQueue = (messageChannel) => {
		const embed = new MessageEmbed();
		embed.setColor("#000000");
		if (this.session.queue.size === 0) {
			embed.setTitle("No songs in queue right now");
		} else {
			this.session.queue.forEach((value, key) => {
				embed.addField(key + ". " + value[0], "Added by <@" + value[2] + ">");
			});
		}
		messageChannel.send({embeds: [embed]});
	}

	this.onVoiceStateUpdate = () => {
		if (this.connection) {
			const voiceChannel = client.channels.cache.get(this.connection.joinConfig.channelId);
			if (voiceChannel.members.size === 1 && this.connection.joinConfig.channelId === voiceChannel.id && this.connection.state.status !== "destroyed") {
				this.disconnect();
			}
		}
	}

	this.onMessageCreate = (message) => {
		const messageSplit = message.content.split(" ");
		const embed = new MessageEmbed();
		switch(messageSplit[0]) {
			case prefix + "play":
				if (!message.member.voice.channelId) {
					embed.setColor("#000000");
					embed.setTitle("Connect to a voice channel first!");
					return message.channel.send({embeds: [embed]});
				} else {
					const permissions = message.member.voice.channel.permissionsFor(message.client.user);
					if (!permissions.has("CONNECT") || !permissions.has("SPEAK")) {
						embed.setColor("#000000");
						embed.setTitle("I don't have the permissions to join and speak in your voice channel!");
						return message.channel.send({embeds: [embed]});
					}
					let searchQuery = "";
					for (let i = 1; i < messageSplit.length; i++) {
						if (i + 1 === messageSplit.length) {
							searchQuery = searchQuery + messageSplit[i];
						} else {
							searchQuery = searchQuery + messageSplit[i] + " ";
						}
					}
					this.queueSong(message, searchQuery);
				}
				break;
			case prefix + "queue":
				this.showQueue(message.channel);
				break;
			case prefix + "remove":
				this.session.remove(messageSplit[1]);
				break;
			case prefix + "pause":
				this.pause();
				break;
			case prefix + "resume":
				this.resume();
				break;
			case prefix + "skip":
				if (this.session.queue.size === 0) {
					this.disconnect();
				} else {
					this.session.play();
				}
				break;
			case prefix + "invite":
				embed.setColor("#000000");
				embed.setTitle("Invite link");
				embed.setURL(inviteLink);
				message.channel.send({embeds: [embed]});
				break;
			case prefix + "help":
				embed.setColor("#000000");
				embed.setTitle("Commands");
				embed.addField(prefix + "play <song name>", "Play a song");
				embed.addField(prefix + "queue", "Display current queue");
				embed.addField(prefix + "remove <song position in queue>", "Remove a song from queue");
				embed.addField(prefix + "pause", "Pause current song");
				embed.addField(prefix + "resume", "Resume playing current song");
				embed.addField(prefix + "skip", "Skip current song which is playing");
				embed.addField(prefix + "invite", "Get the invite link to add this bot to your server");
				message.channel.send({embeds: [embed]});
				break;
		}
	}
}

// Guilds
const guilds = new Map();
const checkGuildProfile = (guildId) => {
	let exists = false;
	guilds.forEach((value, key) => {
		if (key === guildId) {
			exists = true;
		}
	});
	if (!exists) {
		let newGuildProfile = new GuildProfile(guildId);
		guilds.set(guildId, newGuildProfile);
	}
}

client.once("ready", () => {
    console.log("Ready!");
});
client.once("reconnecting", () => {
    console.log("Reconnecting!");
});
client.once("disconnect", () => {
    console.log("Disconnect!");
});

client.on("voiceStateUpdate", (oldState, newState) => {
	let guildId = oldState.guild.id;
	checkGuildProfile(guildId);
	let guildProfile = guilds.get(guildId);
	guildProfile.onVoiceStateUpdate(oldState, newState);
});

client.on("messageCreate", (message) => {
	if (message.content === prefix + "devstats") {
		let sessions = 0;
		const embed = new MessageEmbed();
		embed.setColor("#000000");
		embed.setTitle("Dev stats");
		embed.addField("Number of servers bot is added to", (client.guilds.cache.size) + " servers");
		guilds.forEach((guild, key) => {
			let status = guild.session.status;
			if (status !== "idle") {
				sessions += 1;
			}
		})
		embed.addField("Number of sessions currently running", sessions + " sessions");
		message.channel.send({embeds: [embed]});
	} else {
		let guildId = message.guildId;
		checkGuildProfile(guildId);
		let guildProfile = guilds.get(guildId);
		guildProfile.onMessageCreate(message);
	}
});

client.login(token);

// Main
// OTYzNzYxNzk1MTA4MDY1Mjgw.YlazHQ.wX3C-2U0sItTzr_vr-oGoknMs9I
// https://discord.com/api/oauth2/authorize?client_id=963761795108065280&permissions=412320521280&scope=bot
// Test
// OTY3MzUxNDY5OTY5OTIwMDAy.YmPCQg.kcho3B8WTtXYDWX9bwcrdteJjGA
// https://discord.com/api/oauth2/authorize?client_id=967351469969920002&permissions=412320521280&scope=bot