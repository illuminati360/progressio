/*!
 * Copyright (c) iwontsay/willneedit. All rights reserved.
 * Licensed under the MIT License.
 */

import { DoorPart, DoorStructure } from "./types";

import got = require("got");
import { ContextLike } from "../context/types";

import {
    Actor,
    ActorLike,
    AnimationEaseCurves,
    ButtonBehavior,
    DegreesToRadians,
    MediaInstance,
    Quaternion,
    User,
    Guid,
    Sound,
    ColliderType,
    CollisionLayer,
    Color4,
    Color3,
    AlphaMode,
} from "@microsoft/mixed-reality-extension-sdk";

import { delay, initSound, playSoundWithActor, restartSound } from "../../helpers";

export default class BasicDoor {
    private static cache: { [url: string]: { time: number, struct: Promise<DoorStructure> } } = { };

    private context: ContextLike = null;
    private doorstate: DoorStructure = null;
    // tslint:disable:variable-name
    private _locked = false;
    private _open = false;
    private password: string;
    private isAutomatic: boolean;

    // tslint:enable:variable-name

    public get locked() { return this._locked; }
    public set locked(toLocked: boolean) { this.updateDoorState(this._open, toLocked); }

    public get open() { return this._open; }
    public set open(toOpen: boolean) { this.updateDoorState(toOpen, this._locked); }

    protected doorRoot: Actor = null;
    protected owner: User = null;

    private openSoundFX: Sound = null;
    private closeSoundFX: Sound = null;
    private lockedSoundFX: Sound = null;
    private greetingSoundFX: Sound = null;

    private rolloff: number;
    private volume: number;

    // trigger
    private trigger: Actor;
    private triggerToUser: Map<Actor, User>;


    private translateRotations(dp: DoorPart) {
        if (dp.closed && dp.closed.rotation) {
            dp.closed.rotation = Quaternion.RotationYawPitchRoll(
                dp.closed.rotation.y * DegreesToRadians,
                dp.closed.rotation.x * DegreesToRadians,
                dp.closed.rotation.z * DegreesToRadians
            );
        }

        if (dp.open && dp.open.rotation) {
            dp.open.rotation = Quaternion.RotationYawPitchRoll(
                dp.open.rotation.y * DegreesToRadians,
                dp.open.rotation.x * DegreesToRadians,
                dp.open.rotation.z * DegreesToRadians
            );
        }

        if (dp.parts) {
            dp.parts.forEach((dp2: DoorPart) => { this.translateRotations(dp2); });
        } else dp.parts = [ ];
    }

    private translateDSRotations(ds: DoorStructure) {
        ds.parts.forEach((dp: DoorPart) => { this.translateRotations(dp); });
    }

    private async loadDoorStructure(source: string | DoorStructure): Promise<DoorStructure> {

        const currentTime = new Date().getTime() / 1000;

        // Return a structure as-is
        if (typeof source !== 'string') {
            const ds: DoorStructure = source as DoorStructure;
            this.translateDSRotations(ds);
            return ds;
        }

        if (BasicDoor.cache[source] && BasicDoor.cache[source].time < currentTime) {
            BasicDoor.cache[source] = undefined;
        }

        // If we already have something cached, or waiting for the cache, return the Promise
        if (BasicDoor.cache[source]) return BasicDoor.cache[source].struct;

        BasicDoor.cache[source] = { time: currentTime + 10, struct: null };

        // Else create a new entry and wait for it to be filled
        BasicDoor.cache[source].struct = new Promise<DoorStructure>((resolve, reject) => {
            got(source, {json: true })
            .then((response) => {
                const ds: DoorStructure = response.body as DoorStructure;
                this.translateDSRotations(ds);
                resolve(ds);
            })
            .catch((err) => { reject(err); });
        });

        return BasicDoor.cache[source].struct;
    }

    public started(ctx: ContextLike, source: string | DoorStructure, owner: User = null) {
        this.owner = owner;
        this.context = ctx;
        this.triggerToUser = new Map<Actor, User>();
        this.loadDoorStructure(source).then((ds: DoorStructure) => { this.initDoor(ds); });
    }

    public stopped = async () => {
    }

    private updateDoorPart(pid: Guid, dp: DoorPart, updateopenstate: boolean, updatelockstate: boolean) {
        if (!dp.actor || updatelockstate) {
            const actorDef: Partial<ActorLike> = {
                parentId: pid
            };

            actorDef.transform = this._open && dp.open
                ? { local: dp.open }
                : { local: dp.closed };

            if (dp.actor) dp.actor.destroy();

            dp.actor = this.context.CreateFromLibrary({
                resourceId: this._locked && dp.lockedprefabid ? dp.lockedprefabid : dp.prefabid,
                actor: this.owner ? {
                    ...actorDef,
                    exclusiveToUser: this.owner.id
                } : actorDef
            });

            if (dp.isHandle) {
                dp.actor.setBehavior(ButtonBehavior).onClick((user: User) => { this.handlePressed(user); } );
            }
            
            if (dp.isTerminal && this.password) {
                dp.actor.setBehavior(ButtonBehavior).onClick((user: User) => { 
                    user.prompt("Password:", true).then((dialog) => {
                        if (dialog.submitted && dialog.text == this.password) {
                            this.open = true;
                        }
                    });
                } );
            }
        } else if (updateopenstate) {
            if (this._open && dp.open) {
                setTimeout(() => {
                    dp.actor.animateTo({
                        transform: { local: dp.open }
                    }, dp.openduration, AnimationEaseCurves.EaseInOutSine);
                }, (dp.opendelay || 0) * 1000);
            } else {
                setTimeout(() => {
                    dp.actor.animateTo({
                        transform: { local: dp.closed }
                    }, dp.closeduration, AnimationEaseCurves.EaseInOutSine);
                }, (dp.closedelay || 0) * 1000);
            }
        }

        dp.parts.forEach((dp2: DoorPart) => {
            this.updateDoorPart(dp.actor.id, dp2, updateopenstate, updatelockstate);
        });
    }

