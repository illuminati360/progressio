/*!
 * Copyright (c) iwontsay/willneedit. All rights reserved.
 * Licensed under the MIT License.
 */

import path from 'path';
import url from 'url';
import { get as _get, request as _request } from 'http';
import { get as _gets, request as _requests } from 'https';
import querystring from 'querystring';

import {
    Actor,
    AssetContainer,
    Sound,
    MediaInstance,
    SetAudioStateOptions,
    User,
    ScaledTransform,
    ScaledTransformLike,
    Quaternion,
    DegreesToRadians,
    Color3,
} from "@microsoft/mixed-reality-extension-sdk";

const gltfPipeline = require('gltf-pipeline');

const email = process.env['EMAIL'];
const password = process.env['PASSWORD'];

/**
 * Return a single string param, either the param itself or the first one listed
 * @param param the value of one param in a ParameterSet
 */
export function single_param(param: string | string[]): string {
    if (Array.isArray(param) && param.length > 0) {
        return param[0];
    } else {
        return param as string;
    }
}

/**
 * Delay execution for the given amount of time. Use like 'await delay(1000)'
 * @param milliseconds Time to wait
 */
export function delay(milliseconds: number): Promise<void> {
    return new Promise<void>((resolve) => {
        setTimeout(() => resolve(), milliseconds);
    });
}

/**
 * Destroys a single actor or a whole array of actors
 * @param actors The actor(s) to remove.
 */
export function destroyActors(actors: Actor | Actor[]): Actor[] {
    if (!Array.isArray(actors)) {
        actors = [actors];
    }
    for (const actor of actors) {
        actor.destroy();
    }
    return [];
}

/**
 * Does a common initialization of a sound object on an actor
 * @param actor The actor the sound is tied to
 * @param url URL of the sound resource
 * @param sssoOvr Partial set of SetSoundStateOptions to deviate from common standards
 */
export function initSound(
    assets: AssetContainer,
    actor: Actor, url: string, sssoOvr?: Partial<SetAudioStateOptions>): MediaInstance {

    const soundAsset = assets.createSound('default', {
        uri: url
    });

    const sssoDefaults: SetAudioStateOptions = {
        volume: 0.5,
        looping: false,
        doppler: 1.0,
        rolloffStartDistance: 2.0
    };

    const si = actor.startSound(soundAsset.id, { ...sssoDefaults, ...(sssoOvr || { })});
    si.pause();

    return si;
}

/**
 * Restarts the sound from the start or a given offset
 * @param si Sound instance to start over
 * @param sssoOvr Optional: SoundStateOptions to override
 */
export function restartSound(si: MediaInstance, sssoOvr?: Partial<SetAudioStateOptions>) {
    const sssoDefaults: SetAudioStateOptions = {
        volume: 0.5,
        looping: false,
        doppler: 1.0,
        rolloffStartDistance: 2.0
    };
    si.stop();
    si.start({ ...sssoDefaults, ...(sssoOvr || { })});
}

export function playSoundWithActor(si: Sound, actor: Actor, options?: SetAudioStateOptions){
    let defaultSoundOptionsLike = {
        volume: 1,
        rolloffStartDistance: 1,
        looping: false
    };
    let opt: SetAudioStateOptions = (options !== undefined ) ? Object.assign(defaultSoundOptionsLike, options) : defaultSoundOptionsLike;

    return actor.startSound(si.id, opt);
}

export async function getGltf(url: string){
	if (path.extname(path.basename(url)) == '.gltf'){
		return fetchGltf(url);
	}

	let buffer = await fetchBin(url);
	return gltfPipeline.glbToGltf(buffer)
		.then(function(results: any) {
			return results.gltf;
		});
}

export async function fetchGltf(_url: string){
    return myFetch(_url, [/^model\/gltf\+json/]);
}

export async function fetchBin(_url: string){
    return myFetch(_url, [/^model\/gltf-binary/, /^application\/octet-stream/, /^.*$/]);
}

export async function fetchJSON(_url: string){
    let text = (await myFetch(_url, [/^application\/json/, /^text\/plain/])).toString();
    return JSON.parse(text);
}

export async function fetchText(_url: string){
    let text = (await myFetch(_url, [/^text\/plain/, /^text\/xml/])).toString();
    return text;
}

export async function fetchMP3(_url: string){
    return myFetch(_url, [/^audio\/mpeg/, /^application\/octet-stream/]);
}

export function joinUrl(baseUrl: string, uri: string){
    return new URL(uri, baseUrl).toString();
}

export function lineBreak(text: string, break_len: number =28){
	let ret = '';
	let lines = text.split('\n');
	lines.forEach((line,i) => {
		ret += line.slice(0, break_len);
		for (let i=1; i*break_len<line.length; i++){
			ret += '\n-' + line.slice(i*break_len, (i+1)*break_len);
		}
		if (i < lines.length - 1) ret += '\n'
	});
	return ret;
}

export function checkUserRole(user: User, role: string) {
    if (user.properties['altspacevr-roles'] === role ||
        user.properties['altspacevr-roles'].includes(role)) {
        return true;
    }
    return false;
}

