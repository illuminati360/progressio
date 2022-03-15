/*!
 * Copyright (c) iwontsay/willneedit. All rights reserved.
 * Licensed under the MIT License.
 */

import { Actor, ScaledTransform, User } from "@microsoft/mixed-reality-extension-sdk";

export interface DoorPart {
    prefabid: string;                   // Kit ID
    lockedprefabid?: string;            // Kid ID when door is locked - must be leaf node if present
    closed: Partial<ScaledTransform>;   // Local transform when closed
    open?: Partial<ScaledTransform>;    // Local transform when open. Default: Doesn't move in relation to parent
    opendelay?: number;                 // Time index when to start opening move, default = 0
    openduration?: number;              // Duration to transition from closed to open
    closedelay?: number;                // Time index when to start closing move, default = 0
    closeduration?: number;             // Duration to transition from open to closed
    isHandle?: boolean;                 // True if item is the usable door handle
    isTerminal?: boolean;               // True if item is the usable door terminal
    parts?: DoorPart[];                 // Subparts of the door

    actor?: Actor;
}

export interface DoorStructure {
    opensound?: string;                 // URL of opening sound
    closesound?: string;                // URL of closing sound
    lockedsound?: string;               // URL of the sound when someone rattles the handle
    greetingsound?: string;             // URL of the sound when someone rattles the handle
    rolloff: number;                    // Rolloff of the sounds
    volume: number;                    // Rolloff of the sounds
    opentime: number;                   // Seconds the door remains open
    greetingdelay: number;              // Seconds the door remains open
    password?: string;                  // Password
    isAutomatic?: boolean;              // True if door opens on trigger
    parts: DoorPart[];
    sensorPosition: {x: number, y: number, z: number};
                                        // Position of the sensor
    sensorDimensions: {width: number, height: number, depth: number};
                                        // Dimensions of the sensor
    isDebug?: boolean;                  // True if the trigger is highlighted
}