import streamDeck from '@elgato/streamdeck';

import { SonosVolumeUp, SonosVolumeDown, SonosPlayPause } from './actions/sonos-volume';

const logger = streamDeck.logger.createScope('SonosVolumePlugin');
logger.info('Sonos Volume plugin starting...');

// Register the volume up / down and play/pause actions.
streamDeck.actions.registerAction(new SonosVolumeUp());
streamDeck.actions.registerAction(new SonosVolumeDown());
streamDeck.actions.registerAction(new SonosPlayPause());

// Finally, connect to the Stream Deck.
streamDeck.connect();
