import { useEffect, useState } from 'react';
import DashboardMetrics from './components/DashboardMetrics';
import WineTable from './components/WineTable';
import AddWineForm from './components/AddWineForm';
import mockWines from './mockWines.json';
import './App.css';

function App() {
  const sortWines = winesToSort => [...(winesToSort || [])]
    .filter(wine => !wine?.isDeleted)
    .sort((a, b) => (b.wineId || '').localeCompare(a.wineId || ''));
  const API_BASE = '/api/wines';

  const [wines, setWines] = useState(sortWines(mockWines));
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWine, setEditingWine] = useState(null);
  const [dataSource, setDataSource] = useState('mock');
  const [loadError, setLoadError] = useState('');

  const readJsonOrThrow = async response => {
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      if (response.status === 413) {
        throw new Error('Image is too large to upload. Please use a smaller image and try again.');
      }
      const message = payload?.message || `Request failed (${response.status})`;
      throw new Error(message);
    }
    return payload;
  };

  useEffect(() => {
    let ignore = false;

    const loadData = async () => {
      try {
        const response = await fetch(API_BASE, { cache: 'no-store' });
        const loaded = await readJsonOrThrow(response);
        if (!Array.isArray(loaded)) {
          throw new Error('API response was not an array');
        }

        if (ignore) return;

        setWines(sortWines(loaded));
        setDataSource('live api');
        setLoadError('');
      } catch (error) {
        console.error('Failed to load wines from API, trying snapshot fallback:', error);
        if (ignore) return;

        try {
          const snapshotResponse = await fetch('/data/wines.json', { cache: 'no-store' });
          if (!snapshotResponse.ok) {
            throw new Error(`Failed to fetch snapshot (${snapshotResponse.status})`, { cause: error });
          }

          const snapshot = await snapshotResponse.json();
          if (!Array.isArray(snapshot)) {
            throw new Error('Snapshot response was not an array', { cause: error });
          }

          setWines(sortWines(snapshot));
          setDataSource('deployed snapshot');
          setLoadError('Live API is unavailable, showing deployed snapshot data.');
        } catch (snapshotError) {
          console.error('Failed to load snapshot fallback:', snapshotError);
          setDataSource('mock');
          setLoadError('Could not read live API or snapshot, showing sample data.');
        }
      }
    };

    loadData();

    return () => {
      ignore = true;
    };
  }, []);

  const handleSaveWine = async (payload, { isEditing }) => {
    const endpoint = isEditing ? `${API_BASE}/${payload.wineId}` : API_BASE;
    const method = isEditing ? 'PUT' : 'POST';

    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const savedWine = await readJsonOrThrow(response);
    setWines(prev => {
      if (isEditing) {
        return sortWines(prev.map(wine => (wine.wineId === savedWine.wineId ? savedWine : wine)));
      }

      return sortWines([savedWine, ...(prev || [])]);
    });

    setEditingWine(null);
    setIsFormOpen(false);

    return savedWine;
  };

  const handleEditWine = wine => {
    setEditingWine(wine);
    setIsFormOpen(true);
  };

  const handleDeleteWine = async wine => {
    if (!wine?.wineId) return;

    if (window.confirm('Are you sure you want to delete this wine? It will be hidden from the app but kept in storage.')) {
      try {
        const response = await fetch(`${API_BASE}/${wine.wineId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            ...wine,
            isDeleted: true,
            deletedAt: new Date().toISOString(),
          }),
        });

        const savedWine = await readJsonOrThrow(response);
        if (!savedWine?.isDeleted) {
          throw new Error('Soft delete is not available in the deployed API yet. Please deploy the latest backend before deleting entries.');
        }

        setWines(prev => prev.filter(item => item.wineId !== wine.wineId));
      } catch (error) {
        console.error('Failed to delete wine:', error);
        window.alert(error?.message || 'Failed to delete wine.');
      }
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
              <p className="mt-2 text-xs text-slate-500">
                Data source: {dataSource === 'live api' ? 'Live API' : dataSource === 'deployed snapshot' ? 'Deployed data snapshot' : 'Sample data'}
              </p>
              {loadError && <p className="mt-1 text-xs text-amber-700">{loadError}</p>}
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
        key={`${isFormOpen ? 'open' : 'closed'}-${editingWine?.wineId || 'new'}`}
        isOpen={isFormOpen}
        onClose={handleCloseForm}
        onSave={handleSaveWine}
        initialWine={editingWine}
        existingWines={wines}
      />
    </div>
  );
}

export default App;
