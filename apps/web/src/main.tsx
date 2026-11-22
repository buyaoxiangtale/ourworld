import React from 'react';
import ReactDOM from 'react-dom/client';
import '@fontsource/manrope/400.css';
import '@fontsource/manrope/500.css';
import '@fontsource/manrope/600.css';
import '@fontsource/newsreader/400.css';
import '@fontsource/newsreader/400-italic.css';
import '@fontsource/noto-sans-sc/400.css';
import './styles.css';
import './visual-tokens.css';
import './mature.css';
import './discovery.css';
import './features/profile/profile-owner.css';
import './features/explore/country-cities.css';
import './starlight.css';
import { App } from './App';
import {startFrontendUpdates} from './frontend-updates';
ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);
startFrontendUpdates();
// Hand over from the pre-mount starlight splash once the first app frame has
// committed; a single rAF can fire before React's concurrent render lands.
requestAnimationFrame(()=>requestAnimationFrame(()=>{const splash=document.getElementById('pre-starlight');if(splash){splash.classList.add('done');window.setTimeout(()=>splash.remove(),650);}}));
