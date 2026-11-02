import { createApp } from 'vue'
import App from './App.vue'
import { installHoverLift, installPressFeedback, installRipple } from './composables/motion'
import './styles/tokens.css'
import './styles/base.css'
import './styles/materials.css'
import './styles/components.css'
import './styles/components-2.css'
import './styles/instruments.css'
import './styles/instruments-2.css'
import './styles/instruments-3.css'
import './styles/layout.css'
import './styles/pages.css'
import './styles/pages-2.css'
import './styles/rewick.css'
import './composables/appearance'
createApp(App).mount('#root')
installPressFeedback()
installHoverLift()
installRipple()
