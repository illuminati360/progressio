import { Actor, ButtonBehavior, Guid, MediaInstance, ScaledTransformLike, User } from "@microsoft/mixed-reality-extension-sdk";
import { ContextLike } from "../frameworks/context/types";

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { playSoundWithActor, translate } from "../helpers";
const gtts = require('node-gtts');
const { execSync } = require('child_process');
const sha256 = (x: string) => crypto.createHash('sha256').update(x, 'utf8').digest('hex');

const text2wav = require('text2wav');

export type MySound = {
	name: string,
	uri: string,
	duration?: number,
	volume?: number,
	rolloff?: number
}

export interface RobotOptions {
	text: string,
	button: {
		resourceId: string,
		transform: Partial<ScaledTransformLike>,
		dimensions?: {
			width: number,
			height: number,
			depth: number
		}
	},
	video?: {
		resourceId: string,
		transform: Partial<ScaledTransformLike>,
		duration: number,
		button: {
			resourceId: string,
			transform: Partial<ScaledTransformLike>,
		},
		screen: {
			resourceId: string,
			transform: Partial<ScaledTransformLike>,
		},
	}
}

export class Robot {
	private volume: number = 100;
	private rolloff: number = 100;
	private playing: Map<string, MediaInstance[]>;
	private stopped: Map<Guid, boolean>;

	private soundUsers: Map<MediaInstance, Guid>;
	private isPlaying: Map<Guid, boolean>;
	private buttons: Map<Guid, Actor>;

	private videos: Map<Guid, Actor>;
	private videoButtons: Map<Guid, Actor>;
	private videoTimouts: Map<Guid, NodeJS.Timeout>;

	private screen: Actor;

	constructor(private context: ContextLike, private options: RobotOptions, private subUrl: string) {
		this.playing = new Map<string, MediaInstance[]>();
		this.stopped = new Map<Guid, boolean>();
		this.soundUsers = new Map<MediaInstance, Guid>();
		this.isPlaying = new Map<Guid, boolean>();
		this.buttons = new Map<Guid, Actor>();

		this.videos = new Map<Guid, Actor>();
		this.videoButtons = new Map<Guid, Actor>();
		this.videoTimouts = new Map<Guid, NodeJS.Timeout>();

		this.init();
	}

	private init() {
	}

	public userjoined(user: User) {
		this.createButton(user);
		if (this.options.video) {
			this.createScreen();
			this.createVideoButton(user);
		}
	}

	public userleft(user: User) {
		if (this.buttons.has(user.id)) {
			this.buttons.get(user.id).destroy();
			this.buttons.delete(user.id);
		}

		if (this.videoButtons.has(user.id)) {
			this.videoButtons.get(user.id).destroy();
			this.videoButtons.delete(user.id);
		}

		if (this.videos.has(user.id)) {
			this.videos.get(user.id).destroy();
			this.videos.delete(user.id);
		}
	}

	private createScreen() {
		if (this.screen){ return; }
		const local = translate(this.options.video.screen.transform ? this.options.video.screen.transform : {}).toJSON();
		this.screen = Actor.CreateFromLibrary(this.context.baseContext, {
			resourceId: this.options.video.screen.resourceId,
			actor: {
				transform: { local }
			}
		});
	}

	private createButton(user: User) {
		if (!this.buttons.has(user.id)) {
			const dim = this.options.button.dimensions ? this.options.button.dimensions : { width: 0.1, height: 0.1, depth: 0.1 };
			let mesh = this.context.assets.meshes.find(m => m.name === 'mesh_button');
			if (!mesh) {
				mesh = this.context.assets.createBoxMesh('mesh_box', dim.width, dim.height, dim.depth);
			}
			const material = this.context.assets.materials.find(m => m.name === 'invis');

			const local = translate(this.options.button.transform ? this.options.button.transform : {}).toJSON();
			const button = Actor.CreateFromLibrary(this.context.baseContext, {
				resourceId: this.options.button.resourceId,
				actor: {
					exclusiveToUser: user.id,
					transform: { local }
				}
			});
			button.setBehavior(ButtonBehavior).onClick((user, _) => {
				if (!this.isPlaying.get(user.id)) {
					this.isPlaying.set(user.id, true);
					this.textToSpeech(this.options.text, 'en', user);
				} else {
					this.stop(user);
					this.isPlaying.set(user.id, false);
				}
			});
			this.buttons.set(user.id, button);
		}
	}

