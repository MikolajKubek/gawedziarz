import { HashRouter, Route, Routes } from 'react-router-dom';
import { Sidebar } from './components/Sidebar';
import { DialogHost } from './dialogs';
import { EntityList } from './pages/EntityList';
import { EntityPage } from './pages/EntityPage';
import { Home } from './pages/Home';
import { MapView, MapsIndex } from './pages/Maps';
import { StoryGraphPage } from './pages/StoryGraph';
import { Welcome } from './pages/Welcome';
import { ProjectProvider, useProject } from './project';
import { VaultProvider, useVault } from './store';

function Shell() {
  const { error } = useVault();
  return (
    <div className="app">
      <Sidebar />
      <main className="main">
        {error && <div className="error-banner">Could not read the project — {error}</div>}
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

function Root() {
  const { project, booting } = useProject();
  if (booting) return <div className="welcome" />;
  if (!project) return <Welcome />;
  return (
    <VaultProvider key={project.path}>
      <Shell />
    </VaultProvider>
  );
}

export function App() {
  return (
    <HashRouter>
      <ProjectProvider>
        <Root />
        <DialogHost />
      </ProjectProvider>
    </HashRouter>
  );
}
