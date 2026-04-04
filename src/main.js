import { MainScene } from './scenes/MainScene.js';

const config = {
    type: Phaser.AUTO,
    title: 'Black Market Tycoon',
    description: 'An idle game about growing a small backroom hustle into an underground network.',
    parent: 'game-container',
    width: 390,
    height: 844,
    backgroundColor: '#1d2430',
    pixelArt: false,
    scene: [
        MainScene
    ],
    scale: {
        mode: Phaser.Scale.FIT,
        autoCenter: Phaser.Scale.CENTER_BOTH,
        width: 390,
        height: 844,
    }
};

new Phaser.Game(config);
            
