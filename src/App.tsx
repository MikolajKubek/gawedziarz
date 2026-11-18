import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { EntityList } from './pages/EntityList';
import { EntityPage } from './pages/EntityPage';
import { Home } from './pages/Home';
import { MapView, MapsIndex } from './pages/Maps';
import { StoryGraphPage } from './pages/StoryGraph';
import { VaultProvider, useVault } from './store';

function Shell() {
  const { error } = useVault();
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {error && <div className="error-banner">Cannot reach the API (is it running?) — {error}</div>}
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/story" element={<StoryGraphPage />} />
          <Route path="/story/:id" element={<StoryGraphPage />} />
          <Route path="/maps" element={<MapsIndex />} />
          <Route path="/maps/:id" element={<MapView />} />
          <Route path="/:route" element={<EntityList />} />
          <Route path="/:route/:id" element={<EntityPage />} />
        </Routes>
      </main>
    </div>
  );
}

export function App() {
  return (
    <BrowserRouter>
      <VaultProvider>
        <Shell />
      </VaultProvider>
    </BrowserRouter>
  );
}
