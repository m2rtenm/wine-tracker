import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table';
import { getCountryFlag } from '../data/countries';

const PAGE_SIZE = 30;

const BACKGROUND_COLORS = [
  'bg-blue-50',
  'bg-purple-50',
  'bg-green-50',
  'bg-pink-50',
  'bg-yellow-50',
  'bg-indigo-50',
  'bg-rose-50',
  'bg-cyan-50',
];

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

const hasMemberRating = rating => rating !== null && rating !== undefined && rating !== '';

export default function WineTable({ wines = [], onEdit, onDelete, onRestoreDeleted }) {
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState(new Set());
  const [detailWine, setDetailWine] = useState(null);
  const [page, setPage] = useState(0);
  const selectedMember = selectedMembers.size === 1 ? [...selectedMembers][0] : null;

  const memberKeys = useMemo(() => {
    const keys = new Set();
    wines.forEach(wine => {
      if (wine.memberRatings && typeof wine.memberRatings === 'object') {
        Object.keys(wine.memberRatings).forEach(key => keys.add(key));
      }
    });
    return [...keys].sort();
  }, [wines]);

  const dateToBackgroundMap = useMemo(() => {
    const map = {};
    const uniqueDates = [...new Set(wines.map(w => w.tastedDate))].sort().reverse();
    uniqueDates.forEach((date, index) => {
      map[date] = BACKGROUND_COLORS[index % BACKGROUND_COLORS.length];
    });
    return map;
  }, [wines]);

  const openImageModal = imageUrl => {
    setSelectedImage(imageUrl);
    setIsModalOpen(true);
  };

  const closeImageModal = () => {
    setIsModalOpen(false);
    setSelectedImage(null);
  };

  const toggleMemberFilter = member => {
    const newSet = new Set(selectedMembers);
    if (newSet.has(member)) {
      newSet.delete(member);
    } else {
      newSet.add(member);
    }
    setSelectedMembers(newSet);
    setSorting([]);
    setPage(0);
  };

  const columns = useMemo(
    () => [
      {
        id: 'image',
        header: 'Image',
        accessorKey: 'imageUrl',
        cell: info => {
          const imageUrl = info.getValue();
          return imageUrl ? (
            <button
              type="button"
              onClick={() => openImageModal(imageUrl)}
              className="h-12 w-12 overflow-hidden rounded-lg border border-slate-200 transition hover:border-indigo-500 hover:shadow-md"
            >
              <img src={imageUrl} alt="Wine bottle" className="h-full w-full object-cover" />
            </button>
          ) : (
            <span className="text-slate-400">-</span>
          );
        },
      },
      {
        accessorKey: 'wineName',
        header: 'Wine Name',
        cell: info => {
          const wineName = info.getValue();
          const imageUrl = info.row.original.imageUrl;
          const topRank = info.row.original._topRank;
          const topRankText = topRank === 'top3' ? 'Top 3' : topRank === 'top5' ? 'Top 5' : null;
          return (
            <div>
              {imageUrl ? (
                <button
                  type="button"
                  onClick={() => openImageModal(imageUrl)}
                  className="text-left font-medium text-indigo-600 transition hover:text-indigo-800 hover:underline"
                >
                  {wineName}
                </button>
              ) : (
                <span className="font-medium text-slate-900">{wineName}</span>
              )}
              {topRankText && (
                <div className="mt-1">
                  <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                    topRankText === 'Top 3'
                      ? 'bg-amber-400 text-amber-900'
                      : 'bg-amber-300 text-amber-800'
                  }`}>
                    {topRankText}
                  </span>
                </div>
              )}
            </div>
          );
        },
      },
      {
        accessorKey: 'country',
        header: 'Country',
        cell: info => {
          const country = info.getValue();
          if (!country) return <span className="text-slate-400">-</span>;
          const flag = getCountryFlag(country);
          return <span>{flag ? `${flag} ` : ''}{country}</span>;
        },
      },
      {
        id: 'score',
        accessorFn: row => row._displayAverage,
        header: selectedMember ? `${selectedMember} Score` : 'Group Avg',
        cell: info => formatGroupAverage(info.row.original._displayAverage),
      },
      {
        accessorKey: 'tastedDate',
        header: 'Tasted',
        cell: info => formatDate(info.getValue()),
      },
      {
        id: 'actions',
        header: 'Actions',
        cell: info => {
          const wine = info.row.original;
          return (
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setDetailWine(wine)}
                className="inline-flex items-center rounded-lg bg-indigo-100 px-2 py-1 text-xs font-medium text-indigo-700 transition hover:bg-indigo-200"
              >
                Details
              </button>
              <button
                type="button"
                onClick={() => onEdit(wine)}
                className="inline-flex items-center rounded-lg bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-200"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(wine)}
                className="inline-flex items-center rounded-lg bg-red-100 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-200"
              >
                Delete
              </button>
            </div>
          );
        },
      },
    ],
    [onEdit, onDelete, selectedMember]
  );

  const filteredData = useMemo(() => {
    let result = wines;

    // Search filter
    const query = search.trim().toLowerCase();
    if (query) {
      result = result.filter(wine => {
        const rowValues = [
          wine.tastedDate,
          wine.wineName,
          wine.country,
          wine.berry,
          wine.drinkType,
          wine.closureType,
          String(wine.abv ?? wine.vol ?? ''),
          String(wine.groupAverage ?? ''),
          ...memberKeys.map(member => String(wine.memberRatings?.[member] ?? '')),
        ];
        return rowValues.some(value => value.toLowerCase().includes(query));
      });
    }

    // Member filter with ranking
    if (selectedMembers.size > 0) {
      // If only one member selected, rank by their rating
      if (selectedMembers.size === 1) {
        const focusedMember = [...selectedMembers][0];
        const ranked = result.map(wine => ({
          wine,
          memberRating: wine.memberRatings?.[focusedMember],
        }))
          .filter(item => hasMemberRating(item.memberRating))
          .map(item => ({ ...item, memberRating: Number(item.memberRating) }))
          .filter(item => !Number.isNaN(item.memberRating));

        // Sort by member rating descending
        ranked.sort((a, b) => b.memberRating - a.memberRating);

        // Add rank info to each wine for highlighting
        result = ranked.map((item, index) => {
          const topRank = index < 5 ? (index < 3 ? 'top3' : 'top5') : null;
          return {
            ...item.wine,
            _topRank: topRank,
            _memberRating: item.memberRating,
            _displayAverage: item.memberRating,
          };
        });
      } else {
        // Multiple members: just filter to wines that have ratings from selected members
        result = result.filter(wine => {
          return [...selectedMembers].some(member => {
            const rating = wine.memberRatings?.[member];
            return hasMemberRating(rating);
          });
        }).map(wine => ({
          ...wine,
          _displayAverage: wine.groupAverage,
        }));
      }
    } else {
      result = result.map(wine => ({
        ...wine,
        _displayAverage: wine.groupAverage,
      }));
    }

    return result;
  }, [search, wines, memberKeys, selectedMembers]);

  const totalPages = Math.max(1, Math.ceil(filteredData.length / PAGE_SIZE));

  const pagedData = useMemo(() => {
    const start = page * PAGE_SIZE;
    return filteredData.slice(start, start + PAGE_SIZE);
  }, [filteredData, page]);

  const table = useReactTable({
    data: pagedData,
    columns,
    state: {
      sorting,
    },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-6">
      {/* Search and Filters */}
      <div className="rounded-3xl border border-slate-200/70 bg-white p-4 shadow-sm sm:p-6">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
            <div className="flex-1 md:max-w-2xl">
              <h2 className="text-xl font-semibold text-slate-900">Wine Records</h2>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">Search, sort, and browse your tasting history. Click on images or wine names to view bottles.</p>
            </div>
            <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end md:w-auto md:flex-none">
              <button
                type="button"
                onClick={onRestoreDeleted}
                className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm font-medium text-slate-700 transition hover:bg-slate-100"
              >
                Restore Deleted
              </button>
              <input
                type="search"
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                placeholder="Search all columns..."
                className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:bg-white sm:px-4 sm:py-3 md:w-80"
              />
            </div>
          </div>

          {/* Member Filter */}
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-2">
              <span className="text-xs font-medium text-slate-600 sm:text-sm">Filter by member:</span>
              {memberKeys.map(member => (
                <button
                  key={member}
                  type="button"
                  onClick={() => toggleMemberFilter(member)}
                  className={`rounded-full px-3 py-1 text-xs font-medium transition ${
                    selectedMembers.has(member)
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {member}
                </button>
              ))}
              {selectedMembers.size > 0 && (
                <button
                  type="button"
                  onClick={() => { setSelectedMembers(new Set()); setPage(0); }}
                  className="rounded-full px-3 py-1 text-xs font-medium text-slate-600 hover:text-slate-900"
                >
                  Clear
                </button>
              )}
            </div>
            {selectedMembers.size === 1 && (
              <p className="text-xs text-slate-500 sm:text-sm">
                Top 3 wines <span className="inline-block rounded-full px-1 py-0.5 bg-amber-400 text-amber-900 text-xs font-bold mx-1">Top 3</span> 
                are highlighted by {[...selectedMembers][0]}'s ratings and shown first.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full divide-y divide-slate-200 text-xs sm:text-sm">
          <thead className="bg-slate-50 text-slate-700">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className="whitespace-nowrap px-2 py-2 text-left font-semibold sm:px-4 sm:py-3"
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-1 text-left text-xs font-semibold text-slate-700 sm:gap-2 sm:text-sm"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        <span className="truncate">{flexRender(header.column.columnDef.header, header.getContext())}</span>
                        <span className="text-slate-400">
                          {header.column.getIsSorted() === 'asc'
                            ? '↑'
                            : header.column.getIsSorted() === 'desc'
                            ? '↓'
                            : '↕'}
                        </span>
                      </button>
                    )}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody className="divide-y divide-slate-200">
            {table.getRowModel().rows.length === 0 ? (
              <tr>
                <td colSpan={columns.length} className="px-4 py-12 text-center text-sm text-slate-400">
                  No wines found.
                </td>
              </tr>
            ) : (
              table.getRowModel().rows.map(row => {
                const bgColor = row.original._topRank ? 'bg-amber-100' : dateToBackgroundMap[row.original.tastedDate];
                return (
                  <tr key={row.id} className={`${bgColor} hover:opacity-80`}>
                    {row.getVisibleCells().map(cell => (
                      <td key={cell.id} className="whitespace-nowrap px-2 py-2 align-middle text-slate-700 sm:px-4 sm:py-3">
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </td>
                    ))}
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-sm">
          <button
            type="button"
            onClick={() => setPage(p => Math.max(0, p - 1))}
            disabled={page === 0}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:opacity-40"
          >
            &larr; Previous
          </button>
          <span className="text-sm text-slate-600">
            Page {page + 1} of {totalPages} &mdash; {filteredData.length} wines
          </span>
          <button
            type="button"
            onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))}
            disabled={page >= totalPages - 1}
            className="rounded-xl bg-slate-100 px-4 py-2 text-sm font-medium text-slate-700 transition hover:bg-slate-200 disabled:opacity-40"
          >
            Next &rarr;
          </button>
        </div>
      )}

      {/* Image Modal */}
      {isModalOpen && selectedImage && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
          <div className="relative flex max-h-[90vh] max-w-3xl flex-col rounded-3xl bg-white shadow-2xl">
            <button
              onClick={closeImageModal}
              className="absolute right-4 top-4 rounded-full bg-slate-100 p-2 text-slate-700 transition hover:bg-slate-200"
            >
              <svg className="h-6 w-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <div className="flex flex-1 items-center justify-center overflow-auto p-4">
              <img src={selectedImage} alt="Wine bottle" className="max-h-full max-w-full object-contain" />
            </div>
          </div>
        </div>
      )}

      {/* Details Modal */}
      {detailWine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/80 p-4">
          <div className="relative w-full max-w-lg overflow-y-auto max-h-[90vh] rounded-3xl bg-white shadow-2xl">
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
            <div className="px-6 py-5 space-y-4">
              {detailWine.imageUrl && (
                <img src={detailWine.imageUrl} alt="Wine bottle" className="mx-auto h-48 w-auto object-contain rounded-2xl border border-slate-100" />
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
                  onClick={() => { setDetailWine(null); onEdit(detailWine); }}
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
    </div>
  );
}

