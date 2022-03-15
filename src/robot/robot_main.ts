import { ParameterSet, User, Color4, Color3, AlphaMode } from '@microsoft/mixed-reality-extension-sdk';
import Applet from '../Applet';
import { ContextLike } from '../frameworks/context/types';
import { fetchJSON, joinUrl } from '../helpers';
import { Robot } from './robot';

const defaultRobotOptions = {
    text: "Ground control to major tom. Check ignition and may god's love be with you",
    button: {
        resourceId: "artifact:1672057332957184897",
    }
}

/**
 * The main class of this app. All the logic goes here.
 */
export default class RobotApp extends Applet {
    private subUrl: string;
    private isStarted: boolean = false;
    private users: User[] = [];

    private robot: Robot;
    private url: string;

    public init(context: ContextLike, params: ParameterSet, baseUrl: string) {
        super.init(context, params, baseUrl);

        this.subUrl = joinUrl(this.baseUrl, 'tts');
        this.url = params['url'] ? params['url'] as string : '';

        this.context.onUserJoined(this.userjoined);
        this.context.onUserLeft(this.userleft);
        this.context.onStarted(this.started);
    }

    private userjoined = async (user: User) => {
        if (!this.isStarted){ this.users.push(user); }
        this.join(user);
    }

    private userleft = async (user: User) => {
        this.robot.userleft(user);
    }

    private started = async () => {
        await this.loadMaterials();
        const options = this.url ? await fetchJSON(this.url) : defaultRobotOptions;
        this.robot = new Robot(this.context, options, this.subUrl);
        this.users.forEach(u=>this.join(u));
    }

    private async join(user: User){
        this.robot.userjoined(user);
    }

    private async loadMaterials() {
        this.context.assets.createMaterial('invis', { color: Color4.FromColor3(Color3.Red(), 0.0), alphaMode: AlphaMode.Blend });
        this.context.assets.createMaterial('highlight', { color: Color4.FromColor3(Color3.Red(), 0.0), alphaMode: AlphaMode.Blend });
        this.context.assets.createMaterial('trans_red', { color: Color4.FromColor3(Color3.Red(), 0.1), alphaMode: AlphaMode.Blend });
        this.context.assets.createMaterial('debug', { color: Color4.FromColor3(Color3.Teal(), 0.3), alphaMode: AlphaMode.Blend });
        this.context.assets.createMaterial('gray', { color: Color3.DarkGray() });
    }
}