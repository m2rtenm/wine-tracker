import { useEffect, useState } from 'react';
import { useAuth } from 'react-oidc-context';
import DashboardMetrics from './components/DashboardMetrics';
import WineTable from './components/WineTable';
import AddWineForm from './components/AddWineForm';
import { buildLogoutUrl } from './auth/authConfig';
import mockWines from './mockWines.json';
import './App.css';

function App() {
  const auth = useAuth();
  const sortWines = winesToSort => [...(winesToSort || [])]
    .filter(wine => !wine?.isDeleted)
    .sort((a, b) => (b.wineId || '').localeCompare(a.wineId || ''));
  const API_BASE = '/api/wines';

  const [wines, setWines] = useState([]);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingWine, setEditingWine] = useState(null);
  const [dataSource, setDataSource] = useState('loading');
  const [loadError, setLoadError] = useState('');
  const [isDataLoading, setIsDataLoading] = useState(true);

  // Bearer token attached to every API request; validated by the API Gateway
  // JWT authorizer. Read fresh on each call so token refreshes are picked up.
  const authHeaders = () => {
    const token = auth.user?.access_token;
    return token ? { Authorization: `Bearer ${token}` } : {};
  };

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
    if (!auth.isAuthenticated) return undefined;

    let ignore = false;

    const loadData = async () => {
      setIsDataLoading(true);
      try {
        const response = await fetch(API_BASE, { cache: 'no-store', headers: { ...authHeaders() } });
        const loaded = await readJsonOrThrow(response);
        if (!Array.isArray(loaded)) {
          throw new Error('API response was not an array');
        }

        if (ignore) return;

        setWines(sortWines(loaded));
        setDataSource('live api');
        setLoadError('');
      } catch (error) {
        console.error('Failed to load wines from API:', error);
        if (ignore) return;

        setWines(sortWines(mockWines));
        setDataSource('mock');
        setLoadError('Could not reach the API, showing sample data.');
      } finally {
        if (ignore) return;
        setIsDataLoading(false);
      }
    };

    loadData();

    return () => {
      ignore = true;
    };
    // authHeaders reads the token fresh at call time; only reload when the
    // authenticated state changes, not on every token refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth.isAuthenticated]);

  const handleSaveWine = async (payload, { isEditing }) => {
    const endpoint = isEditing ? `${API_BASE}/${payload.wineId}` : API_BASE;
    const method = isEditing ? 'PUT' : 'POST';

    const response = await fetch(endpoint, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders(),
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
            ...authHeaders(),
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

  const handleRestoreDeleted = async () => {
    const rawWineId = window.prompt('Enter wine ID to restore (for example: 20260701-1):');
    const wineId = (rawWineId || '').trim();
    if (!wineId) return;

    try {
      const response = await fetch(`${API_BASE}/${encodeURIComponent(wineId)}/restore`, {
        method: 'POST',
        headers: { ...authHeaders() },
      });

      const restoredWine = await readJsonOrThrow(response);
      if (restoredWine?.isDeleted) {
        throw new Error('Wine restore failed: record is still marked as deleted.');
      }

      setWines(prev => sortWines([restoredWine, ...(prev || []).filter(item => item.wineId !== restoredWine.wineId)]));
      window.alert(`Wine ${wineId} restored.`);
    } catch (error) {
      console.error('Failed to restore wine:', error);
      window.alert(error?.message || 'Failed to restore wine.');
    }
  };

  const handleCloseForm = () => {
    setIsFormOpen(false);
    setEditingWine(null);
  };

  const handleSignOut = async () => {
    await auth.removeUser();
    window.location.href = buildLogoutUrl();
  };

  const userEmail = auth.user?.profile?.email;

  if (auth.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
        Loading…
      </div>
    );
  }

  if (auth.error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <h1 className="text-xl font-semibold text-slate-900">Sign-in failed</h1>
          <p className="mt-2 text-sm text-slate-600">{auth.error.message}</p>
          <button
            type="button"
            onClick={() => auth.signinRedirect()}
            className="mt-6 inline-flex items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Try again
          </button>
        </div>
      </div>
    );
  }

  if (!auth.isAuthenticated) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 px-4">
        <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Wine Tracker</p>
          <h1 className="mt-2 text-2xl font-semibold text-slate-900">Tasting Dashboard</h1>
          <p className="mt-3 text-sm text-slate-600">Sign in with your Google account to view and manage the collection.</p>
          <button
            type="button"
            onClick={() => auth.signinRedirect()}
            className="mt-6 inline-flex w-full items-center justify-center rounded-2xl bg-indigo-600 px-5 py-3 text-sm font-semibold text-white transition hover:bg-indigo-700"
          >
            Sign in with Google
          </button>
        </div>
      </div>
    );
  }

  if (isDataLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-100 text-sm text-slate-600">
        Loading wines…
      </div>
    );
  }

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
                Data source: {dataSource === 'live api' ? 'Live API' : 'Sample data'}
              </p>
              {loadError && <p className="mt-1 text-xs text-amber-700">{loadError}</p>}
            </div>
            <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
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
              <div className="flex items-center justify-between gap-3 sm:justify-start">
                {userEmail && <span className="text-xs text-slate-500">{userEmail}</span>}
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="inline-flex items-center justify-center rounded-2xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
                >
                  Sign out
                </button>
              </div>
            </div>
          </div>
        </header>

        <DashboardMetrics wines={wines} onEdit={handleEditWine} />

        <WineTable
          wines={wines}
          onEdit={handleEditWine}
          onDelete={handleDeleteWine}
          onRestoreDeleted={handleRestoreDeleted}
        />
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
