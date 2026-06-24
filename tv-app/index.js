import { registerRootComponent } from 'expo';
import { LogBox } from 'react-native';
import App from './App';

// Geliştirme uyarı şeridini sustur (mimari deprecation vb. — işlevsel değil).
LogBox.ignoreAllLogs(true);

// Expo entry: AppRegistry.registerComponent'i de doğru appName ile yapar.
registerRootComponent(App);