	private createVideoButton(user: User) {
		if (!this.videoButtons.has(user.id)) {
			const dim = this.options.button.dimensions ? this.options.button.dimensions : { width: 0.1, height: 0.1, depth: 0.1 };
			let mesh = this.context.assets.meshes.find(m => m.name === 'mesh_button');
			if (!mesh) {
				mesh = this.context.assets.createBoxMesh('mesh_box', dim.width, dim.height, dim.depth);
			}
			const material = this.context.assets.materials.find(m => m.name === 'invis');

			const local = translate(this.options.video.button.transform).toJSON();
			const button = Actor.CreateFromLibrary(this.context.baseContext, {
				resourceId: this.options.video.button.resourceId,
				actor: {
					exclusiveToUser: user.id,
					transform: { local }
				}
			});

			button.setBehavior(ButtonBehavior).onClick((user, _) => {
				if (!this.videos.get(user.id)) {
					this.playVideo(user);
				} else {
					this.stopVideo(user);
				}
			});
			this.videoButtons.set(user.id, button);
		}
	}

	// audios
	public async textToSpeech2(text: string, language: string, targetUser: User) {
		if (text.length > 300) { return; }
		const fileName = sha256(text);
		const filePath = path.join(__dirname, '../../public/tts', fileName);

		if (!fs.existsSync(filePath)) {
			await new Promise<string>(function (resolve, reject) {
				gtts(language ? language : 'en-us').save(`${filePath}.mp3`, text, () => {
					execSync(`ffmpeg -y -nostats -v quiet -loglevel 0 -i ${filePath}.mp3 ${filePath}.ogg`);
					resolve(filePath);
				});
			});
		}
		const uri = `${fileName}.ogg`;
		this.playSound({
			name: fileName,
			uri,
			duration: 100
		}, targetUser)
	}

	public async textToSpeech(text: string, language: string, targetUser: User) {
		if (text.length > 3000) { return; }
		const fileName = sha256(text) + '.wav';
		const filePath = path.join(__dirname, '../../public/tts', fileName);

		if (!fs.existsSync(filePath)) {
			const o = await this.tts(text);
			fs.writeFileSync(filePath, Buffer.from(o));
		}
		this.playSound({
			name: fileName,
			uri: filePath,
			duration: 100
		}, targetUser)
	}

	private async tts(text: string) {
		let o;
		try {
			// o = await text2wav(text, {voice: 'en+Annie'});
			o = await text2wav(text, { voice: 'en' });
		} catch (err) {
			return;
		}
		return o;
	}

	private loadSound(name: string, uri: string) {
		let sound = this.context.assets.sounds.find(m => m.name == `sound_${name}`);
		if (!this.context.assets.sounds.find(m => m.name == `sound_${name}`)) {
			sound = this.context.assets.createSound(`sound_${name}`, { uri });
		}
		return sound;
	}

	public async playSound(item: MySound, targetUser: User) {
		if (item === undefined) { return; }
		const uri = `${this.subUrl}/${path.basename(item.uri)}`;
		const sound = this.loadSound(item.name, uri);
		const speaker = this.buttons.get(targetUser.id);
		const mediaInstance = playSoundWithActor(sound, speaker, { volume: this.volume / 100, rolloffStartDistance: this.rolloff });
		if (this.playing.has('sound_' + item.name)) {
			this.playing.get('sound_' + item.name).push(mediaInstance);
		} else {
			this.playing.set('sound_' + item.name, [mediaInstance]);
		}
		this.stopped.set(mediaInstance.id, false);

		this.soundUsers.set(mediaInstance, targetUser.id);

		setTimeout(() => {
			this.stopped.set(mediaInstance.id, true);
			if (
				this.playing.get('sound_' + item.name).every(mi => this.stopped.get(mi.id))
			) {
				this.playing.get('sound_' + item.name).forEach(mi => this.stopped.delete(mi.id));
				this.playing.delete('sound_' + item.name);
			}
		}, item.duration * 1000);
	}

	private stop(user: User) {
		this.playing.forEach(m => {
			m.forEach(mi => {
				if (this.soundUsers.get(mi) === user.id) {
					mi.stop()
				}
			});
		})
	}

	// videos
	private playVideo(user: User) {
		const local = translate(this.options.video.transform).toJSON();
		const video = Actor.CreateFromLibrary(this.context.baseContext, {
			resourceId: this.options.video.resourceId,
			actor: {
				transform: { local },
				exclusiveToUser: user.id
			}
		});

		const timeout = setTimeout(() => {
			video.destroy();
		}, this.options.video.duration * 1000);
		this.videoTimouts.set(user.id, timeout);

		this.videos.set(user.id, video);
	}

	private stopVideo(user: User) {
		const video = this.videos.get(user.id);
		video.destroy();
		this.videos.delete(user.id);
		if (this.videoTimouts.has(user.id)) {
			clearTimeout(this.videoTimouts.get(user.id));
			this.videoTimouts.delete(user.id);
		}
	}
}