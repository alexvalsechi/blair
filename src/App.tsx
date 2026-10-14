import { Overlay } from './components/Overlay';
import { Settings } from './components/Settings';

export function App() {
  const view = new URLSearchParams(window.location.search).get('view') ?? 'overlay';
  document.body.dataset.view = view;
  return view === 'settings' ? <Settings /> : <Overlay />;
}
