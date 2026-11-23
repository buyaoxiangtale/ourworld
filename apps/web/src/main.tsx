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
import './globe-entrance.css';
import { App } from './App';
import {startFrontendUpdates} from './frontend-updates';
function WebRoot() {
 React.useLayoutEffect(()=>{
  document.getElementById('pre-starlight')?.remove();
 },[]);
 return <App/>;
}

ReactDOM.createRoot(document.getElementById('root')!).render(<React.StrictMode><WebRoot/></React.StrictMode>);
startFrontendUpdates();
