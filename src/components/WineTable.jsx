import React, { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
} from '@tanstack/react-table';

export default function WineTable({ wines = [] }) {
  const [search, setSearch] = useState('');
  const [sorting, setSorting] = useState([]);
  const [selectedImage, setSelectedImage] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const memberKeys = useMemo(() => {
    const keys = new Set();
    wines.forEach(wine => {
      if (wine.memberRatings && typeof wine.memberRatings === 'object') {
        Object.keys(wine.memberRatings).forEach(key => keys.add(key));
      }
    });
    return [...keys];
  }, [wines]);

  const openImageModal = imageUrl => {
    setSelectedImage(imageUrl);
    setIsModalOpen(true);
  };

  const closeImageModal = () => {
    setIsModalOpen(false);
    setSelectedImage(null);
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
              className="relative h-12 w-12 overflow-hidden rounded-lg border border-slate-200 transition hover:border-indigo-500 hover:shadow-md"
            >
              <img src={imageUrl} alt="Wine bottle" className="h-full w-full object-cover" />
            </button>
          ) : (
            <span className="text-slate-400">No image</span>
          );
        },
      },
      {
        accessorKey: 'tastedDate',
        header: 'Tasted Date',
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
    ],
    [memberKeys]
  );

  const filteredData = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return wines;

    return wines.filter(wine => {
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
  }, [search, wines, memberKeys]);

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
      <div className="rounded-3xl border border-slate-200/70 bg-white p-6 shadow-sm">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Wine Records</h2>
            <p className="mt-1 text-sm text-slate-500">Search, sort, and browse your tasting history. Click on images or wine names to view bottles.</p>
          </div>
          <input
            type="search"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search all columns..."
            className="w-full rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-900 shadow-sm outline-none transition focus:border-indigo-500 focus:bg-white md:w-80"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-3xl border border-slate-200 bg-white shadow-sm">
        <table className="min-w-full divide-y divide-slate-200 text-sm">
          <thead className="bg-slate-50 text-slate-700">
            {table.getHeaderGroups().map(headerGroup => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map(header => (
                  <th
                    key={header.id}
                    colSpan={header.colSpan}
                    className="whitespace-nowrap px-4 py-3 text-left font-semibold"
                  >
                    {header.isPlaceholder ? null : (
                      <button
                        type="button"
                        className="flex w-full items-center justify-between gap-2 text-left text-sm font-semibold text-slate-700"
                        onClick={header.column.getToggleSortingHandler()}
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
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
          <tbody className="divide-y divide-slate-200 bg-white">
            {table.getRowModel().rows.map(row => (
              <tr key={row.id} className="hover:bg-slate-50">
                {row.getVisibleCells().map(cell => (
                  <td key={cell.id} className="whitespace-nowrap px-4 py-3 align-top text-slate-700">
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
