import './index.css'
import 'react-toastify/dist/ReactToastify.css'
import { installSoundEffects } from './soundEffects'
import "./earlySocketConnection";

installSoundEffects()

const start = performance.now();
import("./main").then(() => {
    console.log("App loaded in %dms", performance.now() - start);
}).catch(error => {
    console.error(error);
    alert('Failed to load app.\nPlease reload!');
});