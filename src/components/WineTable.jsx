import React, { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table';

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

export default function WineTable({ wines = [], onEdit, onDelete }) {
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedMembers, setSelectedMembers] = useState(new Set());

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
  };

  const formatTimestamp = timestamp => {
    const date = new Date(timestamp);
    return date.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
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
            <span className="text-slate-400">No image</span>
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
        accessorKey: 'timestamp',
        header: 'Tasted',
        cell: info => formatTimestamp(info.getValue()),
      },
      {
        accessorKey: 'wineName',
        header: 'Wine Name',
        cell: info => {
          const wineName = info.getValue();
          const imageUrl = info.row.original.imageUrl;
          return imageUrl ? (
            <button
              type="button"
              onClick={() => openImageModal(imageUrl)}
              className="text-left font-medium text-indigo-600 transition hover:text-indigo-800 hover:underline"
            >
              {wineName}
            </button>
          ) : (
            wineName
          );
        },
      },
      {
        accessorKey: 'country',
        header: 'Country',
      },
      {
        accessorKey: 'closureType',
        header: 'Closure',
      },
      {
        id: 'abv',
        accessorFn: row => row.abv ?? row.vol ?? null,
        header: 'ABV',
        cell: info => {
          const value = info.getValue();
          return value !== null && value !== undefined ? `${value}%` : '-';
        },
      },
      {
        accessorKey: 'groupAverage',
        header: 'Group Avg',
        cell: info => {
          const value = info.getValue();
          return value !== null && value !== undefined ? value : '-';
        },
      },
      ...memberKeys.map(member => ({
        id: `memberRatings.${member}`,
        accessorFn: row => row.memberRatings?.[member] ?? null,
        header: member,
        cell: info => {
          const value = info.getValue();
          return value !== null && value !== undefined ? value : '-';
        },
      })),
      {
        id: 'actions',
        header: 'Actions',
        cell: info => {
          const wine = info.row.original;
          return (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => onEdit(wine)}
                className="inline-flex items-center rounded-lg bg-amber-100 px-2 py-1 text-xs font-medium text-amber-700 transition hover:bg-amber-200"
                title="Edit"
              >
                Edit
              </button>
              <button
                type="button"
                onClick={() => onDelete(wine.wineId)}
                className="inline-flex items-center rounded-lg bg-red-100 px-2 py-1 text-xs font-medium text-red-700 transition hover:bg-red-200"
                title="Delete"
              >
                Delete
              </button>
            </div>
          );
        },
      },
    ],
    [memberKeys, onEdit, onDelete]
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
        const selectedMember = [...selectedMembers][0];
        const ranked = result.map(wine => ({
          wine,
          memberRating: wine.memberRatings?.[selectedMember] ?? 0,
        }));
        
        // Sort by member rating descending
        ranked.sort((a, b) => b.memberRating - a.memberRating);
        
        // Add rank info to each wine for highlighting
        result = ranked.map((item, index) => {
          const topRank = index < 5 ? (index < 3 ? 'top3' : 'top5') : null;
          return { ...item.wine, _topRank: topRank, _memberRating: item.memberRating };
        });
      } else {
        // Multiple members: just filter to wines that have ratings from selected members
        result = result.filter(wine => {
          return [...selectedMembers].some(member => {
            const rating = wine.memberRatings?.[member];
            return rating !== null && rating !== undefined;
          });
        });
      }
    }

    return result;
  }, [search, wines, memberKeys, selectedMembers]);

  const table = useReactTable({
    data: filteredData,
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
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-slate-900">Wine Records</h2>
              <p className="mt-1 text-xs text-slate-500 sm:text-sm">Search, sort, and browse your tasting history. Click on images or wine names to view bottles.</p>
            </div>
            <input
              type="search"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search all columns..."
              className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:bg-white sm:px-4 sm:py-3 md:w-80"
            />
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
                  onClick={() => setSelectedMembers(new Set())}
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
            {table.getRowModel().rows.map(row => {
              const bgColor = row.original._topRank ? 'bg-amber-100' : dateToBackgroundMap[row.original.tastedDate];
              return (
                <tr key={row.id} className={`${bgColor} hover:opacity-80`}>
                  {row.getVisibleCells().map(cell => (
                    <td key={cell.id} className="whitespace-nowrap px-2 py-2 align-top text-slate-700 sm:px-4 sm:py-3">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

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
    </div>
  );
}

