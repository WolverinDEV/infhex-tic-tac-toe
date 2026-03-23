import './index.css'
import 'react-toastify/dist/ReactToastify.css'
import { installSoundEffects } from './soundEffects'

installSoundEffects()

import("./main").then(() => {
    console.log("App loaded");
}).catch(error => {
    console.error(error);
    alert('Failed to load app.\nPlease reload!');
});