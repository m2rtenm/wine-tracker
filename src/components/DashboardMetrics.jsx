import React, { useMemo } from 'react';

export default function DashboardMetrics({ wines = [] }) {
  const totalWines = wines.length;

  const topCountry = useMemo(() => {
    const countryCounts = wines.reduce((acc, wine) => {
      const country = wine.country || 'Unknown';
      acc[country] = (acc[country] || 0) + 1;
      return acc;
    }, {});

    const [country, count] = Object.entries(countryCounts).sort((a, b) => b[1] - a[1])[0] || [];
    return country ? `${country} (${count})` : 'None yet';
  }, [wines]);

  return (
    <section className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Total Wines Tasted</p>
          <p className="mt-4 text-4xl font-semibold text-slate-900">{totalWines}</p>
          <p className="mt-2 text-sm text-slate-500">A quick count of all entries in your tracker.</p>
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Top Country</p>
          <p className="mt-4 text-4xl font-semibold text-slate-900">{topCountry}</p>
          <p className="mt-2 text-sm text-slate-500">Country with the most wines in the list.</p>
        </div>
      </div>
    </section>
  );
}