function myFetch(_url: string, regs: RegExp[]): Promise<any> {
	let u = url.parse(_url);
	return new Promise((resolve, reject) => {
		let get = ((u.protocol == 'http:') ? _get : _gets);
		get(_url, res => {
			const { statusCode } = res;
			const contentType = res.headers['content-type'] as string;

			let error;
			if (statusCode !== 200) {
				error = new Error('Request Failed.\n' +
					`Status Code: ${statusCode}`);
			} else if (!regs.some(r=>r.test(contentType))) {
				error = new Error('Invalid content-type.\n' +
					`Expected something else but received ${contentType}`);
			}
			if (error) {
				reject(error.message);
				// consume response data to free up memory
				res.resume();
				return;
			}

			let rawData: any = [];
			res.on('data', (chunk) => { rawData.push(chunk); });
			res.on('end', () => {
				try {
					resolve(Buffer.concat(rawData));
				} catch (e) {
					reject(e);
				}
			});
		});
	});
}

export function transpose(m: any[][]){
    const cols = m.length;
    const rows = m.reduce(
        (a, c) => (c.length >= a ? c.length : a),
        0
    );

    const copy = [];
    for (let i=0; i<rows; i++){
        const row = [];
        for (let j=0; j<cols; j++){
            row.push( m[j][i] !== undefined ? m[j][i] : '' );
        }
        copy.push(row);
    }

    return copy;
}

export function breakdown(array: any[], cols: number){
    const rows = Math.floor(array.length / cols) + (array.length % cols ? 1 : 0);
    const ret = [];
    for (var i=0; i < rows-1; i++) {
        ret.push( array.slice( i*cols, (i+1)*cols ) );
    }
    ret.push( array.slice( (i)*cols ).concat(Array(rows*cols-array.length).fill({})) );
    return ret;
}

export function reshape(arr: any[], col: number){
    let ret = [];
    while(arr.length) { ret.push(arr.splice(0, col)); }
    return ret;
}

export function translate(transformLike: Partial<ScaledTransformLike>){
    const pos = transformLike.position ? transformLike.position : {x: 0, y: 0, z: 0};
    const rot = transformLike.rotation ? transformLike.rotation : {x: 0, y: 0, z: 0};
    const scale = transformLike.scale ? transformLike.scale : {x: 1, y: 1, z: 1};
    const transform = new ScaledTransform();
    transform.copy({
        position: pos,
        rotation: Quaternion.FromEulerAngles(
            rot.x * DegreesToRadians,
            rot.y * DegreesToRadians,
            rot.z * DegreesToRadians
        ),
        scale,
    });
    return transform;
}

export function translateBack(transformLike: Partial<ScaledTransformLike>){
    const pos = transformLike.position ? transformLike.position : {x: 0, y: 0, z: 0};
    const rot = transformLike.rotation ? transformLike.rotation : {x: 0, y: 0, z: 0};
    const scale = transformLike.scale ? transformLike.scale : {x: 1, y: 1, z: 1};
    const transform = new ScaledTransform();
    const q = new Quaternion(rot.x, rot.y, rot.z, rot.w);
    const e = q.toEulerAngles();
    transform.copy({
        position: pos,
        rotation: {
            x: e.x / DegreesToRadians,
            y: e.y / DegreesToRadians,
            z: e.z / DegreesToRadians,
        },
        scale,
    });
    return transform;
}

export function sum(arr: number[]){
    return arr.reduce((a,c)=>(a+c), 0)
}

export function parseHexColor(color: string){
    const r = parseInt(`0x${color.substr(1, 2)}`)/256;
    const g = parseInt(`0x${color.substr(3, 2)}`)/256;
    const b = parseInt(`0x${color.substr(5, 2)}`)/256;
    return new Color3(r,g,b);
}

export class Heap {
    private array: any[];
    private comparator: (a: any, b: any)=>number;

    constructor(cmp = (a: number, b: number) => a - b) {
        this.array = [];
        this.comparator = (i1, i2) => cmp(this.array[i1], this.array[i2]);
    }

    /**
     * Insert element
     * @runtime O(log n)
     * @param {any} value
     */
    public add(value: any) {
        this.array.push(value);
        this.bubbleUp();
    }

    /**
     * Move new element upwards on the Heap, if it's out of order
     * @runtime O(log n)
     */
    private parent = (i: number) => Math.ceil(i / 2 - 1);
    private swap(i1: number, i2: number){
        const t = this.array[i1];
        this.array[i1] = this.array[i2];
        this.array[i2] = t;
    }
    private bubbleUp() {
        let index = this.array.length - 1;
        while (this.parent(index) >= 0 && this.comparator(this.parent(index), index) > 0) {
            this.swap(this.parent(index), index);
            index = this.parent(index);
        }
    }
}

export function getDisplayName(username: string){
    fetchJSON('https://account.altvr.com/api/users/904dorian');
}

export function formatTime(time: number){
    const minute = Math.floor(time/60);
    const second = `${time%60}`.padStart(2, '0');
    return `${minute}:${second}`;
}

export function parseTime(time: string){
    const tl = time.split(':');
    const s = tl[tl.length-1] ? parseInt(tl[tl.length-1]) : 0;
    const m = tl[tl.length-2] ? parseInt(tl[tl.length-2]) : 0;
    const h = tl[tl.length-3] ? parseInt(tl[tl.length-3]) : 0;
    return (s+m*60+h*60*60)*1000;
}

export function printable(str: string){
    const ret = [];
    for (let i=0; i<str.length; i++){
        const n = str[i].charCodeAt(0);
        if (n > 31 && n < 127){
            ret.push(' ');
        } else {
            ret.push(str[i])
        }
    }

    return ret.join('');
}