    private initDoor(ds: DoorStructure) {
        this.owner = this.owner ? this.owner : null;
        this.doorRoot = Actor.Create(this.context.baseContext, {
            actor: this.owner ? {
                exclusiveToUser: this.owner.id
            } : {}
        });

        if (ds.opensound) this.openSoundFX =  this.context.assets.createSound('open', { uri: ds.opensound });
        if (ds.closesound) this.closeSoundFX = this.context.assets.createSound('close', { uri: ds.closesound });
        if (ds.lockedsound) this.lockedSoundFX = this.context.assets.createSound('locked', { uri: ds.lockedsound });
        if (ds.greetingsound) this.greetingSoundFX = this.context.assets.createSound('greeting', { uri: ds.greetingsound });
        if (ds.rolloff) this.rolloff = ds.rolloff;
        if (ds.volume) this.volume = ds.volume;

        if (ds.password) this.password = ds.password;

        this.isAutomatic = ds.isAutomatic !== undefined ? ds.isAutomatic : true;

        if (this.isAutomatic){
            // trigger
            const debug = ds.isDebug !== undefined ? ds.isDebug : false;
            const transMat = this.context.assets.createMaterial('invis', {
                color: Color4.FromColor3(Color3.Red(), debug ? 0.1 : 0.0), alphaMode: AlphaMode.Blend
            });
            const sensorPosition = ds.sensorPosition ? ds.sensorPosition : {x: 0, y: 1, z: 0};
            const sensorDimensions = ds.sensorDimensions ? ds.sensorDimensions : {width: 2, height: 1, depth: 2};

            this.trigger = Actor.Create(this.context.baseContext, {
                actor: {
                    name: "trigger",
                    appearance: {
                        meshId: this.context.assets.createBoxMesh('trigger', sensorDimensions.width, sensorDimensions.height, sensorDimensions.depth).id,
                        materialId: transMat.id
                    },
                    transform: {
                        local: { position: sensorPosition }
                    },
                    collider: {
                        isTrigger: true,
                        geometry: { shape: ColliderType.Auto },
                        layer: CollisionLayer.Hologram
                    }
                }
            });

            this.trigger.collider.onTrigger("trigger-enter", (actor)=>{
                const user = this.triggerToUser.get(actor);
                // this.handlePressed(user);
                this.open = true;
                console.log('user',user.name,'entered');
            });
        }

        // Deep clone the door structure to avoid backscatter into the cache
        this.doorstate = JSON.parse(JSON.stringify(ds));
        this.doorstate.parts.forEach((dp: DoorPart) => {
            this.updateDoorPart(this.doorRoot.id, dp, false, false);
        });
    }

    private updateDoorState(toOpen: boolean, toLocked: boolean) {
        let updatelockstate = false;
        let updateopenstate = false;

        if (toOpen !== this.open) updateopenstate = true;
        if (toLocked !== this.locked) updatelockstate = true;

        if (!updateopenstate && !updatelockstate) return;

        this._locked = toLocked;

        const volume = this.volume ? this.volume : 1;
        if (this.locked && updateopenstate) {
            // restartSound(this.lockedSoundFX);
            this.doorRoot.startSound(this.lockedSoundFX.id, Object.assign({looping: false, volume}, this.rolloff ? {rolloffStartDistance: this.rolloff} : {}));
            updateopenstate = false;
        }

        if (updateopenstate) {
            this._open = toOpen;
            // restartSound(toOpen ? this.openSoundFX : this.closeSoundFX);
            this.doorRoot.startSound((toOpen ? this.openSoundFX : this.closeSoundFX).id, Object.assign({looping: false, volume}, this.rolloff ? {rolloffStartDistance: this.rolloff} : {}));
        }

        this.doorstate.parts.forEach((dp: DoorPart) => {
            this.updateDoorPart(this.doorRoot.id, dp, updateopenstate, updatelockstate);
        });

        if (this._open && this.doorstate.opentime) {
            delay(this.doorstate.opentime * 1000).then(() => { this.updateDoorState(false, toLocked); });
        }

        if (this._open && this.doorstate.greetingdelay) {
            delay(this.doorstate.greetingdelay * 1000).then(() => { this.doorRoot.startSound(this.greetingSoundFX.id, Object.assign({looping: false, volume}, this.rolloff ? {rolloffStartDistance: this.rolloff} : {})) });
        }
    }

    private handlePressed(user: User) {
        this.open = !this.open;
    }

    public addUser(user: User, trigger: Actor){
        this.triggerToUser.set(trigger, user);
    }

    public removeUser(trigger: Actor){
        this.triggerToUser.delete(trigger);
    }

    public remove(){
        this.doorRoot.destroy();
    }
}
