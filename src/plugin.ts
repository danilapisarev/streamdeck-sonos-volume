import streamDeck, { LogLevel } from '@elgato/streamdeck';

import { SonosVolumeUp, SonosVolumeDown } from './actions/sonos-volume';

// Set up logging with DEBUG level for development.
streamDeck.logger.setLevel(LogLevel.DEBUG);
const logger = streamDeck.logger.createScope('SonosVolumePlugin');
logger.info('Sonos Volume plugin starting...');

// Register the volume up / down actions.
streamDeck.actions.registerAction(new SonosVolumeUp());
streamDeck.actions.registerAction(new SonosVolumeDown());

// Finally, connect to the Stream Deck.
streamDeck.connect();
