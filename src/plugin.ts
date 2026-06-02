import streamDeck from '@elgato/streamdeck';

import { SonosVolumeUp, SonosVolumeDown } from './actions/sonos-volume';

const logger = streamDeck.logger.createScope('SonosVolumePlugin');
logger.info('Sonos Volume plugin starting...');

// Register the volume up / down actions.
streamDeck.actions.registerAction(new SonosVolumeUp());
streamDeck.actions.registerAction(new SonosVolumeDown());

// Finally, connect to the Stream Deck.
streamDeck.connect();
