import { useState } from 'react';
import DashboardMetrics from './components/DashboardMetrics';
import WineTable from './components/WineTable';
import AddWineForm from './components/AddWineForm';
import mockWines from './mockWines.json';
import './App.css';

function App() {
  const sortWines = winesToSort => [...winesToSort].sort((a, b) => b.wineId.localeCompare(a.wineId));

  const [wines, setWines] = useState(sortWines(mockWines));
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWine, setEditingWine] = useState(null);

  const handleAddWine = newWine => {
    setWines(prev => sortWines([newWine, ...(prev || [])]));
    setIsFormOpen(false);
  };

  const handleEditWine = wine => {
    setEditingWine(wine);
    setIsFormOpen(true);
  };

  const handleUpdateWine = updatedWine => {
    setWines(prev => sortWines(prev.map(wine => wine.wineId === updatedWine.wineId ? updatedWine : wine)));
    setEditingWine(null);
    setIsFormOpen(false);
  };

  const handleDeleteWine = wineId => {
    if (window.confirm('Are you sure you want to delete this wine?')) {
      setWines(prev => prev.filter(wine => wine.wineId !== wineId));
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingWine(null);
  };

  return (
    <div className="min-h-screen bg-slate-100 px-4 py-6 sm:px-6 lg:px-8">
      <div className="mx-auto w-full max-w-7xl space-y-8">
        <header className="rounded-3xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Wine Tracker</p>
              <h1 className="mt-2 text-3xl font-semibold text-slate-900">Tasting Dashboard</h1>
              <p className="mt-2 max-w-2xl text-sm text-slate-600">Review tasting metrics, manage your collection, and upload new entries with the form.</p>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingWine(null);
                setIsFormOpen(true);
              }}
              className="inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
            >
              Add Wine
            </button>
          </div>
        </header>

        <DashboardMetrics wines={wines} />

        <WineTable wines={wines} onEdit={handleEditWine} onDelete={handleDeleteWine} />
      </div>

      <AddWineForm
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        onSave={editingWine ? handleUpdateWine : handleAddWine}
        initialWine={editingWine}
        existingWines={wines}
      />
    </div>
  );
}

export default App;
