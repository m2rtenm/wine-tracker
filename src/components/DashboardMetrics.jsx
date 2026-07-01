import { useMemo, useState } from 'react';
import { getCountryFlag } from '../data/countries';

const REQUIRED_TASTER_COUNT = 5;

const formatDate = iso => {
  if (!iso) return '-';
  const [year, month, day] = iso.split('-');
  return `${day}.${month}.${year}`;
};

const formatGroupAverage = value => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '-';
  return numeric.toFixed(2);
};

const countMemberRatings = memberRatings => Object.values(memberRatings || {}).filter(value => value !== null && value !== undefined && value !== '').length;

export default function DashboardMetrics({ wines = [], onEdit }) {
  const totalWines = wines.length;
  const [detailWine, setDetailWine] = useState(null);
  const [requiredTasterCount, setRequiredTasterCount] = useState(REQUIRED_TASTER_COUNT);

  const topCountry = useMemo(() => {
    const countryCounts = wines.reduce((acc, wine) => {
      const country = wine.country || 'Unknown';
      acc[country] = (acc[country] || 0) + 1;
      return acc;
    }, {});

    const [country, count] = Object.entries(countryCounts).sort((a, b) => b[1] - a[1])[0] || [];
    return country ? `${country} (${count})` : 'None yet';
  }, [wines]);

  const maxTasterCount = useMemo(() => wines.reduce((max, wine) => {
    const count = countMemberRatings(wine.memberRatings);
    return Math.max(max, count);
  }, 0), [wines]);

  const thresholdOptions = useMemo(() => {
    const upperBound = Math.max(REQUIRED_TASTER_COUNT, maxTasterCount, 1);
    return Array.from({ length: upperBound }, (_, idx) => idx + 1);
  }, [maxTasterCount]);

  const topConsensusWines = useMemo(() => wines
    .filter(wine => countMemberRatings(wine.memberRatings) >= requiredTasterCount)
    .sort((a, b) => {
      const avgDiff = Number(b.groupAverage || 0) - Number(a.groupAverage || 0);
      if (avgDiff !== 0) return avgDiff;
      return (b.wineId || '').localeCompare(a.wineId || '');
    })
    .slice(0, 3), [wines, requiredTasterCount]);

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-2 gap-3 md:gap-4">
        <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Total Wines Tasted</p>
          <p className="mt-4 text-4xl font-semibold text-slate-900">{totalWines}</p>
        </div>

        <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
          <p className="text-sm font-semibold uppercase tracking-[0.24em] text-slate-500">Top Country</p>
          <p className="mt-4 text-4xl font-semibold text-slate-900">{topCountry}</p>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="text-lg font-semibold text-slate-900">Top 3 Wines Tasted By {requiredTasterCount}+ Members</h3>
            <p className="text-sm text-slate-500">Ranked by group average. Click image for details.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-600">
            Min tasters
            <select
              value={requiredTasterCount}
              onChange={event => setRequiredTasterCount(Number(event.target.value))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 outline-none transition focus:border-indigo-500"
            >
              {thresholdOptions.map(count => (
                <option key={count} value={count}>{count}</option>
              ))}
            </select>
          </label>
        </div>

        {topConsensusWines.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">No wines yet where at least {requiredTasterCount} members have submitted ratings.</p>
        ) : (
          <div className="mt-4 grid grid-cols-3 gap-2 sm:gap-4">
            {topConsensusWines.map((wine, index) => {
              const tasterCount = countMemberRatings(wine.memberRatings);
              return (
                <article key={wine.wineId} className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-50">
                  <button
                    type="button"
                    onClick={() => setDetailWine(wine)}
                    className="block w-full"
                  >
                    {wine.imageUrl ? (
                      <img src={wine.imageUrl} alt={wine.wineName || 'Wine bottle'} className="h-28 w-full object-cover sm:h-44" />
                    ) : (
                      <div className="flex h-28 w-full items-center justify-center bg-slate-200 text-xs font-medium text-slate-500 sm:h-44 sm:text-sm">
                        No image
                      </div>
                    )}
                  </button>
                  <div className="space-y-1 px-2 py-2 sm:px-4 sm:py-3">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-indigo-600 sm:text-xs">#{index + 1}</p>
                    <p className="line-clamp-2 text-xs font-semibold text-slate-900 sm:text-sm">{wine.wineName || '-'}</p>
                    <p className="text-[10px] text-slate-600 sm:text-xs">{wine.country || '-'} • Avg {formatGroupAverage(wine.groupAverage)} • {tasterCount} tasters</p>
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </div>

      {detailWine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
          <div className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-3xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">{detailWine.wineName}</h3>
              <button
                type="button"
                onClick={() => setDetailWine(null)}
                className="rounded-full bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200"
              >
                <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="space-y-4 px-6 py-5">
              {detailWine.imageUrl && (
                <img src={detailWine.imageUrl} alt="Wine bottle" className="mx-auto h-48 w-auto rounded-2xl border border-slate-100 object-contain" />
              )}
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <dt className="font-medium text-slate-500">Tasted</dt>
                <dd className="text-slate-900">{formatDate(detailWine.tastedDate)}</dd>
                <dt className="font-medium text-slate-500">Country</dt>
                <dd className="text-slate-900">{getCountryFlag(detailWine.country)} {detailWine.country || '-'}</dd>
                <dt className="font-medium text-slate-500">Berry / Grape</dt>
                <dd className="text-slate-900">{detailWine.berry || '-'}</dd>
                <dt className="font-medium text-slate-500">Drink Type</dt>
                <dd className="text-slate-900">{detailWine.drinkType || 'Wine'}</dd>
                <dt className="font-medium text-slate-500">Closure</dt>
                <dd className="text-slate-900">{detailWine.closureType || '-'}</dd>
                <dt className="font-medium text-slate-500">ABV</dt>
                <dd className="text-slate-900">{(detailWine.vol || detailWine.abv) ? `${detailWine.vol ?? detailWine.abv}%` : '-'}</dd>
                <dt className="font-medium text-slate-500">Group Avg</dt>
                <dd className="font-semibold text-slate-900">{formatGroupAverage(detailWine.groupAverage)}</dd>
              </dl>
              {detailWine.comment && (
                <div>
                  <p className="mb-1 text-sm font-medium text-slate-500">Tasting Notes</p>
                  <p className="text-sm leading-relaxed text-slate-900">{detailWine.comment}</p>
                </div>
              )}
              {detailWine.memberRatings && Object.keys(detailWine.memberRatings).length > 0 && (
                <div>
                  <p className="mb-2 text-sm font-medium text-slate-500">Member Ratings</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(detailWine.memberRatings).map(([member, rating]) => (
                      <div key={member} className="flex justify-between rounded-xl bg-slate-50 px-3 py-2 text-sm">
                        <span className="text-slate-700">{member}</span>
                        <span className="font-semibold text-slate-900">{rating}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setDetailWine(null);
                    onEdit(detailWine);
                  }}
                  className="rounded-xl bg-amber-100 px-4 py-2 text-sm font-medium text-amber-700 hover:bg-amber-200"
                >
                  Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDetailWine(null)}
                  className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
