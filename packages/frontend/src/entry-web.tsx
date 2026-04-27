import './index.css';
import 'react-toastify/dist/ReactToastify.css';

import { initializeOpenReplay } from './openReplay';
import { installSoundEffects } from './soundEffects';

installSoundEffects();
void initializeOpenReplay();

const start = performance.now();
import(`./main`).then(() => {
    console.log(`App loaded in %dms`, performance.now() - start);
}).catch(error => {
    console.error(error);
    alert(`Failed to load app.\nPlease reload!`);
});
