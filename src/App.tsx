/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Home } from './pages/Home';
import { Dashboard } from './pages/Dashboard';
import { Players } from './pages/Players';
import { Teams } from './pages/Teams';
import { Rounds } from './pages/Rounds';
import { Standings } from './pages/Standings';
import { TvDisplay } from './pages/TvDisplay';

export default function App() {
  return (
    <Router>
      <Routes>
        <Route path="/tv" element={<TvDisplay />} />
        <Route path="/*" element={
          <Layout>
            <Routes>
              <Route path="/" element={<Home />} />
              <Route path="/dashboard" element={<Dashboard />} />
              <Route path="/players" element={<Players />} />
              <Route path="/teams" element={<Teams />} />
              <Route path="/rounds" element={<Rounds />} />
              <Route path="/standings" element={<Standings />} />
            </Routes>
          </Layout>
        } />
      </Routes>
    </Router>
  );
}
